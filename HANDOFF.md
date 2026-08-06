# Insight — handoff

Read this first in a new session. It covers what exists, why it's shaped this
way, and what bit us — most of which is not obvious from the code.

Built by Kapilesh Rajaravisankar and Sahas Raghav Vijayakumar, for a Frisco ISD
pilot. `PLAN.md`-equivalent lives in the original brief; this file is the
current state.

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

Everything is on a free tier. The only thing that would cost money is a
domain, and the plan is to get one free via GitHub Student Pack or eu.org.

`npm test` runs 130 tests. `npm run build` regenerates the Prisma client,
**applies pending migrations**, then builds.

---

## The one idea that shapes everything

**Student data is encrypted in the browser. The server cannot read it.**

A password derives a key-encryption key, which unwraps a random data key,
which encrypts the payloads. The password never leaves the device, so there is
no reset and no recovery. `src/lib/crypto.ts`.

The rule applied throughout the schema is **structure is plaintext, content is
not**. Row existence, foreign keys, and the timestamps needed for ordering and
de-duplication stay readable so the database is still queryable. Anything a
student would consider private lives in a single encrypted JSON blob per row.

Three deliberate exceptions, all documented in `prisma/schema.prisma`:

1. **`CanvasConnection.accessToken`** — encrypted with a *server* key, because
   the server has to call Canvas on the student's behalf.
2. **`StudySession.focusModeActive` / `focusModeOverride`** — the extension has
   no key and must never have one, so the server has to answer "should I be
   blocking?" without decrypting.
3. **`User.blockCategories` / `blockExtra` / `blockAllowed`** — same reason;
   the server builds the list the extension enforces.

**`PendingDeviceData` is the weak point.** The extension can't encrypt, so it
posts plaintext to a staging table that the student's browser collects,
encrypts and deletes on next load. Rows expire in six hours. This is the one
place device data is server-readable, and **the privacy page does not yet say
so** — that should be fixed before real students use it.

Consequence of all this: the insight engine runs **in the browser**
(`src/lib/insights.ts`, called from `src/components/study-panel.tsx`), because
the server can't read its inputs.

---

## What's built

Website, all deployed and working:

- Auth (Clerk, Google + email code, **no password** — deliberately)
- Onboarding: birthdate gate → COPPA parent consent → encryption password →
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
- Admin schedule/calendar editor at `/admin/schedules` (env allowlist)
- Privacy pages, student and parent
- Browser extension (`extension/`), Manifest V3, loaded unpacked
- Windows app (`windows/`), C# tray app, sideloaded as one self-contained exe
- macOS app (`mac/`), Swift menu bar app, sideloaded as an ad-hoc signed bundle

Data: 30 FISD campuses seeded, real A/B calendar extracted from the district
PDF by sampling cell colours — 82 A days against 82 B days, which is the check
that it's right.

## What's not built

- **Android app** — the two desktop apps are the pattern to copy
- **Neither desktop app has had its Focus Mode path exercised.** The Windows app
  pairs, polls and records on a real laptop; the Mac app builds, passes 32 tests
  and launches here. What nobody has watched happen is a blocked app being
  pushed out of the way, an override being recorded, or the ten-minute idle
  cutoff firing
- **Nothing in the UI shows what a device recorded.** App time feeds
  `distractedMinutes`, which only surfaces in the weekly recap and a
  sample-size-gated insight — so after a single session a student sees no
  evidence the app did anything at all. This made the Windows app look broken
  when it wasn't. A per-session device readout is the obvious fix
- Sleep-and-wake baseline and usual-study-location screens (two dead "Set up"
  links on the dashboard checklist)
- Privacy page doesn't mention `PendingDeviceData`
- Canvas ↔ manual grade reconciliation (schema supports it, no UI)
- iOS is impossible: Apple's entitlement is granted, not purchased

---

## Gotchas, all learned the hard way

