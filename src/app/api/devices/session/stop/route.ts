import { db } from "@/lib/db";
import { authenticateDevice } from "@/lib/device-tokens";
import { fail, ok, preflight, readJson, sealedSchema } from "@/lib/device-api";
import { z } from "zod";

/**
 * End a session from a paired device.
 *
 * The payload arrives already encrypted — how long it ran, the subject, how it
 * felt. The phone holds the key because a student unlocked it with their own
 * password; this endpoint holds none of that and stores what it's given.
 */

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return preflight();
}

const bodySchema = z.object({
  sessionId: z.string().min(1).max(64),
  payload: sealedSchema,
});

export async function POST(request: Request) {
  const device = await authenticateDevice(request.headers.get("authorization"));
  if (!device) return fail("Unauthorised", 401);

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return fail("Invalid body", 400);

  // Scoped to the owner, so a guessed id from another account updates nothing.
  const session = await db.studySession.findFirst({
    where: { id: parsed.data.sessionId, userId: device.userId },
    select: { id: true, endedAt: true },
  });

  if (!session) return fail("Unknown session", 404);

  // Not an error worth alarming anyone with: a laptop and a phone can both
  // reach for the stop button, and the second one to arrive should find the
  // job already done rather than a failure.
  if (session.endedAt) return ok({ alreadyEnded: true });

  await db.studySession.update({
    where: { id: session.id },
    data: {
      endedAt: new Date(),
      payloadCipher: parsed.data.payload.cipher,
      payloadIv: parsed.data.payload.iv,
    },
  });

  return ok({ alreadyEnded: false });
}
