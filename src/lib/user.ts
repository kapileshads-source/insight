import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

/// Age in whole years on a given date.
export function ageInYears(birthDate: Date, on: Date = new Date()): number {
  let age = on.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = on.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && on.getUTCDate() < birthDate.getUTCDate())) {
    age--;
  }
  return age;
}

/// COPPA applies below 13. FISD middle schools start at grade 6, so this is a
/// routine case rather than an edge one.
export function requiresParentConsent(birthDate: Date, on?: Date): boolean {
  return ageInYears(birthDate, on) < 13;
}

/// The signed-in user's row, created on first sight.
///
/// Done lazily rather than through a Clerk webhook: a webhook is one more
/// secret to configure, one more thing to break in development, and it can
/// arrive after the user's first request anyway. Clerk remains the source of
/// truth for identity; this row only exists to hang data off.
export async function getOrCreateUser() {
  const { userId } = await auth();
  if (!userId) return null;

  const existing = await db.user.findUnique({
    where: { clerkId: userId },
    include: { encryptionKey: true, parentConsent: true, school: true },
  });
  if (existing) return existing;

  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress;
  if (!email) return null;

  return db.user.create({
    data: { clerkId: userId, email },
    include: { encryptionKey: true, parentConsent: true, school: true },
  });
}

export type OnboardingStep =
  | "BIRTHDATE"
  | "AWAITING_CONSENT"
  | "PASSPHRASE"
  | "SCHOOL"
  | "DEVICES"
  | "DONE";

type UserWithRelations = NonNullable<Awaited<ReturnType<typeof getOrCreateUser>>>;

/// Which step a student still needs to complete.
///
/// Order matters: nothing is collected before we know whether a parent has to
/// consent first, and nothing private is written before the encryption key
/// exists to protect it.
export function nextOnboardingStep(user: UserWithRelations): OnboardingStep {
  if (!user.birthDate) return "BIRTHDATE";

  if (requiresParentConsent(user.birthDate) && !user.parentConsent?.confirmedAt) {
    return "AWAITING_CONSENT";
  }

  if (!user.encryptionKey) return "PASSPHRASE";
  if (!user.schoolId || user.gradeLevel == null) return "SCHOOL";
  if (!user.laptopOs || !user.phoneOs) return "DEVICES";

  return "DONE";
}
