# Insight — handoff

Read this first in a new session. It covers what exists, why it's shaped this
way, and what bit us — most of which is not obvious from the code.

Built by Kapilesh Rajaravisankar and Sahas Raghav Vijayakumar for a Frisco ISD
pilot. Everything runs on free tiers.

---

## Live

| | |
|---|---|
| App | https://insight-study-sleep.vercel.app |
| Repo | github.com/kapileshads-source/insight (private) |
| Hosting | Vercel Hobby, scope `insight21` |
| Database | Neon free tier, AWS us-east-2 |
| Auth | Clerk **development** instance — production needs a domain |
| Email | Resend — only delivers to the developer until a domain exists |
| LLM | Groq free tier |

`npm test` runs 240 tests. `npm run build` regenerates the Prisma client,
**applies pending migrations**, then builds. Each native app has its own suite:
53 on Windows, 52 on Mac, 25 on Android, 16 in the extension.

---

## The one idea that shapes everything

**Student data is encrypted in the browser. The server cannot read it.**

A password derives a key-encryption key, which unwraps a random data key, which
encrypts the payloads. The password never leaves the device, so there is no
reset and no recovery. `src/lib/crypto.ts`.

The rule throughout the schema is **structure is plaintext, content is not**.
Row existence, foreign keys and the timestamps needed for ordering and
de-duplication stay readable so the database is queryable. Anything a student
would consider private lives in an encrypted blob.

Four deliberate exceptions, all documented in `prisma/schema.prisma`:

1. **`CanvasConnection.accessToken`** — encrypted with a *server* key, because
   the server calls Canvas on the student's behalf.
2. **`StudySession.focusModeActive` / `focusModeOverride`** — the trackers have
   no key and must never have one, so the server answers "should I be blocking?"
   without decrypting.
3. **`User.blockCategories` / `blockExtra` / `blockAllowed`** — same reason; the
   server builds the list the trackers enforce.
4. **`PendingDeviceData`** — the weak point, below.

Consequence: the insight engine runs **in the browser** (`src/lib/insights.ts`,
called from `src/components/study-panel.tsx`), because the server can't read its
inputs.

### The weak point, stated plainly

The extension and the desktop/mobile trackers can't encrypt — they have no key,
deliberately, because a program running on a student's machine all day is the
last place one should live. So they post plaintext site and app names to
`PendingDeviceData`, which the student's browser collects, encrypts and deletes
on next load.

Rows expire after six hours and are swept whenever any device reports and again
in the daily cron. They used to be filtered out of reads and never deleted, so
plaintext persisted forever for anyone who stopped opening Insight while both
privacy pages claimed six hours. Both pages now describe this in as many words,
including what it means in practice.

**The phone app is the exception that proves the rule:** it *does* hold a key,
because it shows a student their own data. That's consistent — the rule is that
*unattended trackers* never hold one, not that no device may. See "the pairing
code that isn't like the others", below.

---

## What's built

**Website**, deployed and working:

- Auth (Clerk, Google + email code, **no password** — deliberately)
- Onboarding: birthdate gate (13+, under-13 turned away) → encryption password →
  school + grade → devices
- Unlock screen, with opt-in "stay unlocked on this device" via IndexedDB
- Session timer, Focus Mode toggle, quick log (sleep / screen time / scores)
- Screenshot OCR for screen time (Tesseract, client-side, image never uploaded)
- Insight engine: 7 factors, sample-size gated, correlational wording enforced
  by tests
- Wellbeing alerts, weekly recap, Groq-phrased recommendations
- Canvas: token connect, sync, 401 → `DataGap`, 90-day expiry warnings
- Settings: lock device, change password, mute insights, export, delete,
  blocklist editor
- Baseline at `/baseline` — usual sleep and wake times, usual place and noise
- Per-session device readout: what your devices saw, app by app
- Admin schedule/calendar editor at `/admin/schedules` (env allowlist)
- Privacy pages, student and parent
- **Installable as a PWA** — manifest, icons, Apple meta tags
- `/download` (three binaries), `/iphone` (setup guide), `/bounce` (the iPhone
  interruption), `/offline`

**Five clients**, all pairing with a token minted at `/devices` and talking to
the same two endpoints:

| | Counts | Blocks apps | Blocks sites | Notes |
|---|---|---|---|---|
| Extension (`extension/`) | sites | — | yes | MV3. Store listing written, not submitted |
| Windows (`windows/`) | apps | yes | — | C#, one 68MB exe, no admin needed |
| Mac (`mac/`) | apps | yes | — | Swift, 320KB bundle, ad-hoc signed |
| Android (`android/`) | apps + browsers | yes | yes, via DNS | The only phone that can do any of it |
| iPhone (`ios/`) | — | — | — | Companion only. Apple forbids the rest |

