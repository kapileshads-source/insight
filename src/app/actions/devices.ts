"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/user";
import { createDeviceToken } from "@/lib/device-tokens";

export type DeviceResult =
  | { ok: true; token?: string }
  | { ok: false; error: string };

async function requireUser() {
  const user = await getOrCreateUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

const kindSchema = z.enum([
  "BROWSER_EXTENSION",
  "WINDOWS_APP",
  "MACOS_APP",
  "ANDROID_APP",
]);

/// Mint a pairing token and hand back the plaintext once.
export async function pairDevice(
  kind: unknown,
  label?: string,
): Promise<DeviceResult> {
  const user = await requireUser();

  const parsed = kindSchema.safeParse(kind);
  if (!parsed.success) return { ok: false, error: "Unknown device type." };

  const token = await createDeviceToken(
    user.id,
    parsed.data,
    label?.slice(0, 64),
  );

  revalidatePath("/devices");
  return { ok: true, token };
}

export async function revokeDevice(id: string): Promise<DeviceResult> {
  const user = await requireUser();

  // Scoped to the user so a guessed id revokes nothing.
  await db.deviceToken.updateMany({
    where: { id, userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  revalidatePath("/devices");
  return { ok: true };
}

export type DeviceRow = {
  id: string;
  kind: string;
  label: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  /// True when a paired device has gone quiet for long enough that its
  /// absence is probably real rather than a weekend.
  silent: boolean;
};

export async function listDevices(): Promise<DeviceRow[]> {
  const user = await getOrCreateUser();
  if (!user) return [];

  const rows = await db.deviceToken.findMany({
    where: { userId: user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });

  // Open problem #6 in the plan: a student who uninstalls mid-term leaves a
  // silent gap, and silence read as zero distraction would quietly poison the
  // insights. Three days is long enough to clear a weekend.
  const threshold = Date.now() - 3 * 86_400_000;

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    silent: r.lastSeenAt ? r.lastSeenAt.getTime() < threshold : false,
  }));
}

/// Encrypted device data waiting for the browser to collect it.
///
/// The extension has no key, so it posts plaintext to a staging table and the
/// student's browser encrypts it on next load. This returns whatever is
/// waiting; `commitPendingDeviceData` stores the ciphertext and clears it.
export async function fetchPendingDeviceData() {
  const user = await getOrCreateUser();
  if (!user) return [];

  return db.pendingDeviceData.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: { receivedAt: "asc" },
    take: 200,
  });
}

const sealed = z.object({
  cipher: z.string().min(1).max(20_000),
  iv: z.string().min(1).max(256),
});

const commitSchema = z.object({
  sessionId: z.string().min(1),
  entries: z.array(z.object({ id: z.string().min(1), payload: sealed })).max(500),
});

/// Store what the browser encrypted, then delete the plaintext staging rows.
///
/// Deleting is the point. Those rows are the one place device data sits in a
/// form the server can read, and they exist for minutes rather than forever.
export async function commitPendingDeviceData(
  input: unknown,
): Promise<DeviceResult> {
  const user = await requireUser();

  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That didn't look right." };

  const session = await db.studySession.findFirst({
    where: { id: parsed.data.sessionId, userId: user.id },
  });
  if (!session) return { ok: false, error: "That session isn't yours." };

  for (const entry of parsed.data.entries) {
    await db.extensionActivity.create({
      data: {
        sessionId: session.id,
        payloadCipher: entry.payload.cipher,
        payloadIv: entry.payload.iv,
      },
    });
  }

  await db.pendingDeviceData.deleteMany({
    where: {
      userId: user.id,
      id: { in: parsed.data.entries.map((e) => e.id) },
    },
  });

  revalidatePath("/dashboard");
  return { ok: true };
}
