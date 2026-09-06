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

`npm test` runs 561 tests. `npm run build` regenerates the Prisma client,
**applies pending migrations**, then builds. Each native app has its own suite:
53 on Windows, 61 on Mac, 25 on Android, 16 in the extension.

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
- **What's due** — the Canvas assignments, grouped by urgency, missing work
  pinned above every date, graded and handed-in work dropped
- A fortnight of study time as bars, in the weekly card
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
- **The Mac app is verified end to end** against a stub server: it polls every
  15s, notices a session within one poll, attributes the frontmost app,
  *closed* a blocked TextEdit, recorded the block event, flushed on the minute,
  and — after the fix below — flushes the tail when a session ends.
- **The idle rule is verified, and it had to be rebuilt first** — see below.
- **The Windows change below is unverified by a compiler** — no dotnet on the
  Mac. It is a three-line reordering identical to the Mac and Android ones.
- **HAC** — reconnaissance done, matcher built and tested, parser not written,
  and **nothing imports the matcher**. It has been dead code since it was
  written. See the section at the end for the two facts that unblock it.
- Nothing. The build list is finished.

**A habit worth keeping:** twice now, code has shipped that nothing could
reach — the assignment matcher sat unimported for weeks, and `unlinkAssignments`
existed while the undo it powers had no button, which made the whole
link-rather-than-merge argument a comment instead of a feature. Before calling
anything done, grep for the new export outside the file that defines it. If the
only hit is its own definition, it isn't built.
- **HAC is blocked on the school year, not on us.** Checked on 2026-08-12: the
  Classwork page renders eight courses and not one assignment, because Report
  Card Run 1 has barely started. Writing a parser against an empty page means
  guessing column positions, and that guess fails *silently*. Ask again once
  there are real rows; the two facts needed are at the end of the HAC section.
  Worth noting from that page: courses read `SST22300A - 1 AP World History S1`,
  which carries code, period and semester — more than Canvas gives, and enough
  to make course matching easy rather than the guesswork the matcher needed.
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

## The idle rule existed and never once fired

Three attempts to watch the ten-minute cutoff all showed the tracker happily
counting. It looked like a bug in the tracker. It wasn't.

Sampling `CGEventSource.secondsSinceLastEventType` every fifteen seconds, with
nobody near the machine, gave a clean climb to **346 seconds and then a snap
back to 3**. The power assertions name the culprit outright:

```
UserIsActive "com.apple.iohideventsystem.queue.tickle
  service:AppleMultitouchDevice product:Apple Internal Keyboard / Trackpad eventType:11"
```

The trackpad emits digitizer events by itself, roughly every six minutes, with
the lid open and nobody touching it. Six is less than ten, so **keyboard idle
never reached the threshold on that machine and never would**. An evening with
the laptop open counted, in full, as studying — and it would have inflated
exactly the factor the insight engine cares most about.

**Keyboard idle alone is not a safe signal on a laptop.** A sleeping display or
a locked screen is now treated as away immediately: neither can be produced by
a stray touch, and neither has an innocent reading. Nobody revises at a screen
that is off.

Verified by putting the display to sleep mid-session and watching:

```
02:06:25  ACTIVITY  59 seconds
02:06:35  (display slept)
02:16:45  ...nothing. Ten minutes, zero seconds recorded, 11 polls still flowing.
```

Polls continuing is the important half — it proves the app was alive and
choosing to record nothing, rather than having died.

Windows got the equivalent (`OpenInputDesktop` fails when the secure desktop is
in front, which is exactly "locked"), unverified by a compiler. Android already
handled it: it stops counting when the screen goes off.

**The general lesson.** The decision — "is the student away?" — is now a pure
function with tests. The *reading* of the sensors is the part that can't be
tested and shouldn't hold the logic hostage.

---

## Every session lost its last minute, on all three trackers

Found by pointing the real Mac app at a stub server and ending a session while
watching what it sent. It sent nothing.

```
01:14:49  ACTIVITY  {"sessionId":"sess-verify-1","domains":[{"domain":"Claude","seconds":59}]}
01:15:05  (session ended on the server)
01:15:19  POLL -> session=none          ← and no final flush, ever
```

`poll()` assigns `session = result.session` *before* calling `closeSlice()`, and
`closeSlice()` guards on a session existing. So when a session ended, the guard
bailed, the open slice was discarded, the tally stayed empty, and `flush()`
returned early on its own empty-check. Everything between the last 60-second
flush and the session ending — up to 74 seconds — was dropped.

