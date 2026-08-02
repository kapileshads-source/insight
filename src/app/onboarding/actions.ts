"use server";

import { randomBytes, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateUser, requiresParentConsent } from "@/lib/user";

// Server Actions are reachable by direct POST, not only through our own UI, so
// every one of these re-checks the session rather than trusting the caller.
async function requireUser() {
  const user = await getOrCreateUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

// --- birthdate --------------------------------------------------------------

const birthDateSchema = z.object({
  birthDate: z.iso.date(),
});

export async function saveBirthDate(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = birthDateSchema.safeParse({
    birthDate: formData.get("birthDate"),
  });
  if (!parsed.success) {
    return { ok: false, error: "That doesn't look like a valid date." };
  }

  const birthDate = new Date(`${parsed.data.birthDate}T00:00:00Z`);
  const now = new Date();

  if (birthDate > now) {
    return { ok: false, error: "That date is in the future." };
  }
  // A 1908 birthdate is a typo or a joke, not a student.
  if (now.getUTCFullYear() - birthDate.getUTCFullYear() > 25) {
    return { ok: false, error: "Insight is for current FISD students." };
  }

  await db.user.update({
    where: { id: user.id },
    data: { birthDate },
  });

  revalidatePath("/onboarding");
  return { ok: true };
}

// --- parent consent ---------------------------------------------------------

const parentEmailSchema = z.object({ parentEmail: z.email() });

export async function requestParentConsent(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();

  if (!user.birthDate || !requiresParentConsent(user.birthDate)) {
    return { ok: false, error: "Parent consent isn't needed for this account." };
  }

  const parsed = parentEmailSchema.safeParse({
    parentEmail: formData.get("parentEmail"),
  });
  if (!parsed.success) {
    return { ok: false, error: "That doesn't look like an email address." };
  }
  if (
    parsed.data.parentEmail.toLowerCase() === user.email.toLowerCase()
  ) {
    return {
      ok: false,
      error: "This has to be a parent or guardian's email, not your own.",
    };
  }

  // Only the hash is stored, so a database leak doesn't hand out working
  // consent links.
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  await db.parentConsent.upsert({
    where: { userId: user.id },
    update: {
      parentEmail: parsed.data.parentEmail,
      tokenHash,
      requestedAt: new Date(),
      confirmedAt: null,
      revokedAt: null,
    },
    create: {
      userId: user.id,
      parentEmail: parsed.data.parentEmail,
      tokenHash,
    },
  });

  // TODO: send the consent email through Resend once the template exists.
  // Until then the link is logged so the flow can be walked end to end.
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[consent] ${parsed.data.parentEmail} -> /consent/${token}`,
    );
  }

  revalidatePath("/onboarding");
  return { ok: true };
}

// --- encryption setup -------------------------------------------------------

const encryptionSetupSchema = z.object({
  kdf: z.string().max(64),
  iterations: z.number().int().min(100_000).max(5_000_000),
  salt: z.string().max(256),
  wrappedDek: z.string().max(1024),
  wrapIv: z.string().max(256),
  verifierCipher: z.string().max(1024),
  verifierIv: z.string().max(256),
});

/// Stores the wrapped key material produced in the browser.
///
/// Everything arriving here is already encrypted or public. The password is
/// not sent, cannot be sent, and there is no code path on the server that
/// could recover it.
export async function saveEncryptionSetup(
  setup: unknown,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = encryptionSetupSchema.safeParse(setup);
  if (!parsed.success) {
    return { ok: false, error: "That key material didn't look right." };
  }

  // Re-running this would orphan every existing encrypted row, so it is
  // create-once. Changing a password goes through a separate path that
  // re-wraps the same data key.
  if (user.encryptionKey) {
    return { ok: false, error: "Encryption is already set up on this account." };
  }

  await db.encryptionKey.create({
    data: { userId: user.id, ...parsed.data },
  });

  revalidatePath("/onboarding");
  return { ok: true };
}

// --- school -----------------------------------------------------------------

const schoolSchema = z.object({
  schoolId: z.string().min(1),
  gradeLevel: z.coerce.number().int().min(6).max(12),
});

export async function saveSchool(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = schoolSchema.safeParse({
    schoolId: formData.get("schoolId"),
    gradeLevel: formData.get("gradeLevel"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Pick a school and a grade." };
  }

  const school = await db.school.findUnique({
    where: { id: parsed.data.schoolId },
  });
  if (!school) return { ok: false, error: "That school isn't in the list." };

  const isHigh = school.type === "HIGH";
  const gradeFits = isHigh
    ? parsed.data.gradeLevel >= 9
    : parsed.data.gradeLevel <= 8;
  if (!gradeFits) {
    return {
      ok: false,
      error: isHigh
        ? "High schools run grades 9 to 12."
        : "Middle schools run grades 6 to 8.",
    };
  }

  await db.user.update({
    where: { id: user.id },
    data: { schoolId: school.id, gradeLevel: parsed.data.gradeLevel },
  });

  revalidatePath("/onboarding");
  return { ok: true };
}

// --- devices ----------------------------------------------------------------

const devicesSchema = z.object({
  laptopOs: z.enum(["WINDOWS", "MACOS", "CHROMEOS", "NONE"]),
  phoneOs: z.enum(["IOS", "ANDROID", "NONE"]),
});

export async function saveDevices(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = devicesSchema.safeParse({
    laptopOs: formData.get("laptopOs"),
    phoneOs: formData.get("phoneOs"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Pick one of each." };
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      laptopOs: parsed.data.laptopOs,
      phoneOs: parsed.data.phoneOs,
      onboardingCompletedAt: new Date(),
    },
  });

  revalidatePath("/onboarding");
  return { ok: true };
}
