# Insight, explained

Written for Kapilesh and Sahas to learn the system well enough to defend it,
and to answer the Congressional App Challenge questions honestly.

Read `HANDOFF.md` for *what exists*. This is *why*, and it is ordered so each
section explains the one after it.

---

## 1. What it is, in one sentence

**Insight shows a student which of their own habits line up with their test
scores, and nobody else — including us — can read their data.**

That sentence is the whole app. The second half is not a feature bolted on; it
is the constraint that decided almost every technical choice below, and it is
the thing worth talking about, because most study-tracker apps make the
opposite trade.

---

## 2. The one idea, and everything that follows

Student data is encrypted **in the browser**, with a key derived from a
password that never leaves the device.

- The password goes through PBKDF2-SHA256, 600,000 iterations, producing a
  key-encryption key.
- That unwraps a random data key, which encrypts everything.
- There is no password reset, because there is nothing to reset *with*. We
  cannot recover data we cannot read.

`src/lib/crypto.ts`.

### What follows from it

Almost every unusual thing in this codebase is downstream of that one decision:

| Consequence | Why |
|---|---|
| **The insight engine runs in the browser** | It compares test scores to study sessions. The server can't read either, so it can't do the maths. `src/lib/insights.ts` runs client-side. |
| **Canvas sync can't be a cron job** | The server *can* call Canvas, but it has no key, so it would have nowhere to put what it fetched. Data round-trips through the student's tab to be encrypted. |
| **De-duplicating HAC rows happens in the browser** | HAC has no assignment ids, so "have I seen this?" is a question about content — and content is encrypted. |
| **Trackers never hold a key** | A program running on a laptop all day is the last place a decryption key should live. |
| **Nudge notifications contain no data** | The server has none to put in them. Which also means a lock screen never shows a grade to whoever picks up the phone. |

### The schema rule

**Structure is plaintext, content is not.**

Row existence, foreign keys, and the timestamps needed for ordering stay
readable, so the database is still a database. Anything a student would
consider private lives in an encrypted blob.

This is what lets the server do useful work while blind. It can tell that *a
sleep entry for Tuesday is missing* — that's row existence — without ever
learning how long anyone slept. That single distinction is how the daily
reminders work.

Four documented exceptions, all in `prisma/schema.prisma`, each with a reason
written next to it. Know **`PendingDeviceData`** in particular: it is the one
place plaintext exists, because the trackers can't encrypt, and it is deleted
within six hours.

---

## 3. The shape of the system

**One web app** (Next.js 16, Postgres via Prisma 7, deployed on Vercel), plus
**five clients** that all speak to the same two endpoints:

