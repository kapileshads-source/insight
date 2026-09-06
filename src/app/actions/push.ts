"use server";

import { z } from "zod";

import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/user";

/**
 * Remembering where to send a nudge.
 *
 * A subscription is a URL at Apple's or Google's push service plus the keys
 * that encrypt the message on the way. None of it is student content, and the
 * messages carry none either — the server has nothing to put in them.
 */

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(500),
});

export type PushResult = { ok: true } | { ok: false; error: string };

export async function savePushSubscription(input: unknown): Promise<PushResult> {
  const user = await getOrCreateUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That subscription didn't look right." };

  // A browser re-subscribing hands back the same endpoint. Upserting clears
  // any earlier failure, which is how a reinstalled app starts working again.
  await db.pushSubscription.upsert({
    where: { endpoint: parsed.data.endpoint },
    update: {
      userId: user.id,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
      failedAt: null,
    },
    create: {
      userId: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
    },
  });

  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<PushResult> {
  const user = await getOrCreateUser();
  if (!user) return { ok: false, error: "Not signed in." };

  await db.pushSubscription.deleteMany({
    where: { endpoint, userId: user.id },
  });
  return { ok: true };
}

/// Whether this browser is already set up, so the UI can offer the right thing
/// rather than asking someone to turn on what they turned on last week.
export async function pushSubscribed(endpoint: string): Promise<boolean> {
  const user = await getOrCreateUser();
  if (!user) return false;

  const row = await db.pushSubscription.findFirst({
    where: { endpoint, userId: user.id, failedAt: null },
    select: { id: true },
  });
  return Boolean(row);
}

/**
 * Which of the two reminders this device wants.
 *
 * Separate from unsubscribing, because "stop asking about my phone but keep
 * asking about sleep" is a reasonable thing to want, and the alternative —
 * all or nothing — is how someone ends up turning off the one they'd have
 * answered.
 */
export async function setNudgePreferences(input: unknown): Promise<PushResult> {
  const user = await getOrCreateUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const parsed = z
    .object({
      endpoint: z.string().url().max(1000),
      sleepNudge: z.boolean(),
      screenTimeNudge: z.boolean(),
      dueWorkNudge: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That didn't look right." };

  await db.pushSubscription.updateMany({
    where: { endpoint: parsed.data.endpoint, userId: user.id },
    data: {
      sleepNudge: parsed.data.sleepNudge,
      screenTimeNudge: parsed.data.screenTimeNudge,
      dueWorkNudge: parsed.data.dueWorkNudge,
    },
  });

  return { ok: true };
}

export async function getNudgePreferences(
  endpoint: string,
): Promise<{
  sleepNudge: boolean;
  screenTimeNudge: boolean;
  dueWorkNudge: boolean;
} | null> {
  const user = await getOrCreateUser();
  if (!user) return null;

  const row = await db.pushSubscription.findFirst({
    where: { endpoint, userId: user.id },
    select: { sleepNudge: true, screenTimeNudge: true, dueWorkNudge: true },
  });
  return row ?? null;
}
