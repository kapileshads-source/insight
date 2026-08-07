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

`npm test` runs 181 tests. `npm run build` regenerates the Prisma client,
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
place device data is server-readable. Both privacy pages now say so in as many
words, including what it means in practice — a reader should not have to infer
it from the schema.

Consequence of all this: the insight engine runs **in the browser**
(`src/lib/insights.ts`, called from `src/components/study-panel.tsx`), because
the server can't read its inputs.

---

## What's built

Website, all deployed and working:

- Auth (Clerk, Google + email code, **no password** — deliberately)
- Onboarding: birthdate gate (13+, under-13 turned away) → encryption password
  → school + grade → devices
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

## Thirteen and over

Under-13 accounts are turned away at the birthdate gate rather than routed
through parental consent. `isTooYoung` in `src/lib/user.ts` is the whole
decision; `MINIMUM_AGE` is 13 because that is where COPPA's line sits, not
because of what year a student is in — some ninth-graders are twelve in August,
and "high school only" would have let them in.

**The consent flow is dormant, not deleted.** `requiresParentConsent`,
`ParentConsentStep`, the token route and the email are all still there and still
work. What made it unusable was never the code: verified parental consent means
real emails reaching real parents reliably, and this project has no domain yet,
so Resend delivers to the developer and nobody else. A consent request that goes
quietly to spam fails in the worst available way — the student is stuck, the
parent never knew, and nothing anywhere says so.

So the honest position is to decline the age group rather than half-serve it.
Flip it back when there's a domain, proven delivery, and a legal read.

Knock-on effects, all done: both privacy pages say 13+ and no longer promise a
consent flow, and the parents page is now a general explainer rather than a
consent form.

---

## The baseline, and why the checklist has one row where it used to have two

`/baseline` fills in `User.profileCipher` — usual sleep and wake times, usual
place and noise. **No migration was needed**: the column and `ProfilePayload`
already existed and had simply never been written to.

The dashboard checklist had two dead rows for this, and it now has one, because
of the encryption model rather than laziness. The server can see that a baseline
exists and nothing whatsoever about what is in it, so "sleep times done, place
not yet" is not a question it can answer. The alternatives were a plaintext flag
per half — putting a fact about a student's data on the structure side of the
line for the sake of a tick — or decrypting the checklist in the browser, which
means a client component that shows nothing useful while the app is locked. One
row, one page, saved in a single go, so done means done.

Times are minutes from midnight, like the bell schedules. `nightLength` wraps
past midnight: bedtimes cross it and wake times don't, so plain subtraction
would have told a student they slept minus four hours.

Also fixed while in there: "Install the extension" was ticked only by a browser
extension, so a student on the Mac app was nagged forever about a checkbox they
had deliberately skipped. Any paired device counts now.

---

## Getting the extension onto a student's machine

**"Load unpacked" is a developer workflow, not a distribution plan.** On a
district-managed laptop or Chromebook, developer mode is usually disabled by
policy, which means every device feature — activity tracking, Focus Mode, and
the whole HAC plan, which needs a content script — is unavailable to exactly the
students the pilot is for.

The two real routes:

- **Chrome Web Store**, a one-time $5 developer registration. Students install
  in one click, updates ship automatically, and nothing is sideloaded. Unlisted
  publishing is available if it shouldn't be public.
- **Force-installed by district IT** via policy, which needs a sponsor but works
  on managed fleets and takes the decision away from the student.

`extension/STORE.md` has every field the store form asks for, written out to
paste: listing copy, the single-purpose statement, a justification per
permission, the two data-usage disclosures that are true (authentication
information for the pairing code, web history for session hostnames), and the
zip command — zip the *contents*, not the folder, or the manifest isn't at the
root. Publish it **unlisted**: installable by link, not findable by search.

The manifest is ready for either. Icons at 16/48/128, and — the part a
reviewer or an IT department actually looks at — **`<all_urls>` is gone**. It was
never needed: tab hostnames come from the `tabs` permission, and the only thing
fetched is the student's own Insight server. `host_permissions` is now just the
production origin, with anything else requested at pairing time through
`chrome.permissions.request`. An extension that asks for every site on the
internet is one a school is right to refuse.

Note for local development: pairing against a dev server on a LAN address now
triggers a permission prompt in the popup rather than working silently.

---

## If we do HAC

Not built. But the reconnaissance cost two people real effort, so it lives here
rather than in a chat log. `src/lib/assignment-match.ts` is written and tested;
nothing imports it yet.

**Never take a HAC password.** It is the student's district identity — often the
same credential as their district Google account — and it unlocks schedule,
attendance and discipline records. It is not comparable to the Canvas token,
which is scoped, revocable and expires in 90 days. The one design that avoids it
entirely: a **content script on `hac.friscoisd.org`**, reading pages the student
is already logged into. Same-origin, so cookies apply and CORS never enters it,
and no login handshake is needed — which also skips the whole
`__RequestVerificationToken` / `Database: "10"` / hidden-fields dance that
server-side scrapers need. A plain web page cannot do this: HAC sends no CORS
headers and its session cookie is `HttpOnly`. The extension is what makes it
possible.

**Upcoming work is at `/HomeAccess/Home/WeekView`, not `Assignments.aspx`.** It
takes `?startDate=MM/DD/YYYY`, so a semester is a loop over week starts, no
`__VIEWSTATE` postback. Each row carries a multiline `title=""` attribute with
due date, max points, category, type, droppable and extra-credit flags, plus
course, period and teacher on the same row — richer than the gradebook page, and
it avoids joining courses on name alone.

**On `Assignments.aspx`: cell 0 is the due date, cell 1 is the assigned date.**
Rows are `tr.sg-asp-table-data-row`, course from `div.AssignmentClass`,
score and points in cells 4 and 5. `span.sg-header-sub-heading` on each course
header is a last-updated stamp, which is a staleness signal worth keeping.

**There is no stable assignment id.** Two independent parsers of HAC capture
none, which is decent negative evidence. Hence the matcher.

Three traps found in existing scrapers, all worth not repeating: a `points`
value defaulting to `100.0` when unparseable (a 5-point warm-up silently becomes
a 100-point assignment); recomputing course grades when HAC never exposes
category weights; and parsing by positional cell index, which fails *silently*
when a column is inserted — bind to header labels instead.

Still unknown: whether the assignments table has a header row to bind to, and
whether ungraded work appears there at all. Both are answerable by opening the
page in DevTools once school starts.

**One thing not to copy:** `SumitNalavade/FriscoISDHACAPI` passes username and
password as URL query parameters, which land in server logs and browser history.
Don't, and don't point students at any hosted instance of it.

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
