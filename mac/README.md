# Insight for macOS

The Mac twin of `windows/`, and the desktop half of the browser extension. It
counts time per app while a study session is running, and closes blocked apps
while Focus Mode is on.

It adds nothing to the server. It pairs with a token minted at `/devices`, polls
`GET /api/devices/session`, and posts to `POST /api/devices/activity`, the same
two endpoints the extension and the Windows app use, with app names in the
`domain` field.

## What it records, and what it can't

- **Nothing without a running session.** Not recorded and then discarded, the
  timer does not accumulate. `Tracker.tick` checks this first, before anything
  else happens.
- **App names only.** "TextEdit", "Spotify", "Steam". Never window titles. On a
  Mac this is enforced by the system rather than by restraint: reading another
  app's window titles requires Accessibility permission, and this app never asks
  for it. If it ever tried, macOS would make you approve it in System Settings
  first, so the absence of that prompt is the proof.
- **No encryption key, ever.** What it posts lands in `PendingDeviceData`, which
  the server *can* read, and your browser encrypts and deletes on next load.
- **Nothing on disk except the pairing token**, in an owner-only file (see
  below for why not the keychain). The tally lives in memory and is
  sent every minute, so the cost of a crash is a minute and the cost of someone
  else picking up the laptop is nothing.
- **Idle time is not study time.** Ten minutes without input and the clock stops,
  backdated to the last keypress rather than to the moment we noticed. Sleep,
  screen lock and fast user switching do the same.

## Two decisions worth knowing about

Both are shared with the Windows app, and `windows/README.md` argues them at
length.

**Browsers are skipped entirely**, because the extension already counts them,
matched here on bundle identifier, which is exact, where the Windows version has
to match executable names and guess a little.

**Some apps report their website's name.** Spotify reports `spotify.com`, Steam
`steampowered.com`, so desktop and web time for the same service land together.
The mapping is `Apps.aliases`, keyed by bundle id, with `Apps.aliasesByName`
catching re-signed builds.

**Everything else is blocked by its own name.** Each block category in
`src/lib/blocklist.ts` carries an `apps` list alongside its `sites`, and both
arrive in the one flat blocklist. The matcher is untouched, exact, lowercased
equality, so "valorant" matches the game and can never match a hostname. A
student whose game isn't on the curated list adds it in settings, which now
takes an app name as well as a website.

## Build

Needs the Swift toolchain, Command Line Tools is enough, Xcode is not required.

```bash
./build-app.sh
```

That produces `dist/Insight.app`: a menu-bar-only app (`LSUIElement`), ad-hoc
signed so it will launch, and about 320KB because AppKit is already on every
Mac. Nothing to install and no admin rights.

**Gatekeeper is stricter than SmartScreen.** Double-clicking an unsigned app
gets refused outright with no way through in the dialog. Right-click the app →
**Open** → **Open** gets past it, once. A downloaded copy also carries a
quarantine flag; `xattr -d com.apple.quarantine Insight.app` clears it. Proper
signing needs a $99/yr Apple Developer account plus notarisation, which is the
same wall that makes iOS impossible for this project.

## Why not the keychain

It was the keychain first, and it had to come out.

macOS binds a keychain item to the exact binary that created it, by code
signature, and an ad-hoc signature is regenerated on every build. Every rebuild
looked like a different program asking for the old one's secret, so macOS put up
a password challenge. Always Allow either failed outright or bought exactly one
build's worth of peace. A student would meet that dialog on every update of a
sideloaded app, and a security prompt that appears routinely is one people learn
to click through, worse than not asking.

The token now lives in `~/Library/Application Support/Insight/config.json`,
owner-only (0600, in a 0700 folder). That is what the Windows build's DPAPI
amounts to in practice: both keep it from other accounts on a shared laptop,
neither protects against the student's own other processes, and nothing
available to an unsigned app would.

What's being guarded is small and revocable on purpose. The token can post
activity and ask whether a session is running. It cannot read anything a student
wrote, that's encrypted with a key this app never has, and revoking it from
Devices kills it instantly.

## Test

```bash
swift run Insight --self-test
```

32 tests over the parts that decide what gets recorded and what gets blocked.
They deliberately mirror `windows/SelfTest.cs` case for case: where the two apps
are meant to agree, the tests should visibly agree too. They earned their keep
on the first run by catching a self-exclusion check that compared `nil == nil`
and swallowed every app without a bundle identifier.

## Files

| | |
|---|---|
| `main.swift` | Entry point, `--self-test`, menu-bar-only activation policy |
| `Tracker.swift` | The rules: what is counted, when, and what is sent |
| `Apps.swift` | Which app becomes which name, and what matches the blocklist |
| `ApiClient.swift` | The two endpoints |
| `Config.swift` | Address in defaults, token in the keychain |
| `AppDelegate.swift` | The menu bar icon, the menu, the two questions it answers |
| `PairWindow.swift` | Pairing, with the code verified before it's saved |
| `BlockedWindow.swift` | What a blocked app is replaced with |
| `Views.swift` | Stack-view builders, nothing is placed at fixed coordinates |
| `SelfTest.swift` | The tests |
