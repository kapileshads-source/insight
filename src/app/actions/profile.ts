"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/user";

/**
 * The student's own baseline: when they usually sleep and wake, and where
 * they usually study.
 *
 * Encrypted like everything else, which has one consequence worth knowing:
 * the server cannot tell whether a baseline is half filled in or complete,
 * only that a row exists. That's why the dashboard checklist has one item for
 * this rather than two, and why the form saves all of it at once. Adding a
 * plaintext "has sleep baseline" flag would make the checkmark easy and would
 * put a fact about a student's data on the structure side of the line for the
 * sake of a tick.
 */

export type ProfileResult = { ok: true } | { ok: false; error: string };

export type SealedProfile = { cipher: string; iv: string } | null;

const sealed = z.object({
  cipher: z.string().min(1).max(20_000),
  iv: z.string().min(1).max(256),
});

export async function getProfile(): Promise<SealedProfile> {
  const user = await getOrCreateUser();
  if (!user?.profileCipher || !user.profileIv) return null;

  return { cipher: user.profileCipher, iv: user.profileIv };
}

export async function saveProfile(payload: unknown): Promise<ProfileResult> {
  const user = await getOrCreateUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const parsed = sealed.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "That didn't look right." };

  await db.user.update({
    where: { id: user.id },
    data: { profileCipher: parsed.data.cipher, profileIv: parsed.data.iv },
  });

  revalidatePath("/dashboard");
  revalidatePath("/baseline");
  return { ok: true };
}

/// Whether anything has been saved at all — the only question about this the
/// server is able to answer.
export async function hasProfile(): Promise<boolean> {
  const user = await getOrCreateUser();
  return Boolean(user?.profileCipher && user.profileIv);
}
