# Deploying Insight

**Everything here is free.** No card required at any step. The free-tier
limits are listed so you know where the ceilings are before you hit them.

Budget about an hour, most of it waiting on student verification and DNS.

The code side is already handled: `npm run build` regenerates the Prisma
client, `vercel.json` schedules both cron jobs within Hobby-plan limits, and
the cron endpoint answers Vercel's GET with the bearer token it attaches
automatically when the secret is named `CRON_SECRET`.

---

## What each free tier actually gives you

| Service | Free tier | Where the ceiling is |
|---|---|---|
| **Neon** (database) | 0.5 GB storage, 1 project | Thousands of students before storage matters. Database sleeps after ~5 min idle, so the first request each morning is slow. |
| **Vercel** (hosting) | Hobby, non-commercial | A free pilot qualifies. **Cron: max once per day, timing only guaranteed within the hour, UTC only.** Already accounted for. |
| **Clerk** (login) | 10,000 monthly active users | Includes production instances. Far past a district pilot. |
| **Google OAuth** | Free | Unverified apps using only email/profile scopes are fine. Verification is only needed for sensitive scopes, which we don't request. |
| **Groq** (recommendations) | Free, no card | Rate-limited per minute. We call it at most once per dashboard load, per student. |
| **Resend** (email) | 3,000/month, 100/day | Plenty. **But needs a domain to send to anyone but yourself** — see step 5. |
| **Domain** | Free via GitHub Student Pack | The only item that would otherwise cost money. |

---

## 1. Database — Neon

1. **neon.tech** → sign up with GitHub. No card.
2. Create a project named `insight`, region **AWS us-east-2 (Ohio)** — closest
   to Vercel's default region and to Frisco.
3. Copy the **pooled** connection string (the one containing `-pooler`).
   Serverless functions open many short-lived connections and the direct
   string runs out of slots; the pooler shares a few real ones between them.
4. Keep the direct (non-pooler) string too — migrations want it.

## 2. Vercel

1. **vercel.com** → sign up with the GitHub account that owns
   `kapileshads-source/insight`. Choose **Hobby** when asked. No card.
2. **Add New → Project** → import `insight`. Next.js is detected.
3. Before deploying, open **Environment Variables** and add these for
   Production:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the pooled Neon string |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_…` — from step 3, come back for it |
   | `CLERK_SECRET_KEY` | `sk_live_…` — same |
   | `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` — a **fresh** one, not the dev key |
   | `CRON_SECRET` | `openssl rand -base64 32` again |
   | `CANVAS_BASE_URL` | `https://fisd.instructure.com` |
   | `LLM_PROVIDER` | `groq` |
   | `GROQ_API_KEY` | your rotated key |
   | `RESEND_API_KEY` | your rotated key |
   | `EMAIL_FROM` | `Insight <onboarding@resend.dev>` until step 5 |
   | `NEXT_PUBLIC_APP_URL` | your production URL |
   | `ADMIN_EMAILS` | `kapilesh.rajaravi@gmail.com` |
   | `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
   | `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
   | `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | `/onboarding` |
   | `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | `/onboarding` |

4. Deploy.
5. Build the tables and load the FISD data, from your laptop:

   ```bash
   DATABASE_URL="<direct Neon string>" npx prisma migrate deploy
   ```

   ```bash
   DATABASE_URL="<direct Neon string>" npm run seed
   ```

   `migrate deploy` only applies migrations. It never resets or drops, unlike
   the commands we use locally.

## 3. Clerk production instance

**Blocked until you have a domain — do step 5 first.**

Clerk production instances need DNS records on a domain you own, for session
management and email. A `*.vercel.app` subdomain cannot work, because you
can't add DNS records to a domain Vercel owns.

Until then the development instance runs fine on the Vercel URL. You get an
orange "Development mode" banner, a redirect through `clerk.accounts.dev` on
first load, and Google's consent screen naming Clerk rather than Insight.
Usable for testing with people who know what they're looking at; not for
strangers.