Data: 30 FISD campuses seeded, real A/B calendar extracted from the district PDF
by sampling cell colours — 82 A days against 82 B days, which is the check that
it's right.

---

## What's not built, and what's untested

- **Android is verified on a real phone** — Nothing Phone 2a, Android 16. App
  blocking closes a blocked app; site blocking refuses `youtube.com` and lets
  `wikipedia.org` through. Both confirmed over adb, not by eye.
- **The iPhone app has only ever run in the simulator** against a synthetic
  pairing code. Pairing, unlocking and the crypto are verified against the real
  browser code; a real session end to end is not.
- **Untested on the desktops:** blocking works and has been used, but nobody has
  watched an override get recorded, the ten-minute idle cutoff fire, or a
  session-end flush land.
- **HAC** — reconnaissance done, matcher built and tested, parser not written.
  See the section at the end.
- Canvas ↔ manual grade reconciliation (schema supports it, no UI).
- **iOS can never track or block apps** without `FamilyControls`, which Apple
  grants rather than sells. $99 buys the *development* capability, so real
  shielding on your own phone is achievable; shipping it to students needs
  Apple's approval of the distribution entitlement, which is the uncertain part.

---

## How blocking works, per platform

One matcher, five enforcers. `src/lib/blocklist.ts` builds a single flat list of
hostnames *and* app names; `matchesBlocklist` lowercases and compares exactly, so
an app name can never collide with a hostname or the reverse. That's what lets a
game be blockable at all — Valorant is its own executable with no website to
match on.

- **Extension** redirects the tab to a page that explains itself. URL-level, the
  most precise of the five.
- **Windows** sends `CloseMainWindow` — the polite close, so unsaved work still
  prompts. Falls back to minimising.
- **Mac** sends `terminate()`, the same one Cmd-Q sends.
- **Android** replaces the app with our own screen *and* calls
  `killBackgroundProcesses`, because covering an app left it running behind the
  screen, holding its place. It also blocks *sites* through a local VPN that
  carries nothing but DNS — see `android/README.md`.
- **iPhone** can't block anything. A Shortcuts automation bounces the student to
  `/bounce`, and a Focus shortcut quiets the phone. Friction, not a wall, and
  `/iphone` says so before anything else.

Everywhere, the override is three seconds, is recorded, and holds for the rest
of that session. A hard lock gets uninstalled, and an uninstalled app blocks
nothing.

---

## The pairing code that isn't like the others

A laptop tracker only ever *adds* — that's why the pairing screen can say
"pairing grants the ability to add, never to read".

A phone shows a student their own data, so it needs the key. An endpoint handing
key material to a bearer token would make that sentence false for every device
and let a stolen token grind at a password offline. So the phone's pairing code
**carries the encryption setup inside it**, assembled in a browser that is
already signed in. `src/lib/pairing.ts`. The password is not in it.

`ios/Sources/Crypto.swift` must match `src/lib/crypto.ts` exactly — PBKDF2 600k,
AES-GCM, NFKC-normalised password, and WebCrypto's ciphertext‖tag layout against
CryptoKit's separate tag. Verified in both directions against the real browser
code. If it ever drifts the symptom is a correct password being rejected
forever, so test interop rather than assuming it.

---

## Gotchas, all learned the hard way

**Next.js 16 renamed middleware to `proxy.ts`.** `AGENTS.md` warns this version
differs from training data. It was right. Read `node_modules/next/dist/docs/`
before writing anything framework-shaped.

