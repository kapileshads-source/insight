"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/user";

/**
 * Writing a term of sample data.
 *
 * The payloads arrive already encrypted, the generator runs in the browser
 * because that is where the key is, the same as every other write here. The
 * server's part is only to file rows against dates it can see.
 *
 * **Sample data, never presented as real usage.** This refuses to run in an
 * account that already holds logs, which is the one guard worth enforcing
 * server-side: the insight engine averages outcomes, so mixing invented scores
 * into a genuine term would produce findings drawn half from fiction with
 * nothing on screen to say which half.
 */

const sealed = z.object({
  cipher: z.string().min(1).max(20_000),
  iv: z.string().min(1).max(200),
});

const demoSchema = z.object({
  sessions: z
    .array(
      z.object({
        startedAt: z.string().datetime(),
        endedAt: z.string().datetime(),
        focusModeActive: z.boolean(),
        payload: sealed,
      }),
    )
    .max(400),
  sleep: z.array(z.object({ forDate: z.iso.date(), payload: sealed })).max(200),
  screenTime: z
    .array(z.object({ forDate: z.iso.date(), payload: sealed }))
    .max(200),
  outcomes: z
    .array(z.object({ occurredOn: z.iso.date(), payload: sealed }))
    .max(200),
});

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

export type DemoResult =
  | { ok: true; sessions: number; sleep: number; screenTime: number; outcomes: number }
  | { ok: false; error: string };

export async function seedDemoData(input: unknown): Promise<DemoResult> {
  const user = await getOrCreateUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const parsed = demoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That data didn't look right." };

  // The one guard that matters. An account with real logs must not be filled
  // with invented ones, the two become indistinguishable the moment they're
  // encrypted, and every insight afterwards would be drawn from both.
  const [existingSessions, existingOutcomes] = await Promise.all([
    db.studySession.count({ where: { userId: user.id } }),
    db.outcome.count({ where: { userId: user.id } }),
  ]);

  if (existingSessions > 0 || existingOutcomes > 0) {
    return {
      ok: false,
      error:
        "This account already has sessions or scores in it. Sample data only goes into an empty account, make a separate one for the demo.",
    };
  }

  const { sessions, sleep, screenTime, outcomes } = parsed.data;

  for (const s of sessions) {
    await db.studySession.create({
      data: {
        userId: user.id,
        startedAt: new Date(s.startedAt),
        endedAt: new Date(s.endedAt),
        focusModeActive: s.focusModeActive,
        payloadCipher: s.payload.cipher,
        payloadIv: s.payload.iv,
      },
    });
  }

  for (const s of sleep) {
    await db.sleepEntry.upsert({
      where: { userId_forDate: { userId: user.id, forDate: day(s.forDate) } },
      update: { payloadCipher: s.payload.cipher, payloadIv: s.payload.iv },
      create: {
        userId: user.id,
        forDate: day(s.forDate),
        payloadCipher: s.payload.cipher,
        payloadIv: s.payload.iv,
      },
    });
  }

  for (const s of screenTime) {
    await db.screenTimeEntry.upsert({
      where: {
        userId_forDate_source: {
          userId: user.id,
          forDate: day(s.forDate),
          source: "MANUAL",
        },
      },
      update: { payloadCipher: s.payload.cipher, payloadIv: s.payload.iv },
      create: {
        userId: user.id,
        forDate: day(s.forDate),
        source: "MANUAL",
        payloadCipher: s.payload.cipher,
        payloadIv: s.payload.iv,
      },
    });
  }

  for (const o of outcomes) {
    await db.outcome.create({
      data: {
        userId: user.id,
        source: "MANUAL",
        occurredOn: day(o.occurredOn),
        payloadCipher: o.payload.cipher,
        payloadIv: o.payload.iv,
      },
    });
  }

  revalidatePath("/dashboard");
  return {
    ok: true,
    sessions: sessions.length,
    sleep: sleep.length,
    screenTime: screenTime.length,
    outcomes: outcomes.length,
  };
}