The comment immediately above it reads *"posting it after that id stops being
current loses the last minute of every session"*. The intent was right; the
ordering defeated it. The same code, ported to three platforms, carries the same
comment and had the same bug: **Mac, Windows and Android all lost it.**

Fixed by closing the slice before the reassignment. Verified the same way it was
found: the final post now carries 44 seconds under the old session id.

Worth noting what this cost invisibly. It only bites when a session *ends*,
which is every session — and the missing time is always the tail, which is
disproportionately the part where a student was flagging.

---

## What your classes are on

The one question only Canvas can answer — HAC's gradebook has names, dates and
scores and no idea what is being taught. Modules are where a teacher writes
"Unit 3: Stoichiometry", and reading them turns a dashboard that lists work
into one that can say what the week is about.

It earns its place twice. On screen it is a sentence a student recognises, and
underneath it is the best available answer to "is this undated assignment
current?" — better than any date, because it is the teacher's own view of where
the class is. Work in the current module is marked current even if it was
handed out months ago.

Choosing the module: one Canvas says is `started` first, since the student has
opened something in it; otherwise the earliest `unlocked` one, since teachers
unlock as the term moves; otherwise **nothing**. A course where everything is
locked or everything is finished has no current unit, and saying so beats
naming one.

Modules are optional in Canvas and plenty of teachers never make any, so a
course without them syncs exactly as before. Stored inside the course payload
rather than a table of its own: it is ephemeral state, rewritten on every sync,
and it is content, so it is encrypted like everything else.

Every guess carries its evidence on the row — "in Unit 3: Stoichiometry", or
"handed out Wed, Aug 26" — so a student can disagree with it rather than
trusting it.

---

## The nudge that reaches a phone nobody is looking at

Sleep and phone time are the only two numbers nothing measures for us, and the
dashboard can only ask a student who opens it. Someone who forgets for a week
doesn't leave a smaller dataset — they leave a biased one, because the nights
that go unlogged are not a random sample of nights.

So: a web push in the morning for last night's sleep, and one in the evening
for phone time. **Only on days something is actually missing.**

**The server picks who to ask without reading anything.** A sleep entry for a
date either exists or it doesn't, and row existence is plaintext by design. It
never learns how long anyone slept.

**The message carries no data**, because the server has none to put in it. "How
did you sleep?" is the whole payload — which also means a lock-screen
notification can't show a number to whoever picks the phone up. There's a test
that the copy never contains one.

**No new cron slots**, which was luck. Vercel Hobby allows two and both were
spoken for, but they run at 13:00 and 23:00 UTC — 8am and 6pm in Frisco, which
are exactly the two moments a student can answer. The nudges ride those.

**Set three environment variables in Vercel** or nothing sends:
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
(the same value as the public one). Generate a pair with
`node -e "console.log(require('web-push').generateVAPIDKeys())"`. A local pair
is already in `.env`; **the deployed keys must be the ones in Vercel**, and
changing them later silently invalidates every existing subscription.

On iOS this only works for a Home Screen install, not a Safari tab — one more
reason `/iphone` leads with "add it to your Home Screen".

---

## Undated work is ranked, never dated

"No due date" was a pile with no order to it, and Canvas produces a lot of it.
Both gradebooks do give one signal — when the work was handed out — and we were
reading neither: HAC has `dateAssigned`, and Canvas sends `unlock_at` and
`created_at` in every assignment it has ever returned.

Undated work handed out in the last week now sits in **"Probably this week"**,
above Later, with the date shown ("handed out Wed, Aug 26") so a student can
judge the guess instead of taking it on faith.

**What it deliberately does not do is write a due date, or hide anything.** A
fabricated date is indistinguishable from a real one, and the assignment hidden
by acting on a wrong guess could be the one that mattered. That is the most
expensive mistake this app could make, so the guess stays a guess, in its own
group, with its evidence attached.

---

## Grades become scores

For most of this project the two halves never met. Canvas grades synced every
ten minutes, HAC grades arrived on request, and the insight engine could see
neither — every score it used had been typed in by hand. A student with a
connected gradebook still had to re-enter their own marks for any of it to mean
anything, which almost nobody would do. `src/lib/outcomes.ts` is that join.

