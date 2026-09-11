/**
 * Turning graded assignments into the scores the insight engine reads.
 *
 * This is the join between the two halves of the app, and until now it did not
 * exist. Canvas grades have been syncing every ten minutes, HAC grades arrive
 * whenever a student asks for them, and the engine could see neither: every
 * score it has ever used was typed in by hand. A student with a connected
 * gradebook still had to re-enter their own marks for any of it to mean
 * anything, which almost nobody would do.
 *
 * The whole thing is pure and works on plaintext, so it runs in the browser,
 * assignment names and scores are encrypted and the server cannot read either
 * side of the comparison.
 *
 * The rule that shapes it: **never count the same test twice.** The engine
 * averages outcomes, so a hand-entered "Bio test, 82%" and a synced "Unit 2
 * Test, 82/100" landing as two rows would quietly weight that test double and
 * distort every correlation drawn from it. A duplicate is worse than a miss
 * here for exactly the reason a wrong merge is worse in the assignment matcher.
 */

/// A graded assignment, decrypted, from either gradebook.
export type GradedAssignment = {
  id: string;
  courseId: string | null;
  /// Course name as its own system spells it, for the label and for matching
  /// against a hand-entered subject.
  course: string;
  name: string;
  /// The day the score belongs to. The due date, since neither gradebook tells
  /// us when it was marked.
  occurredOn: string;
  score: number;
  pointsPossible: number;
};

/// An outcome already stored, decrypted.
export type ExistingOutcome = {
  id: string;
  /// Set when this outcome came from an assignment. Null for hand-entered.
  assignmentId: string | null;
  source: "CANVAS" | "HAC" | "MANUAL";
  occurredOn: string;
  percentage: number;
  subject?: string | null;
};

export type PlannedOutcome = {
  assignmentId: string;
  courseId: string | null;
  occurredOn: string;
  percentage: number;
  label: string;
  subject: string;
  pointsEarned: number;
  pointsPossible: number;
};

/// A hand-entered score and a gradebook score that describe the same test and
/// disagree. Surfaced rather than resolved: the student knows which is right,
/// and picking one silently is how a wrong number becomes permanent.
export type OutcomeConflict = {
  outcomeId: string;
  assignmentId: string;
  /// What the student typed.
  manual: number;
  /// What the gradebook says.
  gradebook: number;
  label: string;
};

export type OutcomePlan = {
  create: PlannedOutcome[];
  conflicts: OutcomeConflict[];
  /// Why things were left out, for a line of UI that explains itself rather
  /// than a number appearing from nowhere.
  skipped: {
    alreadyRecorded: number;
    noPointsPossible: number;
    matchedByHand: number;
    implausible: number;
  };
};

/// How far apart two dates can be and still be the same assessment. A teacher
/// entering a test the following day is ordinary; three days is a different
/// week of school.
const SAME_TEST_DAYS = 2;

/// Above this, the numbers are a data-entry accident rather than extra credit,
/// a 5-point warm-up recorded as 100 would be 2000% and would move a term's
/// average on its own.
const IMPLAUSIBLE_PERCENTAGE = 200;

/// Percentage points within which two scores are "the same". Rounding differs
/// between gradebooks and a student typing 82 for 82.4 is not a disagreement.
const SAME_SCORE_TOLERANCE = 1;

function daysBetween(a: string, b: string): number {
  const parse = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  };
  return Math.abs(parse(a) - parse(b)) / 86_400_000;
}

const sameSubject = (a: string | null | undefined, b: string): boolean => {
  if (!a) return false;
  const norm = (s: string) => s.trim().toLowerCase();
  const left = norm(a);
  const right = norm(b);
  // Loose on purpose: "Bio" against "AP Biology" should count as the same
  // class here, because the alternative is double-counting a test.
  return (
    left === right || left.includes(right) || right.includes(left)
  );
};

/**
 * What should be written, given what the gradebooks say and what already exists.
 *
 * Nothing is deleted and nothing is overwritten. A conflict is reported, not
 * resolved, the student is the only one who knows which number is right.
 */
export function planOutcomes(
  graded: GradedAssignment[],
  existing: ExistingOutcome[],
): OutcomePlan {
  const byAssignment = new Set(
    existing.map((o) => o.assignmentId).filter((id): id is string => Boolean(id)),
  );
  const manual = existing.filter((o) => o.source === "MANUAL");

  const plan: OutcomePlan = {
    create: [],
    conflicts: [],
    skipped: {
      alreadyRecorded: 0,
      noPointsPossible: 0,
      matchedByHand: 0,
      implausible: 0,
    },
  };

  for (const a of graded) {
    // Already recorded. Re-recording it would double the test's weight.
    if (byAssignment.has(a.id)) {
      plan.skipped.alreadyRecorded++;
      continue;
    }

    // A zero-point assignment has no percentage. Extra credit and ungraded
    // practice both land here, and neither is an assessment.
    if (!(a.pointsPossible > 0)) {
      plan.skipped.noPointsPossible++;
      continue;
    }

    const percentage = (a.score / a.pointsPossible) * 100;
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > IMPLAUSIBLE_PERCENTAGE) {
      plan.skipped.implausible++;
      continue;
    }

    // Did the student already type this one in? Same class, same few days.
    const typed = manual.find(
      (o) =>
        sameSubject(o.subject, a.course) &&
        daysBetween(o.occurredOn, a.occurredOn) <= SAME_TEST_DAYS,
    );

    if (typed) {
      plan.skipped.matchedByHand++;
      // Same number, near enough, the hand-entered row stands and nothing
      // needs saying.
      if (Math.abs(typed.percentage - percentage) > SAME_SCORE_TOLERANCE) {
        plan.conflicts.push({
          outcomeId: typed.id,
          assignmentId: a.id,
          manual: typed.percentage,
          gradebook: percentage,
          label: a.name,
        });
      }
      continue;
    }

    plan.create.push({
      assignmentId: a.id,
      courseId: a.courseId,
      occurredOn: a.occurredOn,
      percentage,
      label: a.name,
      subject: a.course,
      pointsEarned: a.score,
      pointsPossible: a.pointsPossible,
    });
  }

  return plan;
}
