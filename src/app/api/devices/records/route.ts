import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateDevice } from "@/lib/device-tokens";

/**
 * The study log, for a client that is not the website.
 *
 * The companion to `/api/devices/gradebook`, and the other half of what a
 * second client needs. Sessions, sleep, screen time, scores, and what the
 * extension measured during each session: everything the insight engine runs
 * on.
 *
 * **All of it is ciphertext**, and the engine itself is not here. Patterns are
 * computed on the device, over decrypted rows, by `insights.ts`. Moving that
 * to the server would mean the server could read a study log, which is the one
 * thing this design exists to prevent, so a client wanting insights ports the
 * engine rather than asking for the answer. It is pure arithmetic over plain
 * arrays and has no dependencies, which is deliberate and is what makes that
 * possible.
 *
 * The limits match `fetchEncryptedRecords` exactly. They are generous enough
 * for a school year and bounded so a single request cannot become megabytes on
 * a phone connection.
 */

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

  const userId = device.userId;

  const [sessions, sleep, screenTime, outcomes, activity] = await Promise.all([
    db.studySession.findMany({
      where: { userId, endedAt: { not: null } },
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        payloadCipher: true,
        payloadIv: true,
      },
      orderBy: { startedAt: "desc" },
      take: 500,
    }),
    db.sleepEntry.findMany({
      where: { userId },
      select: { forDate: true, payloadCipher: true, payloadIv: true },
      orderBy: { forDate: "desc" },
      take: 400,
    }),
    db.screenTimeEntry.findMany({
      where: { userId },
      select: {
        forDate: true,
        source: true,
        payloadCipher: true,
        payloadIv: true,
      },
      orderBy: { forDate: "desc" },
      take: 400,
    }),
    db.outcome.findMany({
      where: { userId },
      select: {
        id: true,
        occurredOn: true,
        payloadCipher: true,
        payloadIv: true,
      },
      orderBy: { occurredOn: "desc" },
      take: 300,
    }),
    db.extensionActivity.findMany({
      where: { session: { userId } },
      select: { sessionId: true, payloadCipher: true, payloadIv: true },
      orderBy: { recordedAt: "desc" },
      take: 2000,
    }),
  ]);

  return NextResponse.json(
    { sessions, sleep, screenTime, outcomes, activity },
    { headers: CORS },
  );
}