| Client | Counts | Blocks apps | Blocks sites |
|---|---|---|---|
| Browser extension | sites | — | yes |
| Windows (C#) | apps | yes | — |
| Mac (Swift) | apps | yes | — |
| Android (Kotlin) | apps + browsers | yes | yes, via DNS |
| iPhone (Swift) | — | — | — |

And **two gradebooks**: Canvas (an API, with a token) and HAC (no API — a web
page we read).

The clients pair with a token minted at `/devices`, hashed before storage
(`src/lib/device-tokens.ts`), and revocable instantly.

---

## 4. The insight engine

The part a judge will ask about, because it's the actual product.

### How it works

For each test score, look at the study sessions in the seven days before it.
Split those into two groups by one factor — late-night vs not, at home vs not,
below-average sleep vs not — and compare the mean score of each group.

Seven factors: sleep, study timing, session length, location, noise, phone
usage, distraction.

### Why it's careful, which is the interesting part

A naive version of this produces confident nonsense. Ours refuses to speak
until:

1. **Enough sessions** — at least 8 behind the comparison
2. **Both groups populated** — at least 3 outcomes each side
3. **A real difference** — at least 5 percentage points
4. **It actually held** — the pattern true at least 60% of the time
5. **Across more than one week or subject** — so one bad unit can't become a
   permanent "insight"
6. **Better than chance** — see below

### The permutation test

This is the bit worth understanding properly.

Seven factors compared against ~25 scores will throw up big-looking differences
by luck alone. When I drove the engine with 25 *generated* students, **28 of
the 65 findings it surfaced had no effect built into the data at all** — and
one arrived with the wrong sign.

So: keep the two group sizes, shuffle which scores land in which group a
thousand times, and count how often chance produces a gap this big. Above 5%,
it isn't a finding. Invented findings dropped from 28 to 5. Real ones dropped
too, 37 to 16 — and that is the right way round for something that tells a
fifteen-year-old their scores drop.

`chanceOf()` in `src/lib/insights.ts`. The shuffle is **seeded**, because an
insight that appears on one page load and vanishes on the next is worse than
one that never appears — a student can't tell that apart from their own data
changing.

### The wording

Every statement says *"came before"*, never *"caused"*. There are tests that
fail if that slips. Comparisons are always against the student's own average,
never a general recommendation — "less than your own average", not "less than
8 hours".

---

## 5. Blocking, and why each platform is different

One matcher, five enforcers. `src/lib/blocklist.ts` builds a single flat list
of hostnames *and* app names; matching is exact and lowercased, so an app name
can never collide with a hostname. That is what makes a game blockable at all —
Valorant is an executable with no website.

- **Extension** — redirects the tab. Most precise.
- **Windows** — `CloseMainWindow`, the polite close, so unsaved work prompts.
- **Mac** — `terminate()`, the same thing Cmd-Q sends.
- **Android** — replaces the app *and* calls `killBackgroundProcesses`, because
  covering an app left it running behind the screen. Also blocks sites through
  a local VPN carrying nothing but DNS.
- **iPhone** — can't block anything. Apple gates it behind `FamilyControls`,
  which is granted rather than sold.

Everywhere: the override is three seconds, is recorded, and holds for the rest
of the session. A hard lock gets uninstalled, and an uninstalled app blocks
nothing.

### The Android DNS tunnel

Worth understanding because it sounds invasive and is the opposite. It routes
**one address** — the resolver it advertises. Web traffic, messages, video
never enter the process. Blocked names get NXDOMAIN; everything else is
forwarded to the resolver the phone was already using, unread. Sending lookups
to a public resolver instead would have needed no permission and would have
quietly moved a student's browsing history to a company they didn't choose.

---

## 6. The hard problems

These are the good answers to *"what technical difficulty did you face?"*

### Matching two gradebooks with no shared id

HAC has no assignment ids at all. So Canvas ↔ HAC matching is done on words,
dates and numbers — `src/lib/assignment-match.ts`.

The rule it's built on: **a wrong merge is far worse than a missed one.** A
missed match shows two rows where you expected one, and you can see that. A
wrong merge silently averages two different tests into one grade, which nobody
ever notices and which corrupts every correlation drawn on top.

So scoring is asymmetric: agreement nudges confidence up, but specific
disagreements *veto* a pairing outright however similar the titles look — a
retake marker, a mismatched unit number, a points mismatch, a 14-day gap.
"Unit 2 Test" and "Unit 2 Test Retake" score nearly identically on every other
signal.

And it's a **link, not a merge**. Merging would make a wrong guess
unrecoverable. A link is reversible, and it's what allows a middle confidence
band where the student is asked instead of guessed at.

### Reading HAC without a password

HAC has no API. The obvious approach — and what an existing public project
does — is to log in with the student's credentials.

We don't, and the reasoning matters: that password is usually the same one
behind their school email and Google account. The existing project passes it in
a **URL query string**, which lands in access logs, browser history and
referrer headers.

Instead: the student is already logged into HAC in their browser, so the
extension fetches the page with the session cookie that's already there. No
password is typed, stored, or sent. A web page can't do this itself — HAC sends
no CORS headers — which is the entire reason the extension is involved.

Parsing binds to **header labels**, not cell positions. Every other parser of
this page reads `tds[4]` and silently returns the wrong field when a campus adds
a column.

### Time accounting

Sessions are measured against stored timestamps, not counted by a ticker, so a
sleeping laptop neither invents nor loses minutes. Idle time closes a slice
back-dated to the last keypress, not to the moment we noticed.

---

## 7. What went wrong, and what it taught

Be ready to talk about this. It's more convincing than a list of features, and
it's true.

**Five features had passing tests and did not work.**

1. **Android site blocking had never once worked** — on any build. A missing
   `ACCESS_NETWORK_STATE` made the DNS thread die on its first instruction,
   behind a `catch` that discarded the exception. Consent granted, service
   running, notification showing, tunnel established — every observable signal
   said healthy.
2. **The study-timing factor could never fire.** It took the *maximum* start
   hour across a week, so a single 11pm session marked the whole week late.
   Every outcome landed in the same group, the control group was empty, and the
   factor silently vanished — for anyone who ever studied late.
3. **Every session lost its last minute, on all three trackers.** `closeSlice()`
   ran after `session` was already null, so it bailed and the tally was empty.
   The comment directly above it described exactly the bug it failed to prevent.
4. **Half the insights were coincidences** — the permutation test above.
5. **A positive finding rendered as "+8%" beside the words "came before lower
   scores"**, because the phrasing function ignored the sign it was handed.

**Why the tests missed all five:** every test asserted the behaviour as
written. A wrong design passes its own description. The tests weren't bad —
they were the wrong instrument.

**What actually found them:** driving the real thing. Pointing the Mac app at a
stub server and watching what it sent. Generating a student who really has the
problem *and* one who has none, and checking the engine finds the first and
stays quiet about the second. Rendering the component and looking at it. Using
`adb` instead of three rounds of "install this and tell me what it says".

That is the single most useful thing learned building this, and it is a real
answer to "what was your biggest takeaway".

---

## 8. The CAC questions

Shape these in your own words — do not submit mine.

**What is the title of your app?** Insight.

**Explain the app's purpose.** It shows a student which of their own habits —
sleep, study timing, phone use, where they work — line up with their test
scores, using their own data, encrypted so that nobody else can read it.

**What inspired you?** Yours to answer honestly.

**What technical difficulty did you face, and how did you address it?** Best
options, in order: the permutation test (§4); matching two gradebooks with no
shared id (§6); reading HAC without ever handling a password (§6). Any of the
three is a real answer with a real trade-off in it.

**What did you learn? Biggest takeaway?** §7. "Passing tests are not working
software, and here are five specific times that bit me" is a better answer than
almost anything else you could say.

**What would you change in a 2.0?** Honest candidates: iOS is a second-class
citizen and `FamilyControls` would fix it; the insight engine compares one
factor at a time and can't tell a real effect from a confounded one; nothing
has been tested by anyone other than us.

### The AI disclosure

The rules permit AI and require it be **fully disclosed**, that it not
constitute the *entirety* of development, and that you show significant
individual contribution and technical understanding.

Every commit in this repository credits Claude as co-author. That is an honest
record and you should point at it rather than around it. Two things follow:

1. **Say so plainly in the submission.** Understating it is the one thing that
   could actually disqualify you; disclosing it is explicitly allowed.
2. **Be able to defend the code.** Rule 7.3 lets judges request the source and
   question you on it, and failing to honour that is immediate disqualification.
   This document exists so you can.

The strongest version of your submission is one where the remaining work is
visibly yours. There is plenty left — the video, real data, the district
rollout, whatever you build next — and doing that yourselves is worth more than
another feature.

---

## 9. Where to look

| Question | File |
|---|---|
| How is data encrypted? | `src/lib/crypto.ts` |
| How are insights computed? | `src/lib/insights.ts` |
| What gets blocked? | `src/lib/blocklist.ts` |
| How are gradebooks matched? | `src/lib/assignment-match.ts` |
| How is HAC read? | `src/lib/hac.ts`, `extension/hac-bridge.js` |
| Why is the schema like that? | `prisma/schema.prisma` — comments |
| What bit us? | `HANDOFF.md` |
| What data exists, for legal review | `DATA.md` |

Almost every non-obvious decision has a comment above it explaining the
alternative that was rejected and why. If something looks strange, the reason
is usually written next to it.
