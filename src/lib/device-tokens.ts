import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Pairing tokens for the extension and, later, the native apps.
 *
 * Same pattern as the parent consent link: the plaintext is shown once and
 * only its SHA-256 is stored, so a database leak hands out no working tokens.
 *
 * Unlike the Canvas token this one is ours, so it never expires on a schedule,
 * a student revokes it when they uninstall, and that is the only way it dies.
 * Chasing a laptop extension for re-pairing every 90 days would be friction
 * for no security gain, since it grants far less than a Canvas token does.
 */

export type DeviceKind =
  | "BROWSER_EXTENSION"
  | "WINDOWS_APP"
  | "MACOS_APP"
  | "ANDROID_APP";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/// Mint a token. Returns the plaintext exactly once, it is never recoverable
/// afterwards, so the UI has to show it immediately or lose it.
export async function createDeviceToken(
  userId: string,
  kind: DeviceKind,
  label?: string,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");

  await db.deviceToken.create({
    data: { userId, kind, tokenHash: hashToken(token), label: label ?? null },
  });

  return token;
}

export type AuthedDevice = {
  userId: string;
  deviceTokenId: string;
  kind: DeviceKind;
};

/// Resolve a bearer token to its owner, or null.
///
/// Also stamps `lastSeenAt`, which is what makes "the extension stopped
/// reporting" detectable. A silent gap in laptop data would otherwise look
/// identical to a fortnight of studying on paper, and quietly skew the
/// distraction figures.
export async function authenticateDevice(
  authorization: string | null,
): Promise<AuthedDevice | null> {
  if (!authorization?.startsWith("Bearer ")) return null;

  const token = authorization.slice("Bearer ".length).trim();
  if (!token || token.length > 512) return null;

  const row = await db.deviceToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, kind: true, revokedAt: true },
  });

  if (!row || row.revokedAt) return null;

  await db.deviceToken.update({
    where: { id: row.id },
    data: { lastSeenAt: new Date() },
  });

  return { userId: row.userId, deviceTokenId: row.id, kind: row.kind };
}
