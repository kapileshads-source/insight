# What Insight collects, and what happens to it

Written for a legal review. Every row below is drawn from `prisma/schema.prisma`
and the code that writes it, not from what the privacy pages say — where the two
disagree, that's noted, because those disagreements are the point of the
exercise.

**Who runs it:** two students at Centennial High School, Frisco ISD. Not
affiliated with, endorsed by, or operated on behalf of the district. Nothing is
shared with the school.

**Who may use it:** students aged 13 and over. Under-13 accounts are turned away
at the birthdate gate (`isTooYoung`, `src/lib/user.ts`), so COPPA's verified
parental consent requirement is not engaged. The consent machinery exists in the
codebase but is unreachable.

---

## The shape of the whole thing

Study data is encrypted **in the student's browser** with a key derived from a
password that never reaches the server. The server stores ciphertext it cannot
read, and no password reset exists — losing the password destroys the data
permanently, including for us.

The rule throughout the schema is **structure is plaintext, content is not**.
Row existence, foreign keys and the timestamps needed for ordering stay readable
so the database is queryable; anything a student would consider private lives in
an encrypted blob.

So the interesting question for a reviewer isn't the encrypted material. It's
the four places where readable data exists, all listed below.

---

## Readable by the server

| What | Where | Why | Retention |
|---|---|---|---|
| Email address | `User.email` | Sign-in, and the only channel for account mail | Life of account |
| Clerk user id | `User.clerkId` | Links to the auth provider | Life of account |
| Date of birth | `User.birthDate` | Age gate. Used for nothing else | Life of account |
| Campus and grade | `User.schoolId`, `gradeLevel` | Bell schedules and the A/B day calendar | Life of account |
| Laptop / phone OS | `User.laptopOs`, `phoneOs` | Which app to offer | Life of account |
| Focus Mode blocklist | `User.blockCategories`, `blockExtra`, `blockAllowed` | The extension has no key, so the server must build the list it enforces | Life of account |
| Session start and end times | `StudySession.startedAt`, `endedAt` | Ordering and de-duplication without decrypting | Life of account |
| Focus Mode on/off, override used | `StudySession.focusModeActive`, `focusModeOverride` | The extension must be told whether to block, and it cannot decrypt | Life of account |
| Dates on every record | `forDate`, `occurredOn` | De-duplication — a second entry for one night must be catchable | Life of account |
| Canvas access token | `CanvasConnection.accessToken` | **Encrypted with a server key**, because the server calls Canvas on the student's behalf | Deleted on disconnect; Canvas expires it at 90 days |
| Device site and app names | `PendingDeviceData.payload` | **Plaintext.** See below | Six hours, then deleted |
| Parent email | `ParentConsent.parentEmail` | Dormant flow, no longer reachable | Life of account |

## Encrypted, unreadable to the server

Study sessions (subject, place, noise, stress, whether it was cramming), sleep
hours, screen time minutes, grades and assignment names, insights, the
extension's per-site tallies once collected, and the student's baseline (usual
sleep and wake times, usual place and noise).

Each is a `payloadCipher` / `payloadIv` pair. AES-GCM, key wrapped by
PBKDF2-SHA256 at 600,000 iterations. `src/lib/crypto.ts`.

---

## The one weak point, stated plainly

`PendingDeviceData` holds **plaintext** site hostnames and application names,
because the browser extension and the desktop apps have no encryption key and
must never have one — a program running on a student's laptop all day is the
last place that key should live.

- Written only while a study session is running.
- Hostnames, never URLs. App names, never window titles.
- Deleted the moment the student's browser collects and encrypts them.
- Expires after six hours regardless, swept when any device reports and again
  daily.

So for a few hours the server can see that a session included twenty minutes of
`youtube.com` — not what was watched, and nothing from outside a session. Both
privacy pages say this in as many words.

---

## Leaves the system

| To | What | Trigger |
|---|---|---|
| **Clerk** | Email address | Authentication. Currently a development instance, capped at 100 users |
| **Groq** | A finished insight pattern, plus names and dates of upcoming assignments | Only when a pattern clears its sample-size gate, and only if the student hasn't turned recommendations off. No name, email, school, grades, sleep, or individual session |
| **Resend** | Email address, message body | Weekly recap and Canvas expiry warnings. Delivers only to the developer until a domain exists |
| **Canvas** | The student's own token | Sync, initiated by the student |
| **Neon** | The database, hosted | Storage. AWS us-east-2 |
| **Vercel** | Hosting and logs | Serving the app |

Nothing is sold, no advertising, and no data is used to train models. The
architecture makes most of that impossible rather than merely prohibited.

---

## Deletion and export

- **Export everything** as a file, decrypted in the browser — `exportEverything`.
- **Delete single entries**, or **delete the account**, which cascades to every
  table via `onDelete: Cascade` — `deleteAccount`.
- **Disconnect Canvas**, which deletes the stored token.
- **Revoke a device**, which stops it recording immediately.
- **Forget the password**, which makes the data permanently unreadable by
  anyone, including us.

---

## Where the pages and the code disagree

Two, found while writing this. A reviewer would ask about both.

**1. Dormant accounts are never deleted, and the page now says so.** It used to
promise an email after 18 months and deletion 30 days later; no job did this and
nothing recorded a last-active date. The claim was removed rather than built,
which leaves a real question for review: **is indefinite retention of a dormant
minor's account acceptable, or is a sweep something we should be obliged to
build?** Deletion by the student works and always has.

**2. Backup retention — unverified.** `/privacy` says deleted data is gone from
backups within 90 days. Nobody has checked what Neon's free tier actually
retains or for how long. Confirm before anyone relies on it.

*(A third, fixed rather than listed: expired `PendingDeviceData` rows were
filtered out of reads but never actually deleted, so plaintext device data
persisted indefinitely for any student who stopped opening Insight. The pages
claimed six hours. It now sweeps on every device report and again daily.)*

---

## Questions worth a lawyer's hour

1. **Texas HB 18 (SCOPE Act)** applies to minors under 18, so dropping to 13+
   didn't clear it. What does it require of a service like this around data
   minimisation, targeted advertising, and parental tools?
2. Do the two privacy pages accurately describe the system? They are written to,
   and that is the claim most worth checking independently.
3. Is anything here **FERPA**-relevant given that grades arrive from Canvas at
   the student's own initiative and the district isn't involved? Does that change
   if the pilot is ever school-sanctioned?
4. What are the notification obligations if `PendingDeviceData` were exposed?
5. Are terms of service needed at all, and does the encryption model — no reset,
   no recovery — need to be disclosed as a term rather than an explanation?
