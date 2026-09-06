"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/user";
import { decryptToken, encryptToken } from "@/lib/server-crypto";
import { fetchClasswork } from "@/lib/hac-login";

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

/* -------------------------------------------------------------------------- */
/* Signing in with credentials, for students without the extension.           */
/* -------------------------------------------------------------------------- */

const credentialsSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});

export type HacConnectResult =
  | { ok: true }
  | { ok: false; error: string };

/// Fixed, non-revealing messages. Nothing derived from what was typed.
const FAILURE_TEXT: Record<string, string> = {
  BAD_CREDENTIALS: "HAC didn't accept that username and password.",
  UNREACHABLE: "Couldn't reach HAC just now. Try again in a minute.",
  BLOCKED: "HAC's sign-in page didn't look the way we expect. Nothing was sent.",
  NO_CLASSWORK: "Signed in, but the classwork page wouldn't load.",
};

/**
 * Store HAC credentials, after proving they work.
 *
 * The login is attempted *before* anything is written, so a typo is never
 * saved. Nothing about the attempt is logged, and the failure text is a fixed
 * lookup rather than anything built from what the student typed.
 */
export async function connectHac(input: unknown): Promise<HacConnectResult> {
  const user = await getOrCreateUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Enter your HAC username and password." };
  }

  const { username, password } = parsed.data;

  const attempt = await fetchClasswork(username, password);
  if (!attempt.ok) {
    return {
      ok: false,
      error: FAILURE_TEXT[attempt.reason] ?? "Couldn't sign in to HAC.",
    };
  }

  const sealed = encryptToken(password);
  await db.hacConnection.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      username,
      password: sealed.cipher,
      passwordIv: sealed.iv,
    },
    update: {
      username,
      password: sealed.cipher,
      passwordIv: sealed.iv,
      disconnectedAt: null,
    },
  });

  revalidatePath("/canvas");
  return { ok: true };
}

/// Remove the row rather than blank the field. A stored credential that is no
/// longer wanted should stop existing.
export async function disconnectHac(): Promise<HacConnectResult> {
  const user = await getOrCreateUser();
  if (!user) return { ok: false, error: "Not signed in." };

  await db.hacConnection.deleteMany({ where: { userId: user.id } });
  revalidatePath("/canvas");
  return { ok: true };
}

export async function hacConnectionStatus(): Promise<{
  connected: boolean;
  username: string | null;
  disconnected: boolean;
  lastSyncedAt: string | null;
}> {
  const user = await getOrCreateUser();
  if (!user) {
    return { connected: false, username: null, disconnected: false, lastSyncedAt: null };
  }

  const row = await db.hacConnection.findUnique({
    where: { userId: user.id },
    select: { username: true, disconnectedAt: true, lastSyncedAt: true },
  });

  return {
    connected: Boolean(row),
    username: row?.username ?? null,
    disconnected: Boolean(row?.disconnectedAt),
    lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null,
  };
}

/**
 * Fetch the gradebook page using the stored credentials.
 *
 * Returns the HTML to the caller's own browser, which parses and encrypts it —
 * the same round trip Canvas takes, and for the same reason: the server has no
 * key, so it cannot store what it just fetched.
 *
 * This is what makes a phone work. The extension can't run there, but the
 * server has no CORS to worry about, so the phone asks the server to fetch and
 * then encrypts the result itself.
 */
export async function pullHac(): Promise<
  { ok: true; html: string } | { ok: false; error: string }
> {
  const user = await getOrCreateUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const row = await db.hacConnection.findUnique({ where: { userId: user.id } });
  if (!row) return { ok: false, error: "HAC isn't connected." };

  const password = decryptToken(row.password, row.passwordIv);
  const result = await fetchClasswork(row.username, password);

  if (!result.ok) {
    // Only a rejected login marks the connection dead. A network blip must not
    // make a student retype their password.
    if (result.reason === "BAD_CREDENTIALS") {
      await db.hacConnection.update({
        where: { userId: user.id },
        data: { disconnectedAt: new Date() },
      });
    }
    return {
      ok: false,
      error: FAILURE_TEXT[result.reason] ?? "Couldn't read HAC.",
    };
  }

  await db.hacConnection.update({
    where: { userId: user.id },
    data: { lastSyncedAt: new Date(), disconnectedAt: null },
  });

  return { ok: true, html: result.html };
}
