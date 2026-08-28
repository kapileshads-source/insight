"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/user";

/**
 * Recording which Canvas assignment and which HAC assignment are the same thing.
 *
 * The matching itself happens in the browser — it compares titles, and titles
 * are encrypted — so the server only files the answer. What it does enforce is
 * the part a browser can't: that one assignment is never in two pairings, and
 * that both sides belong to the person asking.
 */

export type PairingResult = { ok: true } | { ok: false; error: string };

const linkSchema = z.object({
  links: z
    .array(
      z.object({
        canvasAssignmentId: z.string().min(1).max(60),
        hacAssignmentId: z.string().min(1).max(60),
        confidence: z.number().min(0).max(1),
        /// False when the student was shown it and agreed.
        autoLinked: z.boolean(),
        /// True when the student said these are not the same thing. Recorded
        /// as a refusal rather than a link — see `RejectedPairing` — so each
        /// row stays free to pair with the one it really belongs to.
        rejected: z.boolean().default(false),
      }),
    )
    .max(300),
});

export async function saveAssignmentLinks(
  input: unknown,
): Promise<PairingResult> {
  const user = await getOrCreateUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That pairing didn't look right." };

  for (const link of parsed.data.links) {
    // Both sides must be this user's, and each must be from the gradebook it
    // claims to be. A Canvas id in the HAC slot would pair a row with itself.
    const [canvas, hac] = await Promise.all([
      db.assignment.findFirst({
        where: { id: link.canvasAssignmentId, userId: user.id, source: "CANVAS" },
        select: { id: true },
      }),
      db.assignment.findFirst({
        where: { id: link.hacAssignmentId, userId: user.id, source: "HAC" },
        select: { id: true },
      }),
    ]);
    if (!canvas || !hac) continue;

    if (link.rejected) {
      // A refusal is about this combination only. Upserted because saying no
      // twice is not an error.
      await db.rejectedPairing.upsert({
        where: {
          canvasAssignmentId_hacAssignmentId: {
            canvasAssignmentId: canvas.id,
            hacAssignmentId: hac.id,
          },
        },
        update: {},
        create: {
          userId: user.id,
          canvasAssignmentId: canvas.id,
          hacAssignmentId: hac.id,
        },
      });
      continue;
    }

    // Either side already spoken for. Both columns are unique, so this would
    // fail anyway — checking first keeps one bad row from ending the batch.
    const taken = await db.assignmentLink.findFirst({
      where: {
        OR: [
          { canvasAssignmentId: canvas.id },
          { hacAssignmentId: hac.id },
        ],
      },
      select: { id: true },
    });
    if (taken) continue;

    await db.assignmentLink.create({
      data: {
        userId: user.id,
        canvasAssignmentId: canvas.id,
        hacAssignmentId: hac.id,
        confidence: link.confidence,
        autoLinked: link.autoLinked,
        confirmedAt: link.autoLinked ? null : new Date(),
      },
    });
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

/// Undo a pairing. The reason a link exists rather than a merge: a wrong guess
/// costs one click, and the other row was never destroyed.
export async function unlinkAssignments(id: string): Promise<PairingResult> {
  const user = await getOrCreateUser();
  if (!user) return { ok: false, error: "Not signed in." };

  await db.assignmentLink.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Both gradebooks and every pairing already made, still encrypted.
 *
 * The browser needs all of it: the titles to match on, and the existing links
 * so it doesn't offer a pairing that has already been made or refused.
 */
export async function fetchPairingState() {
  const user = await getOrCreateUser();
  if (!user) return null;

  const [assignments, links] = await Promise.all([
    db.assignment.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        courseId: true,
        source: true,
        dueAt: true,
        payloadCipher: true,
        payloadIv: true,
      },
      take: 1000,
    }),
    db.assignmentLink.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        canvasAssignmentId: true,
        hacAssignmentId: true,
        confidence: true,
        autoLinked: true,
        confirmedAt: true,
      },
    }),
  ]);

  const rejected = await db.rejectedPairing.findMany({
    where: { userId: user.id },
    select: { canvasAssignmentId: true, hacAssignmentId: true },
  });

  const courses = await db.course.findMany({
    where: { userId: user.id },
    select: { id: true, payloadCipher: true, payloadIv: true },
  });

  return { assignments, links, rejected, courses };
}
