import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateDevice } from "@/lib/device-tokens";
import { DEFAULT_CATEGORIES, buildBlocklist } from "@/lib/blocklist";

/**
 * What the extension polls to know whether to be recording.
 *
 * The website owns session state; the extension only follows. That means
 * starting a session on a phone still starts recording on the laptop, and a
 * student never has two half-truths about whether they're studying.
 */

export const dynamic = "force-dynamic";

/// Extensions fetch cross-origin from an unpredictable `chrome-extension://`
/// origin, so an allowlist isn't possible. That's acceptable here because
/// every route below authenticates a bearer token rather than a cookie —
/// there is no ambient authority for a hostile page to borrow.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request: Request) {
  const device = await authenticateDevice(request.headers.get("authorization"));
  if (!device) {
    return NextResponse.json(
      { error: "Unauthorised" },
      { status: 401, headers: CORS },
    );
  }

  const [running, prefs] = await Promise.all([
    db.studySession.findFirst({
      where: { userId: device.userId, endedAt: null },
      orderBy: { startedAt: "desc" },
      select: { id: true, startedAt: true, focusModeActive: true },
    }),
    db.user.findUnique({
      where: { id: device.userId },
      select: {
        blockCategories: true,
        blockExtra: true,
        blockAllowed: true,
      },
    }),
  ]);

  // An empty array means "never chosen", not "block nothing" — the default is
  // applied here so it can change later without backfilling every row.
  const categories =
    prefs && prefs.blockCategories.length > 0
      ? prefs.blockCategories
      : DEFAULT_CATEGORIES;

  return NextResponse.json(
    {
      session: running
        ? {
            id: running.id,
            startedAt: running.startedAt.toISOString(),
            focusMode: running.focusModeActive,
          }
        : null,
      // Sent every poll so a student changing the list on the website takes
      // effect within the minute, without touching the extension.
      blocklist: buildBlocklist({
        categories,
        extra: prefs?.blockExtra ?? [],
        allowed: prefs?.blockAllowed ?? [],
      }),
    },
    { headers: CORS },
  );
}