**The rule it is built on: never count the same test twice.** The engine
averages outcomes, so a hand-entered "Bio test, 82%" and a synced "Unit 2 Test,
82/100" landing as two rows would weight that test double and distort every
correlation drawn from it — the same asymmetry as the assignment matcher, for
the same reason. A hand-entered score within two days, in a matching class,
counts as the same assessment and nothing new is written.

**When they disagree it asks rather than deciding.** A card offers both numbers.
Either answer attaches the student's own row to the assignment, which is what
stops the question returning on the next sync: `assignmentId` is unique on
`Outcome`, so the database refuses a second score for one test even if two tabs
try at once.

Skipped on purpose, each with a counter so the UI can explain itself: work with
no points possible (extra credit and practice have no percentage), and anything
over 200% — a five-point warm-up recorded as 100 is 2000%, and would move a
term's average on its own.

---

## Two features that passed their tests and did not work

Found by driving the real functions with a semester of generated data rather
than by reading them. Both had green tests the whole time.

**The timing factor could never fire.** `latestStartHour` took the *maximum*
start hour across the seven-day window, so one 11 PM session marked the whole
week late. Every outcome landed in the same group, the control group was empty,
`compare()` returned null, and `STUDY_TIMING` vanished from the results — for
any student who studied late even once. The test missed it because its student
is all-or-nothing: every session for a test is late, or none is. Real weeks mix.

**The HAC matcher missed four of nine real assignments**, and the course name
was the cause every time. `Alg II H` was vetoed against `Algebra II Honors`
because `h` and `honors` read as different course levels — the exact pair the
function's own comment claims to handle. Precision was never the problem; the
retake and Unit 3/Unit 4 traps were caught throughout.

**And about half of what surfaced was invented.** Seven factors compared against
twenty-odd scores throw up big-looking differences constantly, and the gates
controlled sample size, not luck. Over 25 generated students, 28 of 65 surfaced
findings had no effect built into the data at all — one with the wrong sign.
There is now a permutation test: shuffle which scores land in which group a
thousand times, and keep only gaps that chance rarely produces. Invented
findings fell to 5. Real ones fell too, 37 to 16, which is the right way round
for a tool that tells a fifteen-year-old their scores drop.

The shuffle is seeded on purpose. An insight that appears on one page load and
vanishes on the next is worse than one that never appears.

**The lesson is the method.** Unit tests check the behaviour you thought of.
Generating a student who really does have the problem, and one who has nothing,
checks whether the thing works — and it is how all three of these were found in
an afternoon.

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

## Deploys are blocked until 4 September 2026

Neon's free-tier compute was exhausted on 28 August. Every Vercel build fails
at `prisma migrate deploy` with `P1001`, because migrations run before the
compile. It resets on **4 September**.

Local development is unaffected — `.env` points at a local Postgres.

**A diagnostic trap worth knowing.** A TCP connect to a Neon host succeeds even
for a hostname that does not exist: the regional proxy answers on 5432 for
anything in the region and routes by SNI afterwards. That made a dead endpoint
look alive and produced a confident, wrong "it's just a sleeping compute"
theory. What settled it was five retries over 40 seconds, all refused
instantly — a waking compute answers well inside that.

`scripts/deploy-migrate.mjs` retries P1001 five times with a 2/4/8/15s backoff.
Keep it: it is what turned "failed instantly" into evidence.

**If waiting is not acceptable**, a new Neon project gets fresh free-tier hours.
Production holds no real study data yet, so re-pointing `DATABASE_URL` and
`DIRECT_DATABASE_URL` and re-running migrations costs only re-pairing devices
and reconnecting Canvas.

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

### The login and the selectors, from a working parser

Read out of `SumitNalavade/FriscoISDHACAPI` (public, Python, `api/_lib/` and
`api/currentclasses.py`) on 2026-08-13. This is reconnaissance, not a
dependency — see the warning below.

**Logging in** is a two-step form POST, not an API:

1. `GET https://hac.friscoisd.org/HomeAccess/Account/LogOn?ReturnUrl=%2fHomeAccess%2f`
   and scrape `input[name=__RequestVerificationToken]`.
2. `POST` the same URL with a cookie session and the token in *both* a header
   and the body, plus `Database: "10"`, `VerificationOption: "UsernamePassword"`,
   `LogOnDetails.UserName`, `LogOnDetails.Password`, and two empty decoys
   (`tempUN`, `tempPW`). A browser User-Agent is set; assume it matters.

**The assignments page** is `/HomeAccess/Content/Student/Assignments.aspx`:

