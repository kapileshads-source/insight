"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/user";

/**
 * Storing what the student's own browser read out of HAC.
 *
 * The server never sees the gradebook. The extension fetches the page with the
 * session the student already has, the browser parses and encrypts it, and
 * what arrives here is ciphertext plus the few structural fields the schema
 * keeps in the clear — which course, which due date, whether it has a score.
 *
 * There is no id to upsert on. HAC assignments have none, so the browser works
 * out what is new by decrypting what is already stored and diffing on
 * plaintext (`hac-store.ts`). That is why this takes explicit `create` and
 * `update` lists rather than a single upsert: the decision has already been
 * made somewhere that could actually read the data.
 */

const sealed = z.object({
  cipher: z.string().min(1).max(20_000),
  iv: z.string().min(1).max(200),
});

const storeSchema = z.object({
  /// Courses HAC named that we have no row for yet. `ref` is a local handle
  /// the browser made up so the assignments below can point at one before it
  /// has a database id.
  newCourses: z
    .array(z.object({ ref: z.string().min(1).max(100), payload: sealed }))
    .max(30),
  create: z
    .array(
      z.object({
        courseId: z.string().min(1).max(60).nullable(),
        courseRef: z.string().min(1).max(100).nullable(),
        dueAt: z.string().datetime().nullable(),
        payload: sealed,
      }),
    )
    .max(500),
  update: z
    .array(
      z.object({
        id: z.string().min(1).max(60),
        dueAt: z.string().datetime().nullable(),
        payload: sealed,
      }),
    )
    .max(500),
  /// Existing course rows whose payload the browser has rewritten — in
  /// practice, to carry the overall grade the gradebook printed beside the
  /// class. The parser has always read it and storage used to drop it, so the
  /// app knew every student's course grade and had nowhere to put it.
  courseUpdates: z
    .array(z.object({ id: z.string().min(1).max(60), payload: sealed }))
    .max(30)
    .optional()
    .default([]),
});

export type HacStoreResult =
  | { ok: true; created: number; updated: number }
  | { ok: false; error: string };

export async function storeHacData(input: unknown): Promise<HacStoreResult> {
  const user = await getOrCreateUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const parsed = storeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That gradebook data didn't look right." };
  }

  const { newCourses, create, update, courseUpdates } = parsed.data;

  // Courses first, so the assignments below have something to hang off.
  // A HAC course has no canvasId; the column stays null, which the unique
  // index tolerates because Postgres treats nulls as distinct.
  const idByRef = new Map<string, string>();
  for (const c of newCourses) {
    const row = await db.course.create({
      data: {
        userId: user.id,
        canvasId: null,
        payloadCipher: c.payload.cipher,
        payloadIv: c.payload.iv,
      },
    });
    idByRef.set(c.ref, row.id);
  }

  let created = 0;
  for (const a of create) {
    const courseId = a.courseId ?? (a.courseRef ? idByRef.get(a.courseRef) : null);
    // An assignment with no course is dropped rather than filed under a
    // guess. Its course either matched one we hold or arrived as a new one;
    // neither happening means the browser sent something inconsistent.
    if (!courseId) continue;

    await db.assignment.create({
      data: {
        userId: user.id,
        courseId,
        source: "HAC",
        canvasId: null,
        dueAt: a.dueAt ? new Date(a.dueAt) : null,
        payloadCipher: a.payload.cipher,
        payloadIv: a.payload.iv,
      },
    });
    created++;
  }

  let updated = 0;
  for (const a of update) {
    // Scoped to this user and to HAC rows: an id from elsewhere must not be
    // able to overwrite a Canvas assignment, or somebody else's anything.
    const result = await db.assignment.updateMany({
      where: { id: a.id, userId: user.id, source: "HAC" },
      data: {
        dueAt: a.dueAt ? new Date(a.dueAt) : null,
        payloadCipher: a.payload.cipher,
        payloadIv: a.payload.iv,
      },
    });
    updated += result.count;
  }

  // Scoped to this user, like the assignment updates above. A course id from
  // somewhere else must not be able to rewrite anyone's row.
  for (const c of courseUpdates) {
    await db.course.updateMany({
      where: { id: c.id, userId: user.id },
      data: { payloadCipher: c.payload.cipher, payloadIv: c.payload.iv },
    });
  }

  revalidatePath("/dashboard");
  return { ok: true, created, updated };
}

/**
 * Everything needed to work out what a fresh HAC read would change.
 *
 * Encrypted, because the server can't read any of it. The browser decrypts,
 * diffs against what the page says now, and sends back only the difference.
 */
export async function fetchHacState() {
  const user = await getOrCreateUser();
  if (!user) return null;

  const [assignments, courses] = await Promise.all([
    db.assignment.findMany({
      where: { userId: user.id, source: "HAC" },
      select: {
        id: true,
        courseId: true,
        dueAt: true,
        payloadCipher: true,
        payloadIv: true,
      },
      take: 1000,
    }),
    db.course.findMany({
      where: { userId: user.id },
      select: { id: true, canvasId: true, payloadCipher: true, payloadIv: true },
    }),
  ]);

  return { assignments, courses };
}
