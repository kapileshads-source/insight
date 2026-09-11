import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendCanvasExpiryWarning, sendWeeklyRecap } from "@/lib/email";
import { sendDueWorkNudges, sendNudges } from "@/lib/push";

/**
 * Scheduled jobs, driven by an external cron hitting this endpoint.
 *
 * Two jobs, both of which have to work without reading any student data:
 *
 * Canvas expiry warnings. FISD caps tokens at 90 days, so one made on the
 * first day of school dies around mid-November, roughly five weeks before
 * December finals. Warning at 14, 3 and 0 days is the difference between a
 * one-minute reconnect and a silent gap across the term's biggest grades.
 *
 * The weekly recap, which is only a nudge. The numbers can't be in it because
 * we can't read them.
 *
 * Both schedules also carry a push notification, because Vercel's Hobby plan
 * allows two cron entries and both were already spoken for, and because the
 * two times happen to be exactly right. 13:00 UTC is 8am in Frisco, when a
 * student can answer "how did you sleep?"; 23:00 UTC is 6pm, when the day is
 * over enough to answer "how much phone time?" without guessing.
 */

export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // No secret configured means the endpoint stays shut rather than open.
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/// Delete staged device data nobody collected.
///
/// `PendingDeviceData` is the one table holding plaintext a student would
/// consider private, the sites and apps they used during a session, and it
/// carries an `expiresAt` six hours out. Reads have always filtered on it, and
/// rows are deleted the moment a browser collects them.
///
/// What was missing is this: a student who stops opening Insight leaves rows
/// nobody ever collects, and a filtered read is not a deletion. They sat in
/// Postgres indefinitely while both privacy pages said "anything nobody
/// collects is deleted after six hours regardless". Now that is true.
async function runStagingCleanup(): Promise<number> {
  const { count } = await db.pendingDeviceData.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  return count;
}

async function runCanvasExpiryWarnings(): Promise<number> {
  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 14);

  const connections = await db.canvasConnection.findMany({
    where: { expiresAt: { not: null, lte: horizon } },
    include: { user: { select: { email: true } } },
  });

  let sent = 0;
  for (const c of connections) {
    if (!c.expiresAt) continue;
    const days = Math.ceil((c.expiresAt.getTime() - now.getTime()) / 86_400_000);

    // Three points only. A daily reminder for two weeks trains people to
    // ignore the mail, which defeats the purpose.
    if (days !== 14 && days !== 3 && days > 0) continue;
    if (days < 0) continue;

    const res = await sendCanvasExpiryWarning(c.user.email, days);
    if (res.ok) sent++;
  }
  return sent;
}

/// Is it Sunday in Frisco right now?
///
/// The recap is scheduled daily rather than weekly on purpose. Vercel's Hobby
/// plan rejects any cron expression firing more than once a day, and while a
/// weekly one is technically less frequent, relying on that reading is a
/// deploy-time gamble. Running daily and checking the day here is boring and
/// certain. It also survives Vercel's "timing guaranteed within the hour"
/// caveat, which could otherwise slide a 23:00 UTC job into Monday.
function isRecapDay(now: Date): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
  }).format(now);
  return weekday === "Sun";
}

async function runWeeklyRecaps(force: boolean): Promise<number> {
  if (!force && !isRecapDay(new Date())) return 0;

  // Only students who have actually logged something in the last week. A
  // recap saying nothing happened is not worth an email.
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const active = await db.user.findMany({
    where: {
      onboardingCompletedAt: { not: null },
      studySessions: { some: { startedAt: { gte: weekAgo } } },
    },
    select: { email: true },
  });

  let sent = 0;
  for (const u of active) {
    const res = await sendWeeklyRecap(u.email);
    if (res.ok) sent++;
  }
  return sent;
}

async function handle(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const job = searchParams.get("job");

  try {
    if (job === "canvas-expiry") {
      // The staging sweep rides along here rather than in a job of its own:
      // Vercel's Hobby plan allows two cron entries and both are spoken for.
      // It is unrelated work sharing a schedule, which is worth knowing when
      // one of them fails.
      const purged = await runStagingCleanup();
      // 13:00 UTC is 8am in Frisco, which is when a student can actually
      // answer "how did you sleep?", so the morning nudge rides this
      // schedule rather than needing a cron slot there isn't one of.
      const nudged = await sendNudges("SLEEP");
      return NextResponse.json({
        sent: await runCanvasExpiryWarnings(),
        purged,
        nudged,
      });
    }
    if (job === "staging-cleanup") {
      return NextResponse.json({ purged: await runStagingCleanup() });
    }
    if (job === "weekly-recap") {
      // `?force=1` lets you trigger it by hand on a Tuesday to check it works,
      // without waiting until Sunday to find out it doesn't.
      const force = searchParams.get("force") === "1";
      // 23:00 UTC is 6pm in Frisco. The day is over enough to answer "how much
      // phone time?" and early enough that the answer isn't a guess.
      const nudged = await sendNudges("SCREEN_TIME");
      return NextResponse.json({ sent: await runWeeklyRecaps(force), nudged });
    }
    if (job === "due-work") {
      // Driven by GitHub Actions rather than Vercel. The Hobby plan allows two
      // cron entries and both are spoken for, and it refuses any schedule
      // firing more than once a day, while this wants an evening slot that is
      // neither of the other two. A scheduled workflow calling this endpoint
      // with the same bearer token costs nothing and removes the limit, and
      // this route already authenticates by secret rather than by Vercel's
      // signature, so nothing here had to change to allow it.
      return NextResponse.json({ nudged: await sendDueWorkNudges() });
    }
    return NextResponse.json(
      {
        error:
          "Unknown job. Use ?job=canvas-expiry, ?job=weekly-recap, ?job=due-work or ?job=staging-cleanup",
      },
      { status: 400 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Job failed" },
      { status: 500 },
    );
  }
}

// Vercel's scheduler calls with GET and attaches the bearer token itself when
// the env var is named CRON_SECRET. POST stays for triggering a job by hand.
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
