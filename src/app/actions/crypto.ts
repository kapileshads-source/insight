"use server";

import { db } from "@/lib/db";
import { traced } from "@/lib/db-errors";
import { getOrCreateUser } from "@/lib/user";
import type { EncryptionSetup, RecoverySetup } from "@/lib/crypto";

/// Hand the browser the material it needs to derive the key.
///
/// None of this is secret. The salt is public by design, and the wrapped key
/// is inert without the password, which this server has never seen and has no
/// code path to obtain. Returning it is what lets a student unlock on a device
/// they've never used before.
export async function fetchEncryptionSetup(): Promise<EncryptionSetup | null> {
  // Reachable by direct POST, so the session is re-checked here rather than
  // trusted from the caller.
  const user = await getOrCreateUser();
  if (!user) return null;

  const key = await traced("encryptionKey.find", () =>
    db.encryptionKey.findUnique({
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
    }),
  );

  return key;
}

/**
 * The recovery wrapping, for the forgot-password flow.
 *
 * Handed out on the same terms as the password wrapping above: it is inert
 * without the code, and the code exists only on whatever the student wrote it
 * on. Returning it to a signed-in session is what lets someone who is logged
 * in but locked out get back to their data.
 *
 * Null means this account has no recovery key, either it predates the
 * feature, or the student declined one. There is nothing to be done for them
 * here, and `/recover` says so rather than pretending.
 */
export async function fetchRecoverySetup(): Promise<RecoverySetup | null> {
  const user = await getOrCreateUser();
  if (!user) return null;

  const key = await traced("encryptionKey.findRecovery", () =>
    db.encryptionKey.findUnique({
      where: { userId: user.id },
      select: {
        recoverySalt: true,
        recoveryWrappedDek: true,
        recoveryWrapIv: true,
        recoveryVerifierCipher: true,
        recoveryVerifierIv: true,
      },
    }),
  );

  // Every column moves together, they are written in one update, so one
  // being null means none of them are set.
  if (
    !key?.recoverySalt ||
    !key.recoveryWrappedDek ||
    !key.recoveryWrapIv ||
    !key.recoveryVerifierCipher ||
    !key.recoveryVerifierIv
  ) {
    return null;
  }

  return {
    recoverySalt: key.recoverySalt,
    recoveryWrappedDek: key.recoveryWrappedDek,
    recoveryWrapIv: key.recoveryWrapIv,
    recoveryVerifierCipher: key.recoveryVerifierCipher,
    recoveryVerifierIv: key.recoveryVerifierIv,
  };
}

/// Whether a recovery key exists and when it was issued, enough for settings
/// to say "you have one, from March" without handing over the material.
export async function recoveryKeyStatus(): Promise<{
  exists: boolean;
  createdAt: Date | null;
}> {
  const user = await getOrCreateUser();
  if (!user) return { exists: false, createdAt: null };

  const key = await traced("encryptionKey.recoveryStatus", () =>
    db.encryptionKey.findUnique({
      where: { userId: user.id },
      select: { recoverySalt: true, recoveryCreatedAt: true },
    }),
  );

  return {
    exists: Boolean(key?.recoverySalt),
    createdAt: key?.recoveryCreatedAt ?? null,
  };
}