Free, but it changes two things that were quietly handled for you in dev.

1. Clerk dashboard → environment dropdown (says **Development**) → **Create
   production instance** → clone settings.
2. Copy the new `pk_live_` / `sk_live_` into Vercel, then redeploy.
3. **Google OAuth stops being optional here.** Dev instances borrow Clerk's
   own shared Google credentials; production instances don't get them.
   - In Clerk: **SSO connections → Google → Use custom credentials**. Copy the
     redirect URI it shows.
   - **console.cloud.google.com** → your `Insight` project → **Credentials →
     Create credentials → OAuth client ID → Web application** → paste the
     redirect URI → copy the client ID and secret back into Clerk.
   - On the OAuth consent screen, **publish** the app. Only `email`, `profile`
     and `openid` are requested, which are non-sensitive, so no paid or manual
     verification is needed. Leaving it in Testing caps you at 100 users.
4. While you're here: **Configure → Email, phone, username** — confirm
   **Password is OFF** and verification is **Email verification link**. This
   matters more in production than anywhere else, because a login password
   students reuse as their encryption password undoes the encryption.

## 4. Cron

Nothing to configure — `vercel.json` registers both jobs on deploy.

Both run **daily**, which is the Hobby ceiling. The recap job checks whether
it's Sunday in Frisco and returns immediately if not, so it behaves weekly
without needing a weekly cron expression that Hobby might reject.

Verify under **Project → Settings → Cron Jobs** after the first deploy.

## 5. Domain and email — free via GitHub Student Pack

**Start this first. Two other steps depend on it.**

A domain is needed for:

- **Clerk production** (step 3) — DNS records for session management
- **Resend** — DNS records proving you may send as that address

Without one, Resend delivers **only to your own signup address**, so parent
consent emails reach nobody and an under-13 student waits forever. And Clerk
stays on its development instance.

Approval takes a few days, which is why it goes first even though it's
numbered fifth.

1. **education.github.com/pack** → **Get student benefits**.
   - High school students qualify. You need to be 13+ and prove enrollment —
     your FISD school email, or a photo of your student ID.
   - Approval usually takes a few days. Start this early.
2. Once approved, claim a domain from the pack:
   - **Namecheap** — one free `.me` for a year.
   - **Name.com** — one free `.dev`, `.app`, `.live` or similar for a year.
   - Either works. `.app` and `.dev` force HTTPS, which suits us.
3. **Resend → Domains → Add Domain** → add the DNS records it lists at your
   registrar → wait for verification (minutes to an hour).
4. Set `EMAIL_FROM` in Vercel to `Insight <notify@yourdomain>` and redeploy.
5. Optionally point the domain at Vercel too, under **Project → Settings →
   Domains**, so the app lives somewhere nicer than `*.vercel.app`.

**If the student pack is slow or gets rejected**, the pilot still works — just
test consent with your own email as the "parent" address until a domain lands.
Everything else functions. Only real parents are blocked.

**After a year** the domain renews at normal price (~$10–20). That's the one
future cost in the whole stack, and it's a year away.

## 6. Smoke test, in production

Each of these catches a failure that is invisible when you test as yourself.

1. Sign up with a fresh email → magic link arrives → onboarding completes.
2. Second account with an under-13 birthdate → **parent email actually
   arrives at a different address** → consent link works → student continues.
3. Set a password → log a session → hard refresh → unlock screen → unlock.
4. `/privacy` renders. `/admin/schedules` returns 404 on the non-admin account.
5. Trigger a recap by hand without waiting for Sunday:

   ```bash
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://<your-url>/api/cron?job=weekly-recap&force=1"
   ```

## Before students who aren't you

- Real bell times into `/admin/schedules`, plus the five flagged calendar dates
- A lawyer's pass over the consent flow and privacy policy
- Neon sleeps when idle; the first request each morning is slow. Fine for a
  pilot, worth knowing before someone reports it as a bug.