| What | Selector |
|---|---|
| One course | `div.AssignmentClass` |
| Course name | `a.sg-header-heading` |
| Overall grade | `span.sg-header-heading.sg-right` (strip `Student Grades ` and `%`) |
| Last updated | `span.sg-header-sub-heading` — sometimes uses `+` for spaces |
| Assignment rows | `div.sg-content-grid tr.sg-asp-table-data-row` |
| Assignment name | the row's `<a>`; a row without one is a totals row |

### Checked against a real gradebook, 2026-09-05

Kapilesh sent the live Classwork page. It settles most of what was guesswork,
and corrects two things written above.

**The URL moved.** The footer of the real page prints
`https://hac.friscoisd.org/HomeAccess/Classes/Classwork`. The
`Assignments.aspx` path above came from the third-party parser and was never
checked; PowerSchool has moved it. `extension/hac-bridge.js` now tries the new
address first and keeps the old one as a fallback. Had this shipped unchecked,
every HAC sync would have failed on a feature nobody had run yet.

**The six column headers are confirmed, exactly:** `Date Due`, `Date Assigned`,
`Assignment`, `Category`, `Score`, `Total Points`. Every one already matches an
alias in `HEADERS` in `src/lib/hac.ts`, and `FALLBACK_INDEX` matches too —
`[2]` is the assignment name, which is why the positional parser appears to skip
it. The parser is right.

**The course grade is on the page**, as `Student Grades 93.00%` beside each
course heading, so GradeWay parity does not need the Report Card tab — which is
empty this early in the year anyway, as are IPR and Transcript-for-this-year.

**Never compute a course average ourselves.** Categories are weighted:
`Progress Check for Learning` and `Assessment of Learning`. One course showed
**`Student Grades 0.00%` while holding seven graded progress checks** — because
the assessment category was empty. Any average we derived would contradict the
number the student sees in HAC, and being wrong about a grade is the fastest way
to lose them.

**`INS` is a real score cell.** Handed in, not yet marked. Now parsed as
`INCOMPLETE` rather than falling through to `UNGRADED`; both keep it out of the
average, only one explains the blank.

**Corrections to the course-string note further up.** `SST22300A - 1 AP World
History S1` carries the code and a **section**, not the period. The period is on
the Week View as a separate `Per: 2`. And:

- **The lunch wave is in the course title** — `AP Pre Calculus S1 - C Lunch`,
  `Computer Science 1 Adv S1 - A Lunch`. That is the outstanding "lunch waves"
  item: it is parseable from the title and needs no per-campus table.
- **The doubled periods are an A/B rotation**, which answers the open question
  about two courses sharing a period. The Week View labels each day `Day: A` or
  `Day: B` — Mon B, Tue A, Wed B, Thu A, Fri B. Two courses share one period and
  alternate. The seeded calendar already carries A/B days (82 each), so period
  attribution needs to consult the day type, not just the clock.

**That parser reads cells by position** — `tds[0]` due, `[1]` assigned, `[3]`
category, `[4]` score, `[5]` total — which is the exact failure mode called out
above. Ours must bind to header labels. Note `[2]` is skipped, so the columns
are already not what a naive reading expects.

Confirms two things we had guessed: assignments carry **no stable id** (nothing
in the row to key on), and the score cell is free text, so `Z`, `M`, blank and
`4.5` all have to be handled rather than parsed as a number.

### Don't route credentials through the hosted version

`GET friscoisdhacapi.vercel.app/api/currentclasses?username=…&password=…` puts a
student's district password in a URL, to a third party. Query strings land in
access logs, browser history and referrer headers, and that password is usually
the same one behind their school email and Google account — this is not a
gradebook secret, it is the whole account.

It also inverts the one promise this project is built on. A student is told the
server cannot read their data; sending their credentials to someone else's
deployment is the opposite of that, and no amount of "no data is stored" fixes
it, because that is a claim they cannot check.

**Where HAC parsing has to live:** on the student's own machine. The extension
already runs there and can hold host permissions for `hac.friscoisd.org`; a web
page cannot, because CORS will not let it read the response. The parsed rows
then reach the browser tab that holds the encryption key, and are encrypted
before they are stored — the same path everything else takes. The extension must
not post assignment names and grades to `PendingDeviceData`: that table is
plaintext for six hours, which is acceptable for "youtube.com" and is not
acceptable for a grade.

### What's built, and what's left

