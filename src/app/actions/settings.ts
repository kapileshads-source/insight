"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/user";
import {
  DEFAULT_CATEGORIES,
  isBlockCategory,
  normalizeEntry,
} from "@/lib/blocklist";

export type SettingsResult = { ok: true } | { ok: false; error: string };

async function requireUser() {
  const user = await getOrCreateUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

// --- password change --------------------------------------------------------

const setupSchema = z.object({
  kdf: z.string().max(64),
  iterations: z.number().int().min(100_000).max(5_000_000),
  salt: z.string().max(256),
  wrappedDek: z.string().max(1024),
  wrapIv: z.string().max(256),
  verifierCipher: z.string().max(1024),
  verifierIv: z.string().max(256),
});

/// Replace the wrapped key material after a password change.
///
/// Distinct from the create-once action used at signup. What arrives here is
/// the *same* data key re-wrapped under a new password, which is why not one
/// encrypted row has to be rewritten — and why this is safe to repeat.
export async function updateEncryptionSetup(
  setup: unknown,
): Promise<SettingsResult> {
  const user = await requireUser();

  const parsed = setupSchema.safeParse(setup);
  if (!parsed.success) {
    return { ok: false, error: "That key material didn't look right." };
  }
  if (!user.encryptionKey) {
    return { ok: false, error: "There's no encryption set up to change." };
  }

  await db.encryptionKey.update({
    where: { userId: user.id },
    data: parsed.data,
  });

  return { ok: true };
}

// --- muting -----------------------------------------------------------------

const categorySchema = z.enum([
  "SLEEP",
  "STUDY_TIMING",
  "SESSION_LENGTH",
  "LOCATION",
  "NOISE",
  "PHONE_USAGE",
  "DISTRACTION",
  "WELLBEING",
]);

/// Turn a whole category of insight off.
///
/// In the plan because some of these land badly — a student already anxious
/// about sleep does not need a weekly reminder that theirs correlates with
/// their grades. Muting is a first-class feature, not a hidden preference.
export async function setCategoryMuted(
  category: unknown,
  muted: boolean,
): Promise<SettingsResult> {
  const user = await requireUser();

  const parsed = categorySchema.safeParse(category);
  if (!parsed.success) return { ok: false, error: "Unknown category." };

  if (muted) {
    await db.mutedInsightCategory.upsert({
      where: {
        userId_category: { userId: user.id, category: parsed.data },
      },
      update: {},
      create: { userId: user.id, category: parsed.data },
    });
  } else {
    await db.mutedInsightCategory.deleteMany({
      where: { userId: user.id, category: parsed.data },
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/settings");
  return { ok: true };
}

export async function getMutedCategories(): Promise<string[]> {
  const user = await getOrCreateUser();
  if (!user) return [];
  const rows = await db.mutedInsightCategory.findMany({
    where: { userId: user.id },
    select: { category: true },
  });
  return rows.map((r) => r.category);
}

// --- export -----------------------------------------------------------------

/// Hand back everything we hold, ciphertext included.
///
/// The browser decrypts it and writes the file, which is the only way an
/// export can work here — we couldn't produce a readable one if we tried.
/// Promised on the privacy page, so it is not optional.
export async function exportEverything() {
  const user = await getOrCreateUser();
  if (!user) return null;

  const [sessions, sleep, screenTime, outcomes, courses, assignments] =
    await Promise.all([
      db.studySession.findMany({ where: { userId: user.id } }),
      db.sleepEntry.findMany({ where: { userId: user.id } }),
      db.screenTimeEntry.findMany({ where: { userId: user.id } }),
      db.outcome.findMany({ where: { userId: user.id } }),
      db.course.findMany({ where: { userId: user.id } }),
      db.assignment.findMany({ where: { userId: user.id } }),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    account: {
      email: user.email,
      school: user.school?.name ?? null,
      gradeLevel: user.gradeLevel,
      birthDate: user.birthDate,
      createdAt: user.createdAt,
    },
    sessions,
    sleep,
    screenTime,
    outcomes,
    courses,
    assignments,
  };
}

// --- deletion ---------------------------------------------------------------

/// Delete the account and everything hanging off it.
///
/// Every relation cascades from User, so this one delete is genuinely
/// complete rather than leaving orphaned rows behind — which is what the
/// retention promise on the privacy page actually requires.
///
/// The Clerk identity is left alone deliberately: signing out and removing
/// the login is Clerk's to do, and deleting our row is what removes the data.
export async function deleteAccount(
  confirmation: string,
): Promise<SettingsResult> {
  const user = await requireUser();

  // Typed confirmation rather than a modal button, because this is
  // unrecoverable and a misclick shouldn't manage it.
  if (confirmation.trim().toLowerCase() !== "delete everything") {
    return { ok: false, error: "Type the phrase exactly to confirm." };
  }

  await db.user.delete({ where: { id: user.id } });
  return { ok: true };
}

// --- canvas -----------------------------------------------------------------

export async function disconnectCanvas(): Promise<SettingsResult> {
  const user = await requireUser();
  await db.canvasConnection.deleteMany({ where: { userId: user.id } });
  revalidatePath("/dashboard");
  revalidatePath("/settings");
  return { ok: true };
}

// --- focus mode blocklist ---------------------------------------------------

const blocklistSchema = z.object({
  categories: z.array(z.string().max(32)).max(20),
  extra: z.array(z.string().max(253)).max(100),
  allowed: z.array(z.string().max(253)).max(100),
});

export type BlocklistPrefs = {
  categories: string[];
  extra: string[];
  allowed: string[];
};

export async function getBlocklistPrefs(): Promise<BlocklistPrefs> {
  const user = await getOrCreateUser();
  if (!user) {
    return { categories: [...DEFAULT_CATEGORIES], extra: [], allowed: [] };
  }

  return {
    categories:
      user.blockCategories.length > 0
        ? user.blockCategories
        : [...DEFAULT_CATEGORIES],
    extra: user.blockExtra,
    allowed: user.blockAllowed,
  };
}

/// Save which categories are on, plus any sites added or excepted by hand.
///
/// Sites are normalised before storing, so "https://www.YouTube.com/feed"
/// becomes "youtube.com" and anything that isn't a domain is dropped rather
/// than saved as a rule that silently never matches.
export async function saveBlocklistPrefs(
  input: unknown,
): Promise<SettingsResult> {
  const user = await requireUser();

  const parsed = blocklistSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That didn't look right." };

  const categories = parsed.data.categories.filter(isBlockCategory);
  // Entries, not just sites: a student can block or allow an app by name
  // now that Focus Mode reaches native apps.
  const clean = (list: string[]) =>
    [...new Set(list.map(normalizeEntry).filter(Boolean))];

  await db.user.update({
    where: { id: user.id },
    data: {
      blockCategories: categories,
      blockExtra: clean(parsed.data.extra),
      blockAllowed: clean(parsed.data.allowed),
    },
  });

  revalidatePath("/settings");
  return { ok: true };
}
