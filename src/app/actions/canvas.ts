"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/user";
import { decryptToken, encryptToken } from "@/lib/server-crypto";
import {
  CanvasAuthError,
  fetchAssignments,
  fetchCourses,
  submissionState,
  verifyToken,
} from "@/lib/canvas";

export type CanvasResult = { ok: true } | { ok: false; error: string };

async function requireUser() {
  const user = await getOrCreateUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

const connectSchema = z.object({
  token: z.string().min(20).max(512),
  // FISD caps personal access tokens at 90 days, so an expiry always exists.
  // Students are told to set it to the maximum; we record what they chose.
  expiresOn: z.iso.date().optional(),
});

export async function connectCanvas(
  _prev: CanvasResult | null,
  formData: FormData,
): Promise<CanvasResult> {
  const user = await requireUser();

  const parsed = connectSchema.safeParse({
    token: formData.get("token"),
    expiresOn: formData.get("expiresOn") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "That doesn't look like a Canvas token." };
  }

  const baseUrl = process.env.CANVAS_BASE_URL ?? "https://fisd.instructure.com";

  // Verified before it's stored, so a mistyped token fails here rather than
  // showing up as an empty dashboard days later.
  try {
    await verifyToken({ baseUrl, token: parsed.data.token });
  } catch (e) {
    if (e instanceof CanvasAuthError) {
      return {
        ok: false,
        error:
          "Canvas didn't accept that token. Check you copied all of it — it's only shown once.",
      };
    }
    return { ok: false, error: "Couldn't reach Canvas. Try again shortly." };
  }

  const { cipher, iv } = encryptToken(parsed.data.token);

  await db.canvasConnection.upsert({
    where: { userId: user.id },
    update: {
      baseUrl,
      accessToken: cipher,
      tokenIv: iv,
      expiresAt: parsed.data.expiresOn
        ? new Date(`${parsed.data.expiresOn}T00:00:00Z`)
        : null,
      disconnectedAt: null,
      lastSyncError: null,
    },
    create: {
      userId: user.id,
      baseUrl,
      accessToken: cipher,
      tokenIv: iv,
      expiresAt: parsed.data.expiresOn
        ? new Date(`${parsed.data.expiresOn}T00:00:00Z`)
        : null,
    },
  });

  // Reconnecting closes any open gap: the data stops being missing from now.
  await db.dataGap.updateMany({
    where: { userId: user.id, source: "CANVAS", endedAt: null },
    data: { endedAt: new Date() },
  });

  revalidatePath("/dashboard");
  revalidatePath("/settings");
  return { ok: true };
}

export type CanvasStatus = {
  connected: boolean;
  disconnected: boolean;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
};

export async function getCanvasStatus(): Promise<CanvasStatus> {
  const user = await getOrCreateUser();
  const none: CanvasStatus = {
    connected: false,
    disconnected: false,
    expiresAt: null,
    daysUntilExpiry: null,
    lastSyncedAt: null,
    lastSyncError: null,
  };
  if (!user) return none;

  const c = await db.canvasConnection.findUnique({ where: { userId: user.id } });
  if (!c) return none;

  const days = c.expiresAt
    ? Math.ceil((c.expiresAt.getTime() - Date.now()) / 86_400_000)
    : null;

  return {
    connected: true,
    disconnected: Boolean(c.disconnectedAt),
    expiresAt: c.expiresAt?.toISOString() ?? null,
    daysUntilExpiry: days,
    lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
    lastSyncError: c.lastSyncError,
  };
}

export type CanvasPull = {
  courses: { canvasId: string; name: string; shortName: string | null }[];
  assignments: {
    canvasId: string;
    courseCanvasId: string;
    name: string;
    dueAt: string | null;
    pointsPossible: number | null;
    state: string;
    score: number | null;
  }[];
};

/// Pull from Canvas and hand the result straight back to the browser.
///
/// Nothing is written here. The server can read Canvas but cannot encrypt for
/// this student, so it fetches, returns, and forgets — the browser encrypts
/// and posts the ciphertext back through `storeCanvasData`. That round trip is
/// the cost of the server not being able to read anything.
export async function pullCanvas(): Promise<
  { ok: true; data: CanvasPull } | { ok: false; error: string }
> {
  const user = await requireUser();

  const conn = await db.canvasConnection.findUnique({
    where: { userId: user.id },
  });
  if (!conn) return { ok: false, error: "Canvas isn't connected." };

  const opts = {
    baseUrl: conn.baseUrl,
    token: decryptToken(conn.accessToken, conn.tokenIv),
  };

  try {
    const courses = await fetchCourses(opts);
    const assignments: CanvasPull["assignments"] = [];

    for (const course of courses) {
      const list = await fetchAssignments(opts, course.id);
      for (const a of list) {
        assignments.push({
          canvasId: a.id,
          courseCanvasId: course.id,
          name: a.name,
          dueAt: a.due_at,
          pointsPossible: a.points_possible,
          state: submissionState(a),
          score: a.submission?.score ?? null,
        });
      }
    }

    await db.canvasConnection.update({
      where: { userId: user.id },
      data: { lastSyncedAt: new Date(), lastSyncError: null, disconnectedAt: null },
    });

    return {
      ok: true,
      data: {
        courses: courses.map((c) => ({
          canvasId: c.id,
          name: c.name,
          shortName: c.course_code ?? null,
        })),
        assignments,
      },
    };
  } catch (e) {
    if (e instanceof CanvasAuthError) {
      // The critical distinction: a dead token is not "no assignments".
      // Marking it disconnected and opening a gap keeps the insight engine
      // from reading this silence as a quiet week.
      await db.canvasConnection.update({
        where: { userId: user.id },
        data: {
          disconnectedAt: new Date(),
          lastSyncError: "Canvas rejected the token",
        },
      });

      const openGap = await db.dataGap.findFirst({
        where: { userId: user.id, source: "CANVAS", endedAt: null },
      });
      if (!openGap) {
        await db.dataGap.create({
          data: {
            userId: user.id,
            source: "CANVAS",
            startedAt: new Date(),
            reason: "Access token expired or was revoked",
          },
        });
      }

      revalidatePath("/dashboard");
      return {
        ok: false,
        error:
          "Canvas stopped accepting your token — they expire every 90 days. Reconnect and everything resumes.",
      };
    }

    await db.canvasConnection.update({
      where: { userId: user.id },
      data: { lastSyncError: "Couldn't reach Canvas" },
    });
    return { ok: false, error: "Couldn't reach Canvas just now." };
  }
}

const sealed = z.object({
  cipher: z.string().min(1).max(20_000),
  iv: z.string().min(1).max(256),
});

const storeSchema = z.object({
  courses: z
    .array(z.object({ canvasId: z.string().max(64), payload: sealed }))
    .max(50),
  assignments: z
    .array(
      z.object({
        canvasId: z.string().max(64),
        courseCanvasId: z.string().max(64),
        dueAt: z.string().nullable(),
        payload: sealed,
      }),
    )
    .max(2000),
});

/// Store what the browser encrypted. Due dates stay plaintext so "what's next"
/// can be ordered without decrypting every row first; names and scores don't.
export async function storeCanvasData(input: unknown): Promise<CanvasResult> {
  const user = await requireUser();

  const parsed = storeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That sync data didn't look right." };
  }

  const courseIdByCanvasId = new Map<string, string>();

  for (const c of parsed.data.courses) {
    const row = await db.course.upsert({
      where: { userId_canvasId: { userId: user.id, canvasId: c.canvasId } },
      update: { payloadCipher: c.payload.cipher, payloadIv: c.payload.iv },
      create: {
        userId: user.id,
        canvasId: c.canvasId,
        payloadCipher: c.payload.cipher,
        payloadIv: c.payload.iv,
      },
    });
    courseIdByCanvasId.set(c.canvasId, row.id);
  }

  for (const a of parsed.data.assignments) {
    const courseId = courseIdByCanvasId.get(a.courseCanvasId);
    if (!courseId) continue;

    await db.assignment.upsert({
      where: { userId_canvasId: { userId: user.id, canvasId: a.canvasId } },
      update: {
        dueAt: a.dueAt ? new Date(a.dueAt) : null,
        payloadCipher: a.payload.cipher,
        payloadIv: a.payload.iv,
      },
      create: {
        userId: user.id,
        courseId,
        canvasId: a.canvasId,
        dueAt: a.dueAt ? new Date(a.dueAt) : null,
        payloadCipher: a.payload.cipher,
        payloadIv: a.payload.iv,
      },
    });
  }

  revalidatePath("/dashboard");
  return { ok: true };
}