**No credentials, and none are needed.** The student is already logged into HAC
in their browser, so `extension/hac-bridge.js` asks the background worker to
fetch `Assignments.aspx` with the session cookie that is already there. A web
page cannot do this itself — HAC sends no CORS headers, so the browser fetches
it and then refuses to let the page read it. The host permission is the whole
reason the extension is involved.

The extension does not parse the HTML, store it, or send it anywhere. It hands
it back to the tab, which holds the key and encrypts before storing. The bridge
refuses any URL that isn't HAC: one that fetched whatever it was handed would
be an open proxy carrying the student's cookies.

Signed-out is detected by *content*, not status — HAC answers an unauthenticated
request with the login page and a 200.

`src/lib/hac.ts` reads the table and is pure, with 42 tests. It binds to header
labels, and when there is no header row it falls back to positions **and says
so** (`usedFallback`), because a silent guess is the failure every other parser
of this page has. `src/lib/hac-dom.ts` walks the document and is deliberately
dull. Score cells keep their meaning: `M` is missing, `Z` is excused, blank is
ungraded, and none of them is a zero — parsing them as one would put failures
into an average the insight engine reads.

### The schema, and the two decisions in it

`Assignment.source` is `CANVAS` or `HAC`, and a HAC row leaves `canvasId` null —
Postgres treats nulls as distinct, so the existing unique index tolerates any
number of them. `AssignmentLink` pairs one row from each side.

**A link, not a merge.** `assignment-match.ts` exists because a wrong merge is
far worse than a missed one: it averages two different tests into one grade and
nobody ever notices. Merging rows would make that mistake unrecoverable — the
other row would be gone. A link is reversible, so a bad guess costs one click,
and it is what lets the middle confidence band exist at all: above the threshold
it pairs silently, below it the student is asked, and `confirmedAt` /
`rejectedAt` mean they are never asked twice. A rejected link is kept rather
than deleted, or every sync would offer it again.

**No server-side fingerprint of a HAC row**, and this one is worth defending.
The obvious way to de-duplicate re-synced HAC rows is a hash of course + name +
due date. Don't: the space of real assignment names is small enough to
enumerate, so anyone holding the database could recover "Ch 5 Quiz" from its
hash and the encryption on that field would be decorative. De-duplication
happens in the browser instead, where the plaintext already is on its way in.
It costs one decrypt pass over a few hundred rows per sync, which is nothing.

The migration is additive — a new enum, one defaulted column, one table — so
existing rows are untouched and it needs no backfill.

### How a HAC sync runs

A button on `/canvas`, not a timer. This reads a gradebook — the most sensitive
thing the app touches — and "a student presses a button" is a far easier promise
to keep than a background job they have to take on trust.

1. `requestHacPage()` posts to the content script, which asks the background
   worker to fetch `Assignments.aspx` with the session already in the browser.
2. The page parses it (`hac-dom.ts` → `hac.ts`).
3. `fetchHacState()` returns the HAC rows already stored, still encrypted.
4. The browser decrypts them and diffs on plaintext (`planHacSync`) — the only
   place that comparison can happen, since neither side is readable server-side.
5. Only the difference is encrypted and sent to `storeHacData`.

**What identifies a row**, since HAC gives no id: course, name, and the date it
was *assigned*. Not the due date — teachers move those, and keying on one turns
a postponed quiz into a second quiz. Not the name alone either: "Warm Up"
appears weekly in some courses, and collapsing a term of them into one row would
erase the set.

**Nothing is ever deleted.** Work that vanishes from the page — a hidden
category, a grading period rolling over — is reported and left alone, because
the grade it carried still counts.

The permission lives on the extension popup, because `chrome.permissions.request`
only works from a click inside the extension; a page can't ask, and neither can
a content script.

**Still to do:** the UI that offers a suggested Canvas↔HAC pairing (the schema
holds it, nothing writes it yet), and a real gradebook to check any of this
against. Every selector is confirmed from a working parser, but confirmed
selectors are not the same as having seen it work — and this session has been a
run of things that passed their tests and didn't.

---

## Reminders about work — built 2026-09-06

**The due-work reminder now exists.** After school on school nights, a push
saying how many things are due tomorrow and how many are past their date, with
its own switch beside the other two. Nothing is sent on an evening with nothing
due — a reminder that fires every day saying "0 due" trains people to swipe it
away, and then the one that mattered gets swiped too.

