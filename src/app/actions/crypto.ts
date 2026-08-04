"use server";

import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/user";
import type { EncryptionSetup } from "@/lib/crypto";

/// Hand the browser the material it needs to derive the key.
///
/// None of this is secret. The salt is public by design, and the wrapped key
/// is inert without the password — which this server has never seen and has no
/// code path to obtain. Returning it is what lets a student unlock on a device
/// they've never used before.
export async function fetchEncryptionSetup(): Promise<EncryptionSetup | null> {
  // Reachable by direct POST, so the session is re-checked here rather than
  // trusted from the caller.
  const user = await getOrCreateUser();
  if (!user) return null;

  const key = await db.encryptionKey.findUnique({
    where: { userId: user.id },
    select: {
      kdf: true,
      iterations: true,
      salt: true,
      wrappedDek: true,
      wrapIv: true,
      verifierCipher: true,
      verifierIv: true,
    },
  });

  return key;
}
