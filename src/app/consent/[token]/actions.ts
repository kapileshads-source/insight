"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

export type ConsentResult = { ok: true } | { ok: false; error: string };

/// Look up a consent record by the raw token from the emailed link.
///
/// Only the hash is stored, so this is the one place the raw token is turned
/// back into a record — and a database leak still hands out no working links.
export async function findConsentByToken(token: string) {
  if (!token || token.length > 256) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");

  return db.parentConsent.findUnique({
    where: { tokenHash },
    include: { user: { select: { email: true, birthDate: true } } },
  });
}

/// Grant consent. Deliberately unauthenticated: the person clicking is a
/// parent who has no account here and never will. Possession of the token is
/// the authorisation, which is why it's 32 random bytes and stored hashed.
export async function confirmConsent(token: string): Promise<ConsentResult> {
  const consent = await findConsentByToken(token);
  if (!consent) return { ok: false, error: "This link isn't valid." };
  if (consent.revokedAt) {
    return { ok: false, error: "This permission was already withdrawn." };
  }

  await db.parentConsent.update({
    where: { id: consent.id },
    data: { confirmedAt: new Date(), revokedAt: null },
  });

  revalidatePath("/onboarding");
  return { ok: true };
}

/// Withdraw consent. Under COPPA a parent can do this at any time, and it has
/// to be as easy as granting it was — hence the same link, no login.
export async function revokeConsent(token: string): Promise<ConsentResult> {
  const consent = await findConsentByToken(token);
  if (!consent) return { ok: false, error: "This link isn't valid." };

  await db.parentConsent.update({
    where: { id: consent.id },
    data: { revokedAt: new Date(), confirmedAt: null },
  });

  revalidatePath("/onboarding");
  return { ok: true };
}
