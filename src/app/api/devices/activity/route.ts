import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateDevice } from "@/lib/device-tokens";

/**
 * Where a paired device reports what it saw, the extension's hostnames, the
 * Windows app's app names, both in the same `domain` field.
 *
 * It cannot encrypt, it has no key and must never have one, so this writes
 * to a staging table the server *can* read, and the student's browser
 * collects, encrypts and clears it on next load.
 *
 * That staging table is the weakest point in the whole privacy design, and it
 * is deliberately shaped to stay small: rows expire in hours, they hold domain
 * names rather than URLs, and they are deleted the moment they are collected.
 * The privacy page says so rather than implying the extension is end-to-end
 * encrypted, which it isn't.
 */

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const bodySchema = z.object({
  sessionId: z.string().min(1).max(64),
  domains: z
    .array(
      z.object({
        // A hostname, never a full URL. What a student reads on a page is not
        // ours to collect, and truncating at the host is what keeps that true
        // by construction rather than by promise.
        domain: z.string().min(1).max(253),
        seconds: z.number().int().min(1).max(86_400),
      }),
    )
    .max(200),
  blocked: z
    .array(
      z.object({
        site: z.string().min(1).max(253),
        overrideUsed: z.boolean(),
      }),
    )
    .max(200)
    .optional(),
});

/// Staged rows live for six hours. Long enough that a student who closes the
/// laptop and opens it after school still gets their data; short enough that
/// readable activity isn't sitting around for days.
const STAGING_LIFETIME_MS = 6 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const device = await authenticateDevice(request.headers.get("authorization"));
  if (!device) {
    return NextResponse.json(
      { error: "Unauthorised" },
      { status: 401, headers: CORS },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Malformed body" },
      { status: 400, headers: CORS },
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body" },
      { status: 400, headers: CORS },
    );
  }

  // Scoped to the owner, so a stolen token can only write against its own
  // account's sessions.
  const session = await db.studySession.findFirst({
    where: { id: parsed.data.sessionId, userId: device.userId },
    select: { id: true },
  });
  if (!session) {
    return NextResponse.json(
      { error: "Unknown session" },
      { status: 404, headers: CORS },
    );
  }

  // Clear this student's expired staging rows on the way past.
  //
  // The daily sweep exists for people who stop using Insight; this is what
  // makes the six hours real for everyone else, since an active device posts
  // every minute. Neither is a substitute for the other.
  await db.pendingDeviceData.deleteMany({
    where: { userId: device.userId, expiresAt: { lte: new Date() } },
  });

  await db.pendingDeviceData.create({
    data: {
      userId: device.userId,
      // Whichever device's token was used. The browser doesn't care, it
      // encrypts whatever is staged, but a row that claims to be from the
      // extension when it came from the Windows app is a lie in the one table
      // anybody auditing this would read first.
      kind: device.kind,
      payload: {
        sessionId: session.id,
        domains: parsed.data.domains,
        blocked: parsed.data.blocked ?? [],
      },
      expiresAt: new Date(Date.now() + STAGING_LIFETIME_MS),
    },
  });

  // Focus Mode overrides are recorded on the session itself, because the
  // insight engine needs to know a session's focus data is incomplete without
  // decrypting anything to find out.
  if (parsed.data.blocked?.some((b) => b.overrideUsed)) {
    await db.studySession.update({
      where: { id: session.id },
      data: { focusModeOverride: true },
    });
  }

  return NextResponse.json({ ok: true }, { headers: CORS });
}
