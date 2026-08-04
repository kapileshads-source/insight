import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendCanvasExpiryWarning, sendWeeklyRecap } from "@/lib/email";

/**
 * Scheduled jobs, driven by an external cron hitting this endpoint.
 *
 * Two jobs, both of which have to work without reading any student data:
 *
 * Canvas expiry warnings. FISD caps tokens at 90 days, so one made on the
 * first day of school dies around mid-November — roughly five weeks before
 * December finals. Warning at 14, 3 and 0 days is the difference between a
 * one-minute reconnect and a silent gap across the term's biggest grades.
 *
 * The weekly recap, which is only a nudge. The numbers can't be in it because
 * we can't read them.
 */

export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // No secret configured means the endpoint stays shut rather than open.
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
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

async function runWeeklyRecaps(): Promise<number> {
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

export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const job = searchParams.get("job");

  try {
    if (job === "canvas-expiry") {
      return NextResponse.json({ sent: await runCanvasExpiryWarnings() });
    }
    if (job === "weekly-recap") {
      return NextResponse.json({ sent: await runWeeklyRecaps() });
    }
    return NextResponse.json(
      { error: "Unknown job. Use ?job=canvas-expiry or ?job=weekly-recap" },
      { status: 400 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Job failed" },
      { status: 500 },
    );
  }
}