**Prisma 7 requires driver adapters.** `new PrismaClient({ adapter })`, and
destructive CLI commands demand `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.

**Migrations must reach production.** Twice, code shipped selecting a column Neon
didn't have, and both times the symptom was a 500 that looked like something
else. `npm run build` runs `prisma migrate deploy` first. Set
`DIRECT_DATABASE_URL` in Vercel — the pooled endpoint is PgBouncer and can't run
DDL.

**`@db.Date` values are UTC midnight.** Formatting one in `America/Chicago`
shifts it to the previous evening, which announced the first day of school as the
day before it. Calendar dates format in UTC; only real instants use the school's
zone.

**First page load fans out into concurrent `getOrCreateUser` calls.** They all
miss, all insert, and the losers throw `P2002`. Handled by treating a lost race
as success. Only fires on a user's *first* request, which is why local testing
never saw it.

**Clerk dev instances cap at 100 users and can't migrate users to production.**
`getOrCreateUser` re-points an existing row when the Clerk id changes for a known
email, so the eventual switch doesn't orphan anyone's data.

**Vercel blocks deploys when the commit author email doesn't map to the project
owner's GitHub account.** Commits use
`312205265+kapileshads-source@users.noreply.github.com`.

**Truncated production errors are useless.** `src/lib/db-errors.ts` puts the
Prisma code at the *front* of the log line.

**The keychain is unusable from an ad-hoc signed app.** macOS ties a keychain
entry to the exact binary that made it, and `codesign -s -` mints a new identity
every build. The Mac token sits in an owner-only file instead, which is what
DPAPI amounts to on Windows anyway. Don't put it back.

**Never render a blank page, and never fail silently.** This is the recurring
theme, and every instance has been the same shape: something looks healthy while
doing nothing.

- A failed key check left `status: "checking"` forever and the gate returned
  `null`.
- The Windows app worked perfectly and looked broken, because nothing in the UI
  showed what a device recorded.
- Expired `PendingDeviceData` was filtered from reads and never deleted.
- The Android tracker only started at the moment of pairing, so a reinstall or a
  reboot left a status screen saying all was well with nothing running.
- The Android VPN was built, wired up, and could never start, because nothing
  ever asked for the consent it needs.
- Then it crash-looped instead: `FocusVpnService.stop()` reaches the service by
  *starting* it, every poll without a focused session called it, and Android
  refuses a background service start — which threw out of the polling coroutine
  and killed the process every fifteen seconds.
- Then the fix for that made it silent again, because the refusal was caught and
  nothing was recorded.
- And the status screen that was supposed to explain all this read its state
  once, on resume, while everything it describes is written by a service seconds
  later. A working diagnostic looked like a broken one.

The pattern is worth internalising: **when something can't work, say so on
screen** — and make sure the screen can still be *read* when the failure
happens. Most of the bugs on this list were invisible until someone happened to
check, and two of them were introduced by fixing the previous one.

**How to debug the phones without guessing.** Three rounds of "try this and tell
me what it says" is the cost of diagnostics that only record failures. The
Android app now records *progress* — a numbered breadcrumb at each step of
starting the tunnel — so whatever the status screen shows last is where it
stopped. Cheaper than a cable, and it survives being handed to a student.

`adb` is at `~/Library/Android/sdk/platform-tools/adb` if a real log is needed;
the phone wants USB debugging turned on in Developer options.

### Toolchain notes

- **.NET 8 SDK** at `~/.dotnet` (Homebrew's cask needs sudo; the install script
  doesn't). Windows builds cross-compile from macOS via `EnableWindowsTargeting`.
- **Xcode** refuses to run on macOS 27 unless it's a beta build — get it from
  `developer.apple.com/download`. `xcodebuild` and `simctl` work fine regardless,
  so simulator testing never needs the GUI.
- **Android** needs JDK 17–21. The JDK 25 on this machine and Homebrew's Gradle
  9.7 are both too new for AGP, so the wrapper is pinned to 8.11.1 and builds run
  with `JAVA_HOME=/opt/homebrew/opt/openjdk@21`.
- **XcodeGen** generates `ios/Insight.xcodeproj` from `project.yml`. The project
  file isn't committed; a pbxproj is unreadable in a diff.

---

## The bug that hid behind four screenshots

Site blocking never worked on any build, and the cause was one missing line in
the manifest: `ACCESS_NETWORK_STATE`.

`upstreamResolver()` asks the system which resolver the phone is already using.
That call is permission-guarded, and asking without the permission **throws**
rather than returning null. It threw on the DNS thread's first instruction —
after consent was granted, after the service reached the foreground, after
`establish()` handed back a real tunnel. Everything observable said healthy.
The thread's `catch (_: Throwable)` discarded the exception, and the only trace
left in the world was one boolean going false.

Then, with it finally running, it took the whole phone's DNS down. One shared
socket, queries handled strictly in turn, replies assumed to arrive in order —
and Android's resolver asks for a dozen names at once. Every answer went to the
wrong asker. Since the tunnel is the phone's only resolver, nothing resolved at
all. It now uses a socket per lookup, and **fails open**: twelve failures in a
row and DNS goes back to the phone, because the worst case of failing open is
an unblocked session and the worst case of holding on is an unusable phone.

Three lessons, in increasing order of usefulness:

1. **A catch-all that discards is worse than a crash.** The crash loop it was
   written to fix at least told us something. Catch broadly, record always.
2. **Diagnostics have to survive their own success path.** Breadcrumb 5 was
   overwritten by breadcrumb 6 one line later, so the crumb naming the cause
   was the one crumb nobody could see. And a `null` written on success removes
   the key entirely, which reads exactly like never having run.
3. **Reach for the cable much earlier.** Four rounds of "install this and tell
   me what it says" bought less than five minutes of `adb logcat`, and the
   cause was never where the screenshots pointed.

```bash
~/Library/Android/sdk/platform-tools/adb shell run-as app.insight.android cat shared_prefs/insight.xml
```

prints the whole status screen without the phone being in anyone's hand.

---

## Distribution

Students are on **their own machines**, and get everything from the website.

- **Desktop apps and the APK:** `/download`. The three binaries are *not* in the
  repo — the Windows exe is 68MB and can't be trimmed (.NET refuses on WinForms).
  Upload them to Cloudflare R2 or Vercel Blob and set
  `NEXT_PUBLIC_DOWNLOAD_WINDOWS_URL`, `_MAC_URL`, `_ANDROID_URL`. Until those
  exist the page says so rather than offering a dead button.
- **The extension can't be handed out as a file.** Chrome removed self-hosted
  `.crx` installs, and "Load unpacked" needs developer mode. It has to go through
  the Web Store: $5 once, publish **unlisted**. `extension/STORE.md` has every
  field the form asks for, written out to paste.
- **The APK triggers Google Play Protect** on install — "hasn't seen an app from
  this developer before". Students tap through via *Install anyway*. A one-time
  $25 Play Console registration and an internal-testing track would remove it.
- **The iPhone gets no app.** `/iphone` is the setup instead.
- **GitHub is blocked on the district network**, so it's the wrong host for any
  of this.

---

## If we do HAC

Not built. `src/lib/assignment-match.ts` is written and tested; nothing imports
it yet. The reconnaissance cost two people real effort, so it lives here.

**Never take a HAC password.** It is the student's district identity and unlocks
schedule, attendance and discipline records. It is not comparable to the Canvas
token, which is scoped, revocable and expires in 90 days. The design that avoids
it entirely: a **content script on `hac.friscoisd.org`**, reading pages the
student is already logged into. Same-origin, so cookies apply and CORS never
enters it, and no login handshake is needed. A plain web page cannot do this —
HAC sends no CORS headers and its session cookie is `HttpOnly`.

**Upcoming work is at `/HomeAccess/Home/WeekView`, not `Assignments.aspx`.** It
takes `?startDate=MM/DD/YYYY`, so a semester is a loop over week starts. Each row
carries a multiline `title=""` attribute with due date, max points, category,
type, droppable and extra-credit flags, plus course, period and teacher.

**On `Assignments.aspx`: cell 0 is the due date, cell 1 is the assigned date.**
Rows are `tr.sg-asp-table-data-row`, course from `div.AssignmentClass`, score and
points in cells 4 and 5. `span.sg-header-sub-heading` is a last-updated stamp.

**There is no stable assignment id.** Two independent parsers capture none.

Three traps found in existing scrapers: a `points` value defaulting to `100.0`
when unparseable; recomputing course grades when HAC never exposes category
weights; and parsing by positional cell index, which fails *silently* when a
column is inserted — bind to header labels instead.

Still unknown, and answerable in DevTools once the gradebook has anything in it:
whether the assignments table has a header row to bind to, and whether ungraded
work appears there at all.

**Don't copy `SumitNalavade/FriscoISDHACAPI`'s auth** — it passes username and
password as URL query parameters.

---

## Outstanding, for Kapilesh

- **Rotate the leaked credentials.** Neon password, Groq and Resend keys, and one
  extension pairing code all appeared in screenshots pasted into chat. A phone
  pairing code has since gone through a messaging app too.
- **Host the three binaries** and set the three env vars, or `/download` offers
  nothing.
- **The Chrome Web Store**, $5 and twenty minutes, using `extension/STORE.md`.
- **Real bell times** into `/admin/schedules`. The seeded ones match the district
  calendar's start and end times but the internal period splits were
  reconstructed, not published — so "you studied during 3rd period" is a guess.
- **Five calendar dates** the extractor couldn't resolve, listed on that page.
- **Legal review.** Turning under-13s away removes COPPA, not every obligation —
  Texas HB 18 covers minors under 18. `DATA.md` is written for exactly this:
  every field, whether it's encrypted, what leaves the system, and the questions
  worth an attorney's hour. It also lists two places where the pages and the code
  still disagree.
- **A domain**, eventually. No longer urgent — the parent-consent email path is
  gone — but Clerk's dev instance caps at 100 users.
- **Log real sessions.** The insight engine has passed 240 tests and never seen a
  human. Everything downstream is calibrated against data that doesn't exist yet.
- **Test the iPhone app end to end**, on a real phone rather than the simulator.
  It has never seen a real pairing code. Needs Xcode Beta (the Mac runs macOS 27,
  which the release build refuses), a free Apple ID for a seven-day signing
  profile, and a session started from the web app. What to check, in order:
  the pairing blob decodes and unlocks; the status screen shows a live session;
  the `/bounce` deep link opens the app rather than Safari; and the two Focus
  shortcuts fire. Blocking and app counting are not part of this and never will
  be — see the iOS note above.
