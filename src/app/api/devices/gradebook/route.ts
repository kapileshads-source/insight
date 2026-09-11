import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateDevice } from "@/lib/device-tokens";

/**
 * The gradebook, for a client that is not the website.
 *
 * Every other device route writes. This one reads, and until now there was no
 * way to read anything from outside the web app: the browser gets its data
 * through Next.js server actions, which a Swift app or a browser extension
 * cannot call. So the iOS app could start and stop a session and nothing else,
 * and any second client would have been blind.
 *
 * **What comes back is ciphertext.** The server cannot decrypt these rows and
 * does not try. A caller needs the student's key to make sense of any of it,
 * which on iOS means `Crypto.swift` and on the web means `crypto.ts`. That is
 * the whole architecture and this route does not get to be an exception to it,
 * which is why there is no "give me my GPA" endpoint: the GPA is computed from
 * decrypted rows, on the device, by `presentGpa`.
 *
 * The shape deliberately matches `fetchGradebook`, so a client porting logic
 * from the web app is reading the same fields in the same order.
 */

export const dynamic = "force-dynamic";

/// Same reasoning as the other device routes: an extension's origin is
/// unpredictable, and every route here authenticates a bearer token rather
/// than a cookie, so there is no ambient authority for a hostile page to
/// borrow.
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

  // One grading period, roughly. The same 120 day window the web app uses, so
  // the two never disagree about which term is current.
  const since = new Date();
  since.setDate(since.getDate() - 120);

  const [courses, assignments, transcript] = await Promise.all([
    db.course.findMany({
      where: { userId: device.userId, active: true },
      select: {
        id: true,
        canvasId: true,
        payloadCipher: true,
        payloadIv: true,
      },
    }),
    db.assignment.findMany({
      where: {
        userId: device.userId,
        OR: [{ dueAt: { gte: since } }, { dueAt: null }],
      },
      select: {
        id: true,
        courseId: true,
        source: true,
        dueAt: true,
        updatedAt: true,
        completedAt: true,
        payloadCipher: true,
        payloadIv: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 600,
    }),
    // The transcript lives on the user row rather than a table of its own.
    db.user.findUnique({
      where: { id: device.userId },
      select: { transcriptCipher: true, transcriptIv: true },
    }),
  ]);

  return NextResponse.json(
    {
      courses,
      assignments,
      transcript:
        transcript?.transcriptCipher && transcript.transcriptIv
          ? {
              cipher: transcript.transcriptCipher,
              iv: transcript.transcriptIv,
            }
          : null,
    },
    { headers: CORS },
  );
}
