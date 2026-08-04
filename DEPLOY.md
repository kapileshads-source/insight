# Deploying Insight

Every step here is an account action only a human can take. Do them in order —
each one feeds the next. Budget about an hour, most of it waiting on DNS.

The code side is already handled: `npm run build` regenerates the Prisma
client, `vercel.json` schedules the two cron jobs, and the cron endpoint
answers Vercel's GET with the bearer token Vercel attaches automatically when
the secret is named `CRON_SECRET`.

---

## 1. Database — Neon (free)

1. Go to **neon.tech** → sign up with GitHub.
2. Create a project. Name `insight`, region **AWS us-east-2 (Ohio)** — closest
   to both Vercel's default region and Frisco.
3. Copy the **pooled** connection string (the one containing `-pooler`).
   Serverless functions open many short connections; the direct string runs
   out of slots under load.
4. Keep the direct (non-pooler) string too — migrations want it.

## 2. Vercel

1. **vercel.com** → sign up with the same GitHub account that owns
   `kapileshads-source/insight`.
2. **Add New → Project** → import `insight`. Framework auto-detects Next.js.
3. Before hitting Deploy, open **Environment Variables** and add, for
   Production:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the pooled Neon string |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_…` — from step 3, come back for this |
   | `CLERK_SECRET_KEY` | `sk_live_…` — same |
   | `TOKEN_ENCRYPTION_KEY` | run `openssl rand -base64 32` — do NOT reuse the dev one |
   | `CRON_SECRET` | run `openssl rand -base64 32` again |
   | `CANVAS_BASE_URL` | `https://fisd.instructure.com` |
   | `LLM_PROVIDER` | `groq` |
   | `GROQ_API_KEY` | your rotated key |
   | `RESEND_API_KEY` | your rotated key |
   | `EMAIL_FROM` | `Insight <notify@yourdomain>` after step 5; the resend.dev address until then |
   | `NEXT_PUBLIC_APP_URL` | your production URL, e.g. `https://insight-yourname.vercel.app` |
   | `ADMIN_EMAILS` | `kapilesh.rajaravi@gmail.com` |
   | `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
   | `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
   | `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | `/onboarding` |
   | `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | `/onboarding` |

4. Deploy. First build may take a few minutes.
5. Run the migrations and seed against production, from your laptop:

   ```bash
   DATABASE_URL="<direct Neon string>" npx prisma migrate deploy
   DATABASE_URL="<direct Neon string>" npm run seed
   ```

   `migrate deploy` only applies migrations — it never resets or drops.

## 3. Clerk production instance

1. Clerk dashboard → the environment dropdown (top, says **Development**) →
   **Create production instance** → clone settings.
2. It asks for your domain — the Vercel URL works, a custom domain is better.
3. Copy the new `pk_live_` / `sk_live_` keys into the Vercel env vars from
   step 2, then redeploy.
4. **Google OAuth becomes required here** — production instances don't get
   Clerk's shared credentials. In Clerk: **SSO connections → Google → Use
   custom credentials**, copy the redirect URI it shows. Then
   console.cloud.google.com → your `Insight` project → **Credentials → Create
   credentials → OAuth client ID → Web application**, paste the redirect URI,
   and copy the client ID + secret back into Clerk.
5. While you're in Clerk: **Configure → Email, phone, username** — confirm
   **Password is OFF** and email verification is **Email verification link**.
   This matters more in production than anywhere else.

## 4. Cron

Nothing to configure — `vercel.json` registers both jobs on deploy:

- Canvas expiry warnings: daily 13:00 UTC (7–8am Frisco)
- Weekly recap: Sunday 23:00 UTC (5–6pm Frisco Sunday evening)

Verify under **Project → Settings → Cron Jobs** after the first deploy. Vercel
sends `Authorization: Bearer $CRON_SECRET` automatically because the env var
has that exact name.

## 5. Email domain — Resend

Until this step, Resend only delivers to your own signup address, which means
**parent consent emails will not reach real parents**.

1. Buy a domain anywhere (~$10/yr — the one real cost in this stack).
2. Resend → **Domains → Add Domain** → add the DNS records it lists at your
   registrar → wait for verification.
3. Set `EMAIL_FROM` in Vercel to `Insight <notify@yourdomain>` and redeploy.

## 6. Smoke test, in production

1. Sign up with a fresh email → magic link arrives → onboarding completes.
2. Enter an under-13 birthdate on a second account → parent email actually
   arrives → consent link works.
3. Set password → log a session → hard refresh → unlock screen appears →
   unlock works.
4. `/privacy` renders. `/admin/schedules` 404s for a non-admin account.
5. Trigger a cron by hand and expect `{"sent":0}`:

   ```bash
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://<your-url>/api/cron?job=weekly-recap"
   ```

## Before students who aren't you

- Real bell times into `/admin/schedules`, and the five flagged calendar dates
- A lawyer's pass over the consent flow and privacy policy
- Neon free tier sleeps after inactivity; first request of the morning may be
  slow. Fine for a pilot, worth knowing before someone reports it as a bug.
