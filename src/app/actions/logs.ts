"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { traced } from "@/lib/db-errors";
import { getOrCreateUser } from "@/lib/user";

export type LogResult = { ok: true } | { ok: false; error: string };

async function requireUser() {
  const user = await getOrCreateUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

const sealed = z.object({
  cipher: z.string().min(1).max(20_000),
  iv: z.string().min(1).max(256),
});

const dated = z.object({ forDate: z.iso.date() });
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

/// Sleep for the night before a given morning.
///
/// The date is plaintext so a second entry for the same night can be caught
/// without decrypting anything; the hours themselves are not. Upserting means
/// correcting last night's number replaces it rather than creating a duplicate
/// the engine would then average against itself.
export async function saveSleep(
  forDate: string,
  payload: unknown,
): Promise<LogResult> {
  const user = await requireUser();

  const d = dated.safeParse({ forDate });
  const p = sealed.safeParse(payload);
  if (!d.success || !p.success) {
    return { ok: false, error: "That didn't look right." };
  }

  await db.sleepEntry.upsert({
    where: { userId_forDate: { userId: user.id, forDate: day(d.data.forDate) } },
    update: { payloadCipher: p.data.cipher, payloadIv: p.data.iv },
    create: {
      userId: user.id,
      forDate: day(d.data.forDate),
      payloadCipher: p.data.cipher,
      payloadIv: p.data.iv,
    },
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

const screenTimeSource = z.enum([
  "OCR_IOS",
  "OCR_ANDROID",
  "NATIVE_WINDOWS",
  "NATIVE_MACOS",
  "NATIVE_ANDROID",
  "MANUAL",
]);

export async function saveScreenTime(
  forDate: string,
  source: unknown,
  payload: unknown,
): Promise<LogResult> {
  const user = await requireUser();

  const d = dated.safeParse({ forDate });
  const s = screenTimeSource.safeParse(source);
  const p = sealed.safeParse(payload);
  if (!d.success || !s.success || !p.success) {
    return { ok: false, error: "That didn't look right." };
  }

  await db.screenTimeEntry.upsert({
    where: {
      userId_forDate_source: {
        userId: user.id,
        forDate: day(d.data.forDate),
        source: s.data,
      },
    },
    update: { payloadCipher: p.data.cipher, payloadIv: p.data.iv },
    create: {
      userId: user.id,
      forDate: day(d.data.forDate),
      source: s.data,
      payloadCipher: p.data.cipher,
      payloadIv: p.data.iv,
    },
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

/// A test or quiz score entered by hand.
///
/// No course is attached: without Canvas there are no Course rows, and the
/// subject travels inside the encrypted payload instead. When Canvas is
/// connected later, reconciliation matches on date and subject rather than
/// on a foreign key that was never set.
export async function saveOutcome(
  occurredOn: string,
  payload: unknown,
): Promise<LogResult> {
  const user = await requireUser();

  const d = z.object({ occurredOn: z.iso.date() }).safeParse({ occurredOn });
  const p = sealed.safeParse(payload);
  if (!d.success || !p.success) {
    return { ok: false, error: "That didn't look right." };
  }

  await db.outcome.create({
    data: {
      userId: user.id,
      source: "MANUAL",
      occurredOn: day(d.data.occurredOn),
      payloadCipher: p.data.cipher,
      payloadIv: p.data.iv,
    },
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

/// Everything the browser needs to compute insights, in one round trip.
///
/// All of it is ciphertext. The server is handing over data it cannot read,
/// for the client to decrypt and analyse, which is the whole shape of the
/// application now.
export async function fetchEncryptedRecords() {
  const user = await getOrCreateUser();
  if (!user) return null;

  const [sessions, sleep, screenTime, outcomes, activity] = await traced(
    "records.fetchAll",
    () =>
      Promise.all([
    db.studySession.findMany({
      where: { userId: user.id, endedAt: { not: null } },
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        payloadCipher: true,
        payloadIv: true,
      },
      orderBy: { startedAt: "desc" },
      take: 500,
    }),
    db.sleepEntry.findMany({
      where: { userId: user.id },
      select: { forDate: true, payloadCipher: true, payloadIv: true },
      orderBy: { forDate: "desc" },
      take: 400,
    }),
    db.screenTimeEntry.findMany({
      where: { userId: user.id },
      select: {
        forDate: true,
        source: true,
        payloadCipher: true,
        payloadIv: true,
      },
      orderBy: { forDate: "desc" },
      take: 400,
    }),
    db.outcome.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        occurredOn: true,
        payloadCipher: true,
        payloadIv: true,
      },
          orderBy: { occurredOn: "desc" },
          take: 300,
        }),
        // What the extension recorded, so the browser can decrypt it and work
        // out how much of each session was spent elsewhere.
        db.extensionActivity.findMany({
          where: { session: { userId: user.id } },
          select: {
            sessionId: true,
            payloadCipher: true,
            payloadIv: true,
          },
          orderBy: { recordedAt: "desc" },
          take: 2000,
        }),
      ]),
  );

  return { sessions, sleep, screenTime, outcomes, activity };
}

/**
 * Which mornings and evenings already have an answer.
 *
 * Only the dates come back, the numbers themselves are encrypted and the
 * server has no business reading them to decide whether to ask a question.
 * Row existence is plaintext by design, and this is exactly the kind of thing
 * that rule was written for.
 */
export async function routineStatus(): Promise<{
  timezone: string;
  sleepLogged: string[];
  screenTimeLogged: string[];
} | null> {
  const user = await getOrCreateUser();
  if (!user) return null;

  const since = new Date();
  since.setDate(since.getDate() - 20);

  const [school, sleep, screen] = await Promise.all([
    user.schoolId
      ? db.school.findUnique({
          where: { id: user.schoolId },
          select: { timezone: true },
        })
      : null,
    db.sleepEntry.findMany({
      where: { userId: user.id, forDate: { gte: since } },
      select: { forDate: true },
    }),
    db.screenTimeEntry.findMany({
      where: { userId: user.id, forDate: { gte: since } },
      select: { forDate: true },
    }),
  ]);

  // `@db.Date` values arrive as midnight UTC, so slicing the ISO string gives
  // the calendar date without a timezone shifting it a day either way.
  const key = (d: Date) => d.toISOString().slice(0, 10);

  return {
    // Frisco ISD, when a student hasn't picked a campus yet. Every user is in
    // one district; this is a default, not an assumption about the world.
    timezone: school?.timezone ?? "America/Chicago",
    sleepLogged: sleep.map((s) => key(s.forDate)),
    screenTimeLogged: screen.map((s) => key(s.forDate)),
  };
}

/**
 * Record scores worked out from graded assignments.
 *
 * The percentages arrive already encrypted: the browser read the gradebook
 * rows, decrypted them, worked out what was new, and sealed the result. The
 * server's job is only to file them against the right assignment, which is the
 * one thing it can check, `assignmentId` is unique on `Outcome`, so the
 * database itself refuses to record the same test twice even if a second tab
 * tries at the same moment.
 */
const gradeOutcomeSchema = z.object({
  source: z.enum(["CANVAS", "HAC"]),
  outcomes: z
    .array(
      z.object({
        assignmentId: z.string().min(1).max(60),
        courseId: z.string().min(1).max(60).nullable(),
        occurredOn: z.iso.date(),
        payload: z.object({
          cipher: z.string().min(1).max(20_000),
          iv: z.string().min(1).max(200),
        }),
      }),
    )
    .max(500),
});

export async function saveGradeOutcomes(
  input: unknown,
): Promise<LogResult & { created?: number }> {
  const user = await requireUser();

  const parsed = gradeOutcomeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Those scores didn't look right." };
  }

  let created = 0;

  for (const o of parsed.data.outcomes) {
    // Scoped to this user's own assignments: an id from elsewhere must not be
    // able to attach a score to somebody else's work.
    const assignment = await db.assignment.findFirst({
      where: { id: o.assignmentId, userId: user.id },
      select: { id: true, courseId: true },
    });
    if (!assignment) continue;

    // `assignmentId` is unique, so a race between two tabs loses cleanly here
    // rather than double-counting a test in the insight engine.
    const existing = await db.outcome.findUnique({
      where: { assignmentId: assignment.id },
      select: { id: true },
    });
    if (existing) continue;

    await db.outcome.create({
      data: {
        userId: user.id,
        courseId: o.courseId ?? assignment.courseId,
        assignmentId: assignment.id,
        source: parsed.data.source,
        occurredOn: day(o.occurredOn),
        payloadCipher: o.payload.cipher,
        payloadIv: o.payload.iv,
      },
    });
    created++;
  }

  revalidatePath("/dashboard");
  return { ok: true, created };
}

/**
 * Everything needed to work out which grades are already recorded.
 *
 * Encrypted, because the comparison is between assignment names and scores and
 * the server can read neither. The browser decrypts both sides.
 */
export async function fetchGradeState() {
  const user = await getOrCreateUser();
  if (!user) return null;

  const [assignments, outcomes] = await Promise.all([
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
    db.outcome.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        assignmentId: true,
        source: true,
        occurredOn: true,
        payloadCipher: true,
        payloadIv: true,
      },
      take: 1000,
    }),
  ]);

  return { assignments, outcomes };
}

/**
 * Settle a disagreement between a hand-entered score and a gradebook one.
 *
 * Either answer attaches the student's own row to the assignment, which is
 * what stops the question coming back on every sync: once an outcome carries
 * an `assignmentId`, the planner treats that test as already recorded.
 *
 * Choosing the gradebook's number rewrites the payload; keeping their own
 * leaves it alone. The row stays `MANUAL` either way, because it is still the
 * score they decided on.
 */
export async function resolveGradeConflict(input: unknown): Promise<LogResult> {
  const user = await requireUser();

  const schema = z.object({
    outcomeId: z.string().min(1).max(60),
    assignmentId: z.string().min(1).max(60),
    payload: z
      .object({
        cipher: z.string().min(1).max(20_000),
        iv: z.string().min(1).max(200),
      })
      .nullable(),
  });

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That didn't look right." };

  const assignment = await db.assignment.findFirst({
    where: { id: parsed.data.assignmentId, userId: user.id },
    select: { id: true },
  });
  if (!assignment) return { ok: false, error: "That assignment isn't yours." };

  // Another outcome already claims this assignment, the question has been
  // answered elsewhere, and `assignmentId` is unique.
  const taken = await db.outcome.findUnique({
    where: { assignmentId: assignment.id },
    select: { id: true },
  });
  if (taken && taken.id !== parsed.data.outcomeId) return { ok: true };

  await db.outcome.updateMany({
    where: { id: parsed.data.outcomeId, userId: user.id },
    data: {
      assignmentId: assignment.id,
      conflictsWithSource: null,
      ...(parsed.data.payload
        ? {
            payloadCipher: parsed.data.payload.cipher,
            payloadIv: parsed.data.payload.iv,
          }
        : {}),
    },
  });

  revalidatePath("/dashboard");
  return { ok: true };
}