**Next.js 16 renamed middleware to `proxy.ts`.** `AGENTS.md` warns that this
version differs from training data. It was right. Read
`node_modules/next/dist/docs/` before writing anything framework-shaped.

**Prisma 7 requires driver adapters.** `new PrismaClient({ adapter })`, and
destructive CLI commands demand explicit user consent via
`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.

**Migrations must reach production.** Twice, code shipped selecting a column
Neon didn't have, and both times the symptom was a 500 that looked like
something else. `npm run build` now runs `prisma migrate deploy` first. Set
`DIRECT_DATABASE_URL` in Vercel — the pooled endpoint is PgBouncer and can't
run DDL.

**`@db.Date` values are UTC midnight.** Formatting one in `America/Chicago`
shifts it to the previous evening, which announced the first day of school as
the day before it. Calendar dates format in UTC; only real instants use the
school's zone.

**First page load fans out into concurrent `getOrCreateUser` calls.** They all
miss, all insert, and the losers throw `P2002`. Handled by treating a lost race
as success. Only ever fires on a user's *first* request, which is why local
testing never saw it.

**Clerk dev instances cap at 100 users and can't migrate users to production.**
`getOrCreateUser` re-points an existing row when the Clerk id changes for a
known email, so the eventual switch doesn't orphan anyone's data.

**Vercel blocks deploys when the commit author email doesn't map to the project
owner's GitHub account.** Commits use
`312205265+kapileshads-source@users.noreply.github.com`.

**Truncated production errors are useless.** `src/lib/db-errors.ts` puts the
Prisma code at the *front* of the log line. Two wrong diagnoses happened before
that existed.

**The keychain is unusable from an ad-hoc signed app.** macOS ties a keychain
entry to the exact binary that made it, and `codesign -s -` mints a new identity
every build — so every rebuild of the Mac app triggered "Insight wants to use
your confidential information", and Always Allow either failed or lasted exactly
one build. The Mac token now sits in an owner-only file, which is what DPAPI
amounts to on the Windows side anyway. Don't put it back.

**Never render a blank page.** A failed key check left `status: "checking"`
forever and the gate returned `null`. On an app that can't reset passwords, a
blank screen where your data should be reads as data loss.

---

## The Windows app

`windows/`, C# on .NET 8, WinForms tray app, published as one self-contained
exe. It added no endpoints: it pairs at `/devices`, polls
`GET /api/devices/session`, posts to `POST /api/devices/activity` with app names
in the `domain` field, and its data lands in `PendingDeviceData` like the
extension's. `windows/README.md` is the detail; the four constraints from the
brief are held in `Tracker.cs`, and `GetWindowText` is not imported anywhere in
the project, which is what makes "app names only" a fact rather than a promise.

**Three decisions that weren't in the brief:**

- **Browsers are skipped entirely**, because the extension already counts them.
  Counting both would double every web minute — and the two would disagree about
  it, since the extension files YouTube as distracted while a process tracker
  files chrome.exe as focused. A student with no extension loses their browser
  time here, which is a gap rather than a wrong answer.
- **Some apps report their website's name** — Spotify as `spotify.com`, Steam as
  `steampowered.com`, in `Apps.Aliases`. Focus Mode and the distraction split
  are both defined by the blocklist, which `normalizeSite` only lets be
  hostnames, so an app reported as "Spotify" would be unblockable and forever
  counted as focused. A game launched *through* Steam still reports its own name
  and still counts as focused; fixing that needs a server-side idea of blocked
  apps, which means a new endpoint and a new settings screen.
- **Ten minutes idle stops the clock**, backdated to the last keypress. A
  desktop has no equivalent of a browser losing focus, so without it a laptop
  left open on a game bills the whole afternoon.

## Focus Mode reaches apps, not just sites

Each block category in `src/lib/blocklist.ts` carries an `apps` list beside its
`sites`, and `buildBlocklist` merges both into the one flat list the session
endpoint already sends. **No code in the matcher changed and no endpoint
changed** — `matchesBlocklist` lowercases and compares exactly, so an app name
can never collide with a hostname or vice versa. One list, one matcher, and no
way for "blocked" and "counted as a distraction" to drift apart.

This is what finally makes a game blockable. Valorant, Fortnite, Minecraft and
the rest are their own executables with no website to match on, so a blocklist
of hostnames never touched them — they were unblockable *and* silently counted
as focused time, whatever the student chose.

Two things follow:

- **The app lists carry several spellings each** — "VALORANT", "Riot Client",
  "League of Legends" — because a desktop app reports whatever its own metadata
  says, and a name nobody guessed is a game that quietly isn't blocked.
- **`normalizeEntry` replaces `normalizeSite`** for anything a student types, so
  they can block *or allow* an app by name. The escape hatch matters more than
  the addition: the curated list will get something wrong — VLC is on it, and
  someone watches lessons in VLC — and a student who can't fix that turns Focus
  Mode off entirely, which blocks nothing.

**`POST /api/devices/activity` now stages rows under the real `DeviceKind`**
rather than a hardcoded `BROWSER_EXTENSION`. Nothing reads that column yet — the
browser encrypts whatever is staged — but it was a lie in the one table anybody
auditing the privacy design reads first.

---

## The Mac app

`mac/`, Swift and AppKit, a menu bar app built with SwiftPM — no Xcode project,
Command Line Tools is enough. `./build-app.sh` wraps the binary in
`dist/Insight.app`, about 320KB because AppKit is already on every Mac.

Same rules, same two endpoints, same three decisions as Windows, and
`Sources/Insight/SelfTest.swift` mirrors `windows/SelfTest.cs` case for case so
the two apps' agreement is visible rather than assumed.

**Where the Mac differs:**

- **"App names only" is enforced by the OS, not by us.** Reading another app's
  window titles needs Accessibility permission, which this app never requests —
  so the absence of that prompt in System Settings is the proof. On Windows the
  equivalent guarantee is "we didn't import `GetWindowText`", which is weaker.
- **Bundle identifiers instead of executable names.** `com.spotify.client` is
  exact where `spotify.exe` is a guess, so `Apps.aliases` is keyed on them, with
  a name table behind it for re-signed builds.
- **The token lives in an owner-only file**, not the keychain — see the gotcha
  above, it was tried.
- **Gatekeeper is stricter than SmartScreen.** Double-clicking an unsigned app
  is refused with no way through in the dialog; right-click → Open → Open is the
  route, once. Getting rid of that needs the same $99/yr account that makes iOS
  impossible, so it isn't planned.
- **Blocked apps are quit, not hidden.** Hiding was the first attempt and it
  was toothless — one Cmd-Tab and you were back. Both apps now send the polite
  quit (`terminate()` on the Mac, `CloseMainWindow` on Windows), so an app with
  unsaved work still gets to put up its save dialog, and an override starts the
  app again rather than leaving the student to go and find it.

**The bug worth remembering:** the self-exclusion check was
`bundleId == Bundle.main.bundleIdentifier`, and outside a .app bundle both sides
are nil — so every app without a bundle id was silently dropped. The self-test
caught it on its first run.

---

## Outstanding, for Kapilesh

- **Rotate the leaked credentials.** Neon database password, Groq and Resend
  keys, and one extension pairing code all appeared in screenshots pasted into
  chat.
- **Get a domain** — GitHub Student Pack (days) or eu.org (1-2 weeks). Unblocks
  Clerk production *and* real parent emails.
- **Real bell times** into `/admin/schedules`. The seeded ones match the
  district calendar's start and end times but the internal period splits were
  reconstructed, not published.
- **Five calendar dates** the extractor couldn't resolve, listed on that same
  page.
- **Legal review** of the COPPA consent flow before real under-13 students.
- **Log real sessions.** The insight engine has passed 108 tests and never seen
  a human.