**What the server can and cannot see, because it shapes the wording.** A due
date is plaintext, so counting what falls tomorrow is free. Whether something
has been *handed in* is not — it is in the encrypted payload. The only proxy
available is a graded outcome, whose `assignmentId` is a plain foreign key, so
marked work can be excluded and "submitted but not yet marked" cannot. That is
why the copy says **"3 due tomorrow"** and never "3 you still need to do": the
first is true either way, and there are tests that fail if it drifts.

**The scheduling problem is solved without paying Vercel.** Hobby allows two
cron entries, both were spoken for, and it refuses anything firing more than
once a day. `.github/workflows/reminders.yml` calls `/api/cron?job=due-work` on
a schedule instead — free, no limit, and the endpoint already authenticated by
bearer secret rather than Vercel signature, so nothing had to change to allow
it. **Two repository secrets are required before it does anything:**
`CRON_SECRET` (matching the Vercel variable) and `APP_URL`. The workflow fails
loudly on a non-200, because a reminder that silently stops firing is worse
than one that was never built.

### Still to build

The original ask also covered tying a reminder to a pattern the engine found —
a nudge before a test *because* late sessions came before lower scores for this
student. That is the one thing Canvas cannot do and it is still unbuilt. It is
also the one that needs care: it means a notification whose existence implies a
finding about the student, which is a different privacy question from a count.

### The original note, kept for the reasoning

## To build: reminders about work, not just about logging

Kapilesh's ask, 2026-09-04: *students are swarmed with work, so remind them —
email, app notifications.* Worth writing down properly, because half of it
already exists and the half that doesn't has a real constraint in front of it.

**What already ships.** Four reminders, all live:

| Reminder | Channel | When |
|---|---|---|
| Canvas token expiring | Email (Resend) | 14, 3 and 0 days out |
| Weekly recap | Email | Sundays |
| "How did you sleep?" | Web push | 8am Frisco |
| "How much phone time?" | Web push | 6pm Frisco |

So the plumbing is done: `src/lib/email.ts`, `src/lib/push.ts`,
`src/lib/nudge.ts`, `src/app/api/cron/route.ts`, VAPID keys, the
`PushSubscription` table, and an opt-in card at `src/components/nudge-optin.tsx`
with a switch per reminder.

**What's missing is the thing actually asked for.** Every reminder above is
about *feeding the app*. None is about the work. Nothing says "you have three
things due tomorrow."

**The good news: this is possible, and the schema already allows it.**
`Assignment.dueAt` is deliberately plaintext (`prisma/schema.prisma:385`) so the
dashboard can order by what's next without decrypting every row. Which means the
server can *count* what's due without being able to *name* it. A reminder can
honestly say "3 things due tomorrow, 1 already overdue" and physically cannot
say which — the titles are in `payloadCipher`.

That is the right design rather than a limitation to apologise for: a count on a
lock screen tells the student what they need and tells whoever picks up the
phone nothing. It's the same rule the existing nudges follow.

**The constraint to solve first.** Vercel's Hobby plan allows **two** cron
entries and both are taken, and it rejects any schedule firing more than once a
day. An after-school reminder wants ~4pm Frisco (21:00 UTC), which is neither of
the two slots. Three ways out, cheapest first:

1. **GitHub Actions on a schedule**, hitting `/api/cron` with the `CRON_SECRET`
   bearer token. Free, unlimited schedules, no minimum interval, and the
   endpoint already accepts `?job=` and authenticates by bearer rather than by
   Vercel's signature. This is almost certainly the answer.
2. Ride the existing 23:00 UTC job — but that already sends the phone-time push,
   and two notifications in the same second is how someone turns both off.
3. Vercel Pro, $20/month. Don't.

**Design notes for whoever builds it, so the same arguments aren't had twice:**

- **Bucketing already exists.** `src/lib/assignments.ts` sorts work into
  `MISSING → OVERDUE → TODAY → TOMORROW → THIS_WEEK → RECENT → LATER → UNDATED`.
  A reminder should be counts drawn from those buckets, not a new ranking.
- **Silence on quiet days.** The existing nudges skip students who already
  logged; this must skip students with nothing due. A reminder that fires
  every day saying "0 things due" trains people to swipe it away, and then the
  one that mattered gets swiped too.
- **Email and push are not interchangeable.** Push is for *today* and is
  ignorable; email is for *this is going to hurt* — the Sunday recap and a
  genuine backlog. Sending both for the same event halves the value of each.
