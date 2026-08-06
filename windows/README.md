# Insight for Windows

The desktop half of the browser extension. It counts time per app while a study
session is running, and gets blocked apps out of the way while Focus Mode is on.

It adds nothing to the server. It pairs with a token minted at `/devices`, polls
`GET /api/devices/session`, and posts to `POST /api/devices/activity` — the same
two endpoints the extension uses, with app names in the `domain` field.

## What it records, and what it can't

- **Nothing without a running session.** Not recorded and then discarded — the
  timer does not accumulate. `Tracker.Tick` checks this first, before anything
  else happens.
- **App names only.** "Microsoft Word", "Spotify", "Steam". Never window titles,
  never document names. `GetWindowText` is not imported anywhere in this
  project, which is what makes that a fact about the code rather than a promise
  in a README.
- **No encryption key, ever.** What it posts lands in `PendingDeviceData`, which
  the server *can* read, and the student's browser encrypts and deletes on next
  load. That staging table is the weak point of the whole design and this app
  doesn't change it either way.
- **Nothing on disk except the pairing token**, wrapped with DPAPI under the
  current Windows user. The tally lives in memory and is sent every minute, so
  the cost of a crash is a minute and the cost of someone else picking up the
  laptop is nothing.
- **Idle time is not study time.** Ten minutes without a keypress and the clock
  stops, backdated to the last input rather than to the moment we noticed.
  Screen lock, sleep and log-off do the same. A desktop has no equivalent of a
  browser losing focus, so without this a machine left alone with a game on top
  would bill hours nobody was present for.

## Two decisions worth knowing about

**Browsers are skipped entirely.** The extension already counts them. Counting
both would double every minute on the web — and worse, the extension would file
that minute as distracted while this filed it as focused, so the distraction
ratio the insight engine turns on would drift towards nonsense. A student with
no extension installed loses their browser time here, which is a gap rather than
a wrong answer.

**Some apps report their website's name.** Spotify reports `spotify.com`, Steam
reports `steampowered.com`. Focus Mode and the distraction split are both
defined by the student's blocklist, which is a list of hostnames — `normalizeSite`
won't accept anything else — so an app reported as "Spotify" would be
unblockable and permanently counted as focused, whatever the student chose. The
mapping is in `Apps.Aliases` and only covers apps whose hostname is already in a
block category.

**Games are blocked by name.** Each block category in `src/lib/blocklist.ts`
now carries an `apps` list alongside its `sites`, and both go into the one flat
blocklist the server already sends. Nothing in the matcher changed:
`matchesBlocklist` lowercases and compares exactly, so "valorant" matches the
app and can never match a hostname. That is what makes a game blockable at all —
it is its own executable and has no website to match on.

The limit of that: the list is curated, and there are tens of thousands of
games. A student whose particular one is missing adds it under Block something
else in settings, which now accepts an app name as well as a website.

## Build

Needs the .NET 8 SDK. From this folder:

```bash
dotnet publish -c Release
```

The result is one self-contained `Insight.exe` (~68MB) in
`bin/Release/net8.0-windows/win-x64/publish/` — no .NET install on the student's
machine, no installer, no admin rights. That is the only file to hand out; the
`.pdb` beside it is for debugging a crash report and nothing else needs it.

It cross-compiles from macOS and Linux; `EnableWindowsTargeting` in the csproj
is what allows that, and the published exe above was in fact built on a Mac.

SmartScreen shows an "unrecognised app" warning on first run, which the student
clicks through via More info → Run anyway. Code signing (~$100–300/yr) would
remove it and is not planned.

## Test

From this folder, on any machine:

```bash
dotnet run --project tests
```

On Windows the same tests are also in the app itself:

```bash
Insight.exe --self-test
```

The tray app needs a Windows desktop, but the parts that decide what gets
recorded and what gets blocked are pure — and those are exactly the parts where
a bug either records something private or blocks the wrong thing. Same tradeoff
as `extension/logic.test.mjs`.

`tests/` exists because the app targets `net8.0-windows` and so cannot run on a
Mac, which is where it was written: it links the desktop-free source files into
a plain console app. It earned its place on the first run by catching a bug that
welded two words together in an app's name.

## Files

| | |
|---|---|
| `Program.cs` | Entry point, single instance, `--self-test` |
| `Tracker.cs` | The rules: what is counted, when, and what is sent |
| `Apps.cs` | Which process becomes which name, and what matches the blocklist |
| `Native.cs` | The Win32 surface — note what is deliberately absent |
| `ApiClient.cs` | The two endpoints |
| `Config.cs` | Address and token, DPAPI-wrapped |
| `TrayApp.cs` | The icon, the menu, the two questions it answers |
| `PairWindow.cs` | Pairing, with the code verified before it's saved |
| `BlockedWindow.cs` | What a blocked app is replaced with |
| `SelfTest.cs` | The tests |
| `tests/` | The same tests, compiled for the machine you're sitting at |
