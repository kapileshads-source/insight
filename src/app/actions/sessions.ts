"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/user";

export type SessionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

async function requireUser() {
  const user = await getOrCreateUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

/// Start a session.
///
/// Only the start time is written now. Everything descriptive — subject,
/// where they are, how loud it is — is encrypted in the browser and attached
/// on stop, because the server has no key to encrypt it with.
export async function startSession(): Promise<SessionResult> {
  const user = await requireUser();

  // One running session at a time. A student who left one open on a laptop
  // and starts another on their phone should resume, not accumulate a second
  // session that will look like a 14-hour study block in the data.
  const running = await db.studySession.findFirst({
    where: { userId: user.id, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (running) return { ok: true, id: running.id };

  const created = await db.studySession.create({
    // Focus Mode starts with the session, per the plan. Making a student
    // switch it on separately means the one who most needs it is the one who
    // won't bother — and a blocker nobody enables blocks nothing.
    data: { userId: user.id, startedAt: new Date(), focusModeActive: true },
  });

  revalidatePath("/dashboard");
  return { ok: true, id: created.id };
}

const sealedSchema = z.object({
  cipher: z.string().min(1).max(20_000),
  iv: z.string().min(1).max(256),
});

export async function stopSession(
  sessionId: string,
  sealed: unknown,
): Promise<SessionResult> {
  const user = await requireUser();

  const parsed = sealedSchema.safeParse(sealed);
  if (!parsed.success) {
    return { ok: false, error: "That session data didn't look right." };
  }

  // Scoped to the user, so a guessed id from another account updates nothing.
  const session = await db.studySession.findFirst({
    where: { id: sessionId, userId: user.id },
  });
  if (!session) return { ok: false, error: "That session isn't yours." };
  if (session.endedAt) return { ok: false, error: "That session already ended." };

  await db.studySession.update({
    where: { id: session.id },
    data: {
      endedAt: new Date(),
      payloadCipher: parsed.data.cipher,
      payloadIv: parsed.data.iv,
    },
  });

  revalidatePath("/dashboard");
  return { ok: true, id: session.id };
}

/// Turn blocking on or off mid-session.
///
/// Deliberately reversible without ending the session. The alternative is a
/// student who needs one blocked site stopping their timer to get at it, which
/// loses the session data as well as the focus — a worse outcome on both
/// counts than letting them switch it off.
export async function setFocusMode(
  sessionId: string,
  active: boolean,
): Promise<SessionResult> {
  const user = await requireUser();

  const updated = await db.studySession.updateMany({
    where: { id: sessionId, userId: user.id, endedAt: null },
    data: {
      focusModeActive: active,
      // Switching it off counts as an override, so the insight engine knows
      // this session's distraction figures are incomplete rather than low.
      ...(active ? {} : { focusModeOverride: true }),
    },
  });

  if (updated.count === 0) return { ok: false, error: "That session isn't yours." };

  revalidatePath("/dashboard");
  return { ok: true, id: sessionId };
}

/// Throw away a session without recording it. A student who started the timer
/// by accident should be able to remove it — leaving a two-minute "session"
/// in the data is worse than having no row at all.
export async function discardSession(
  sessionId: string,
): Promise<SessionResult> {
  const user = await requireUser();

  const deleted = await db.studySession.deleteMany({
    where: { id: sessionId, userId: user.id, endedAt: null },
  });
  if (deleted.count === 0) {
    return { ok: false, error: "Nothing to discard." };
  }

  revalidatePath("/dashboard");
  return { ok: true, id: sessionId };
}

/// The session left running, if there is one, so the timer survives a refresh
/// or a move to another device.
export async function getRunningSession() {
  const user = await getOrCreateUser();
  if (!user) return null;

  const running = await db.studySession.findFirst({
    where: { userId: user.id, endedAt: null },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true, focusModeActive: true },
  });

  return running;
}
