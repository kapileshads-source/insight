import { db } from "@/lib/db";
import { authenticateDevice } from "@/lib/device-tokens";
import { fail, ok, preflight, readJson, sealedSchema } from "@/lib/device-api";
import { z } from "zod";

/**
 * Log a night's sleep from a paired device.
 *
 * The one thing a phone is genuinely better at than a laptop: it's what you're
 * holding when you wake up, and sleep logged the next afternoon is a guess.
 *
 * The date is plaintext so a second entry for the same night is caught without
 * decrypting anything; the hours themselves are not. Upserting means correcting
 * last night replaces it rather than leaving two rows the engine averages
 * against each other.
 */

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return preflight();
}

const bodySchema = z.object({
  forDate: z.iso.date(),
  payload: sealedSchema,
});

export async function POST(request: Request) {
  const device = await authenticateDevice(request.headers.get("authorization"));
  if (!device) return fail("Unauthorised", 401);

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return fail("Invalid body", 400);

  const forDate = new Date(`${parsed.data.forDate}T00:00:00Z`);

  await db.sleepEntry.upsert({
    where: { userId_forDate: { userId: device.userId, forDate } },
    update: {
      payloadCipher: parsed.data.payload.cipher,
      payloadIv: parsed.data.payload.iv,
    },
    create: {
      userId: device.userId,
      forDate,
      payloadCipher: parsed.data.payload.cipher,
      payloadIv: parsed.data.payload.iv,
    },
  });

  return ok({ saved: true });
}
