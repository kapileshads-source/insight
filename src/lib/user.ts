import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { traced } from "@/lib/db-errors";

/// Age in whole years on a given date.
export function ageInYears(birthDate: Date, on: Date = new Date()): number {
  let age = on.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = on.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && on.getUTCDate() < birthDate.getUTCDate())) {
    age--;
  }
  return age;
}

/// The youngest Insight accepts.
///
/// Thirteen because that is where COPPA's line is, not because of what a
/// timetable says: a handful of ninth-graders are twelve in August, and
/// "high school" would let them in.
export const MINIMUM_AGE = 13;

/// Under 13 is turned away rather than routed through parental consent.
///
/// The consent flow below still exists and still works. It is unreachable on
/// purpose: verified parental consent under COPPA means real parent emails
/// landing reliably in real inboxes, and a consent request that quietly goes
/// to spam fails in the worst available way — the student is stuck, the parent
/// never knew, and nothing anywhere says so. Turning under-13s away is honest
/// about what a free pilot can actually guarantee. Flip this back the day the
/// email path is proven and the flow has had a legal read.
export function isTooYoung(birthDate: Date, on?: Date): boolean {
  return ageInYears(birthDate, on) < MINIMUM_AGE;
}

/// Kept for the consent flow itself, which is dormant rather than deleted.
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

  const existing = await traced("user.findByClerkId", () =>
    db.user.findUnique({
      where: { clerkId: userId },
      include: { encryptionKey: true, parentConsent: true, school: true },
    }),
  );
  if (existing) return existing;

  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress;
  if (!email) return null;

  // Same person, new Clerk id.
  //
  // Clerk cannot move users between instances, so everyone's id changes on the
  // day this app switches from its development instance to production. Without
  // this branch that day would be quietly destructive: the insert below would
  // violate the unique constraint on email, and even if it didn't, the student
  // would get a fresh empty row while a year of encrypted logs sat orphaned
  // against their old id.
  //
  // Re-pointing on a verified email address is safe, because proving control
  // of the address is exactly what Clerk's magic link establishes — the same
  // guarantee any email-based account recovery rests on. Their data key is
  // untouched, so their existing password still opens everything.
  const byEmail = await traced("user.findByEmail", () =>
    db.user.findUnique({ where: { email } }),
  );
  if (byEmail) {
    return traced("user.relinkClerkId", () =>
      db.user.update({
        where: { id: byEmail.id },
        data: { clerkId: userId },
        include: { encryptionKey: true, parentConsent: true, school: true },
      }),
    );
  }

  // A student's very first request fans out into several server calls at once
  // — the page render, the encryption-key lookup, the period prompt — and each
  // one lands here. They all find no row, and they all try to create one. The
  // first wins; the rest violate a unique constraint and 500.
  //
  // Reading before writing can't fix that, because the gap between the read
  // and the write is precisely where the others are. So losing the race is
  // treated as success: the row now exists, which is what was wanted.
  try {
    return await db.user.create({
      data: { clerkId: userId, email },
      include: { encryptionKey: true, parentConsent: true, school: true },
    });
  } catch (e) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code?: string }).code === "P2002"
    ) {
      const winner = await db.user.findUnique({
        where: { clerkId: userId },
        include: { encryptionKey: true, parentConsent: true, school: true },
      });
      if (winner) return winner;
    }
    throw e;
  }
}

export type OnboardingStep =
  | "BIRTHDATE"
  | "TOO_YOUNG"
  | "AWAITING_CONSENT"
  | "PASSWORD"
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

  // Before anything else is asked for, and before anything private exists to
  // protect. Nothing beyond the birth date itself is ever collected from
  // someone this answer turns away.
  if (isTooYoung(user.birthDate)) return "TOO_YOUNG";

  if (!user.encryptionKey) return "PASSWORD";
  if (!user.schoolId || user.gradeLevel == null) return "SCHOOL";
  if (!user.laptopOs || !user.phoneOs) return "DEVICES";

  return "DONE";
}
