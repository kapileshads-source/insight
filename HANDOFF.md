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

`npm test` runs 108 tests. `npm run build` regenerates the Prisma client,
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

Data: 30 FISD campuses seeded, real A/B calendar extracted from the district
PDF by sampling cell colours — 82 A days against 82 B days, which is the check
that it's right.

## What's not built

- **Windows / macOS / Android apps** — next up is Windows
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

**Never render a blank page.** A failed key check left `status: "checking"`
forever and the gate returned `null`. On an app that can't reset passwords, a
blank screen where your data should be reads as data loss.

---

## Next task: Windows app

Free to build and distribute by sideloading. SmartScreen shows an
"unrecognised app" warning that users click through; code signing (~$100-300/yr)
would remove it and is not planned.

**What it does:** tracks active window/process time via Win32 APIs, exactly
parallel to the browser extension.

**It plugs into infrastructure that already exists.** Do not build new
endpoints:

- Pair via `/devices` → `pairDevice("WINDOWS_APP")`, token shown once, stored
  hashed (`src/lib/device-tokens.ts`)
- Poll `GET /api/devices/session` with `Authorization: Bearer <token>` for
  session state
- Post to `POST /api/devices/activity` with `{ sessionId, domains, blocked }` —
  send app names in the `domain` field
- Data lands in `PendingDeviceData`, the browser encrypts it on next load
- Distraction measurement and the insight factor already exist
  (`src/lib/blocklist.ts`, `splitActivity`)

**Constraints to preserve, in priority order:**

1. **Nothing recorded without a running session.** Not recorded-and-discarded —
   the timer must not accumulate. This is a promise the privacy page makes.
2. **App names only.** Never window titles, never document names. The extension
   truncates URLs to hostnames for the same reason, enforced in code rather
   than promised.
3. **No encryption key on the device, ever.** Staging table only.
4. Measure elapsed time against a stored timestamp, not a ticker, so sleep and
   suspension neither invent nor lose minutes.

The extension is the reference implementation. `extension/background.js` is
short and the reasoning is in the comments.

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