- **iOS needs the app installed to Home Screen** for push to work at all. On a
  Safari tab the feature genuinely isn't there, which is why `NudgeOptIn`
  renders nothing rather than a button that fails.
- **One switch per reminder**, following the existing card. "Stop telling me
  about assignments but keep asking about sleep" is a reasonable thing to want,
  and all-or-nothing is how someone turns off the one they'd have answered.
- **Resend's free tier is 100 emails/day, 3,000/month.** Fine for a pilot;
  worth knowing before a campus-wide rollout.

**Not yet decided, and worth a real answer before building:** whether a reminder
about work is Insight's job at all. Canvas already sends assignment
notifications, and the honest pitch of this app is that it says *less* than a
normal tracker, not more. The strongest version is probably the one thing Canvas
can't do — tie the reminder to a pattern the engine actually found, e.g. a
nudge at 9pm on a night before a test *because* late sessions came before lower
scores for this student. That is not a to-do; it's a design question for
Kapilesh and Sahas.

---

## HAC credentials — the second server-readable secret

Added 2026-09-06 on Kapilesh's explicit instruction, after the trade was put to
him twice.

**What changed.** A student can now sign into HAC with a username and password
instead of the extension. The password is encrypted with the *server* key, like
`CanvasConnection.accessToken`, so the server can log in on their behalf. That
makes it **the second student secret the server can read, and a heavier one** —
a Canvas token is scoped, revocable and 90-day; a HAC password is the student's
school identity and is often the same one behind their district Google account.

**Why it was worth it.** The extension is desktop Chrome only. A Frisco student
on a phone had no way to see their real gradebook, which is most of the point of
the app.

**What did not change.** The server still cannot read the gradebook. It has no
encryption key, so `pullHac` fetches the page and hands the HTML back to the
student's own browser to parse and encrypt — the same round trip Canvas takes.
Holding the page in memory for one request is the most it can do.

**Rules enforced in code, not intention:** credentials only in a POST body,
never a URL; every failure is a fixed code so nothing typed can reach a log or
a stack trace; nothing is stored until a login succeeds, so a typo is never
saved; disconnecting deletes the row rather than blanking a field.

**Still to do:** `DATA.md` and both privacy pages must say this before anyone
other than Kapilesh uses it. The app currently promises more than it delivers
for this one field, and that gap is the kind that matters.

## Outstanding, for Kapilesh

- **Rotate the Neon password first, and soon.** On 2026-09-05 it was printed in
  full into a chat transcript by a diagnostic that echoed its input on a parse
  error. That is worse than the screenshots below, and it is the credential with
  the most behind it. Reset it in the Neon console, then update `DATABASE_URL`
  (and `DIRECT_DATABASE_URL` if set — `scripts/deploy-migrate.mjs:21` prefers it)
  in Vercel **and redeploy**, or production keeps the old value and breaks.
- **Rotate the rest when convenient.** Groq and Resend keys and one extension
  pairing code appeared in screenshots pasted into chat. A phone pairing code has
  since gone through a messaging app too. Kapilesh chose to defer these to the
  end of the project, which is reasonable — none of them guards real student
  data yet.
- **Host the three binaries** and set the three env vars, or `/download` offers
  nothing.
- **The Chrome Web Store**, $5 and twenty minutes, using `extension/STORE.md`.
- ~~**Run `npm run seed` against production once.**~~ **Done 2026-09-05**:
  30 schools, 264 periods, 60 terms, 196 calendar days (82 A / 82 B). The bell
  times in the live database are now the ones corrected on 2026-08-12 from a
  real student's schedule, so period attribution is right from here on. Safe to
  re-run; the seed updates existing periods rather than skipping them.

  Two notes for next time. Run it with the URL inline and in **single** quotes —
  `DATABASE_URL='postgresql://…' npm run seed` — because zsh treats the `?` and
  `&` in a Neon connection string as a glob and a background operator, and
  double quotes let a `$` in the password expand. And copy the *connection
  string*, not the password field beside it: pasting the password alone produced
  `P1001: Can't reach database server at base`, which reads like a network
  fault and is not one.
- **Lunch waves.** A, B and C lunch sit inside the 3rd block and differ per
  campus *and* per course — one student's HAC showed A Lunch on one class and C
  Lunch on another. Period lookup treats the whole block as one period, which is
  right until someone wants "were you in class or at lunch?".
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
