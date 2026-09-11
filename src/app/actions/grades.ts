"use server";

import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/user";

/**
 * Everything the grades view needs, still encrypted.
 *
 * Separate from `fetchStoredAssignments` rather than a flag on it, because the
 * two want opposite things. "What's due" looks forward and deliberately stops
 * at a fortnight back, so finished work doesn't bury the next deadline. A
 * gradebook looks backward across the whole grading period, and its natural
 * order is *when the mark appeared*, not when the work was due.
 *
 * `updatedAt` is the closest thing to a "graded at" timestamp we have. HAC and
 * Canvas both give a row no such field, so the moment a sync rewrote it is the
 * only evidence that something changed. It is plaintext already, it is a
 * server-side bookkeeping column, not student content, so ordering by it costs
 * nothing and reveals nothing beyond the fact that a row moved.
 */
export async function fetchGradebook() {
  const user = await getOrCreateUser();
  if (!user) return null;

  // One grading period, roughly. Long enough that a term's work is all here,
  // short enough that last year's rows never load.
  const since = new Date();
  since.setDate(since.getDate() - 120);

  const [assignments, courses] = await Promise.all([
    db.assignment.findMany({
      where: {
        userId: user.id,
        OR: [{ dueAt: { gte: since } }, { dueAt: null }],
      },
      select: {
        id: true,
        courseId: true,
        source: true,
        dueAt: true,
        updatedAt: true,
        completedAt: true,
        payloadCipher: true,
        payloadIv: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 600,
    }),
    db.course.findMany({
      where: { userId: user.id, active: true },
      select: {
        id: true,
        // Null on a course HAC created, which is how the gradebook tells the
        // student's real roll from the shells Canvas carries.
        canvasId: true,
        payloadCipher: true,
        payloadIv: true,
      },
    }),
  ]);

  return { assignments, courses };
}

/**
 * Tick an assignment off, or un-tick it.
 *
 * Scoped to the caller's own rows, like every other write here, an id from
 * somewhere else must not be able to mark a stranger's homework done.
 *
 * `completedAt` is plaintext, which is a deliberate exception documented on the
 * model. The server has to act on this: the evening reminder counts what is due
 * tomorrow, and telling a student who has ticked three things off that three
 * are still due is how a reminder gets switched off for good.
 */
export async function setAssignmentDone(
  id: string,
  done: boolean,
): Promise<{ ok: boolean }> {
  const user = await getOrCreateUser();
  if (!user) return { ok: false };
  if (typeof id !== "string" || id.length === 0 || id.length > 60) {
    return { ok: false };
  }

  const result = await db.assignment.updateMany({
    where: { id, userId: user.id },
    data: { completedAt: done ? new Date() : null },
  });

  return { ok: result.count > 0 };
}
