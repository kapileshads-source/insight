/**
 * A GPA estimate, on Frisco's two scales.
 *
 * **This is an estimate and the wording must never stop saying so.** The
 * district computes GPA once, after a semester closes, from semester final
 * grades. Anything derived mid-term from in-progress marks is a projection of
 * what those finals might be, and it will disagree with the transcript — which
 * is fine as long as nobody is told otherwise. A GPA is the number a student
 * cares about most, and being confidently wrong about it once is the kind of
 * error they do not come back from.
 *
 * ## Two scales, two different formulas
 *
 * This is the part that nearly shipped broken. Both were assumed to work the
 * same way; they do not, and a real transcript is what proved it.
 *
 * - **Weighted** is per-percent: every point below 100 costs 0.1, from a
 *   maximum set by the course's level. An AP 100 is 6.0, an AP 90 is 5.0.
 *   Checked against a real 2025-26 transcript, this reproduced **4.6688**
 *   against a printed **4.6940** — the whole residual being which courses count
 *   as Advanced. The formula is right.
 * - **Unweighted (the "4.0 College GPA")** is *letter-based*. Applying the
 *   per-percent rule with a 4.0 maximum gave **3.2312** against a printed
 *   **3.7780** — visibly, unusably wrong. A plain letter scale gives ≈3.75,
 *   which is essentially right.
 *
 * The remaining ~0.03 on each is unconfirmed: the exact letter cutoffs, and
 * the level of two courses on that transcript. Both are marked below.
 */

export type CourseLevel = "AP" | "ADVANCED" | "ON_LEVEL";

/// The maximum a course can contribute, by level. Kapilesh, 2026-09-06.
export const LEVEL_MAX: Record<CourseLevel, number> = {
  AP: 6.0,
  ADVANCED: 5.5,
  ON_LEVEL: 5.0,
};

/// The unweighted scale tops out here regardless of level — that is what makes
/// it unweighted.
export const UNWEIGHTED_MAX = 4.0;

/**
 * Which level a course title implies.
 *
 * Frisco puts it in the name: `AP Pre Calculus S1 - C Lunch`,
 * `Computer Science 1 Adv S1`. Honors, dual credit, PLTW and CTE all count as
 * Advanced.
 *
 * Word-boundary matching throughout, because substrings betray you here:
 * "AP" appears inside "Capstone" and "Graphic", and "Adv" inside "Advisory".
 * A course wrongly promoted to AP inflates a GPA silently, which is exactly
 * the failure this file is trying not to have.
 */
export function levelOf(title: string): CourseLevel {
  const text = ` ${title.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const has = (word: string) => text.includes(` ${word} `);

  if (has("ap") || has("ib")) return "AP";

  if (
    has("adv") ||
    has("advanced") ||
    has("honors") ||
    has("hon") ||
    has("dc") ||
    has("dual") ||
    has("pltw") ||
    has("onramps")
  ) {
    return "ADVANCED";
  }

  return "ON_LEVEL";
}

/**
 * Weighted points for one semester of one course.
 *
 * Every percent below 100 costs a tenth, from the level's maximum. Clamped at
 * zero: a 40 in an on-level class would otherwise score −1.0 and drag the mean
 * below anything a transcript could print.
 */
export function weightedPoints(grade: number, level: CourseLevel): number {
  const points = LEVEL_MAX[level] - (100 - grade) * 0.1;
  return Math.max(0, Math.round(points * 10000) / 10000);
}

/**
 * Unweighted points, on the 4.0 scale.
 *
 * Letter bands, not arithmetic — see the note at the top. The cutoffs here are
 * plain decades, which reproduced a real transcript to within 0.03. **They are
 * not confirmed against district policy**, and the residual is probably here:
 * Frisco may use 90/80/75/70 rather than 90/80/70/60. One line to change if so,
 * and the tests below pin the current behaviour so a change is visible.
 */
export function unweightedPoints(grade: number): number {
  if (grade >= 90) return 4;
  if (grade >= 80) return 3;
  if (grade >= 70) return 2;
  if (grade >= 60) return 1;
  return 0;
}

export type GpaCourse = {
  id: string;
  title: string;
  level: CourseLevel;
  /// One entry per semester with a final grade. Mid-term, this is the
  /// in-progress figure the gradebook prints, which is what makes the whole
  /// result an estimate.
  grades: number[];
  /// Excluded from the calculation. Zero-credit and non-academic courses are
  /// excluded by default; a student can exclude anything else by hand.
  excluded?: boolean;
};

export type GpaEstimate = {
  weighted: number | null;
  unweighted: number | null;
  /// How many semester grades went in. Shown, because a GPA over two grades is
  /// not the same claim as one over sixteen.
  counted: number;
  excluded: number;
};

/**
 * The estimate.
 *
 * Null rather than zero when nothing counts. A student who has excluded
 * everything, or whose term has not started, has *no* GPA — and rendering that
 * as 0.00 would read as catastrophe rather than as absence.
 */
export function estimateGpa(courses: GpaCourse[]): GpaEstimate {
  let weightedSum = 0;
  let unweightedSum = 0;
  let counted = 0;
  let excluded = 0;

  for (const course of courses) {
    if (course.excluded) {
      excluded++;
      continue;
    }
    for (const grade of course.grades) {
      if (!Number.isFinite(grade)) continue;
      weightedSum += weightedPoints(grade, course.level);
      unweightedSum += unweightedPoints(grade);
      counted++;
    }
  }

  if (counted === 0) {
    return { weighted: null, unweighted: null, counted: 0, excluded };
  }

  const round = (n: number) => Math.round((n / counted) * 10000) / 10000;
  return {
    weighted: round(weightedSum),
    unweighted: round(unweightedSum),
    counted,
    excluded,
  };
}

/**
 * Courses that should not count toward a GPA by default.
 *
 * Kapilesh's own dashboard surfaced "CHS Flashing Lights" — a district
 * compliance course that appears in Canvas and is not a class. Counting it
 * would move a GPA.
 *
 * Deliberately a small, explicit list of markers rather than an LLM judgement.
 * A model guessing whether a course counts is a guess that silently changes the
 * number a student cares about most, and the student cannot see it happen. The
 * transcript already marks the real answer — those rows carry 0.0000 credit —
 * so where credit is known it should win over any inference, and where it is
 * not, the student gets a toggle.
 */
/**
 * Keep only the Canvas courses that HAC also knows about.
 *
 * Kapilesh's idea, and it is better than the marker list below because it is
 * evidence rather than guesswork. HAC lists what a student is actually
 * enrolled in. Canvas lists that *plus* whatever the district has pushed into
 * it — "Frisco ISD 1forAll Student Course 26-27", "Cen10 Titans Info", "CHS
 * Flashing Lights" — which are Canvas shells, not classes, and one of them was
 * sitting at 100% and lifting a GPA.
 *
 * So: if HAC has told us anything, HAC is the roll. A Canvas course with no
 * counterpart there is not a class the student takes.
 *
 * Matching is the same asymmetric matcher the assignments use, because the two
 * systems name a class nothing alike — `SCI22200A - 6 Chemistry Adv S1` against
 * `Chemistry Adv YR (Whitt, Austin)`. It refuses rather than guesses, so an
 * unmatched Canvas course is dropped rather than kept on a maybe.
 *
 * **When HAC has said nothing, every course is kept.** Returning an empty list
 * because a sync has not run yet would silently blank the GPA, which is the
 * failure this codebase keeps repeating: a filter that is right in steady
 * state and wrong on first use.
 */
/**
 * The words in a course title that identify the class.
 *
 * The two systems name one class nothing alike:
 *
 *   HAC     SCI22200A - 6 Chemistry Adv S1
 *   Canvas  Chemistry Adv YR (Whitt, Austin)
 *
 * So the code and section prefix, the teacher in parentheses, and the term
 * marker all come off, leaving "chemistry adv" on both sides.
 *
 * The general assignment matcher cannot be reused here — it vetoes on
 * disagreeing numbers, and `22200` against nothing is exactly that. That
 * caution is right when filing a grade against a class and wrong when asking
 * "are these the same subject", which is all this needs to answer.
 */
export function classTokens(title: string): string[] {
  return title
    .toLowerCase()
    // The teacher, which only Canvas carries.
    .replace(/\([^)]*\)/g, " ")
    // HAC's course code and section: "SCI22200A - 6 ".
    .replace(/^[a-z]{2,4}\d{3,6}[a-z]?\s*-\s*\d+\s*/i, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(
      (t) =>
        t.length > 0 &&
        // Term and semester markers, which the two systems disagree about for
        // the same class — S1 against YR.
        !["s1", "s2", "yr", "a", "b", "the", "of", "and"].includes(t) &&
        // Anything left that is purely a number is a code fragment.
        !/^\d+$/.test(t),
    );
}

/**
 * Whether two titles name the same class.
 *
 * Every significant word of the shorter title must appear in the longer one.
 * "chemistry adv" matches "chemistry adv"; it does not match "chemistry" alone,
 * because an on-level class and an advanced one are different courses and
 * conflating them would move a GPA.
 */
export function sameClass(a: string, b: string): boolean {
  const left = classTokens(a);
  const right = classTokens(b);
  if (left.length === 0 || right.length === 0) return false;

  // Level markers must agree on both sides before anything else is compared.
  //
  // Subset matching alone said "Chemistry Adv" and "Chemistry" were the same
  // class, because every word of the shorter appears in the longer. They are
  // different courses with different GPA maxima, and merging them would move
  // the number silently.
  const LEVELS = ["ap", "adv", "advanced", "honors", "hon", "gt", "ib", "dc"];
  const leftLevel = new Set(left.filter((t) => LEVELS.includes(t)));
  const rightLevel = new Set(right.filter((t) => LEVELS.includes(t)));
  if ((leftLevel.size > 0) !== (rightLevel.size > 0)) return false;

  const [short, long] =
    left.length <= right.length ? [left, right] : [right, left];
  const bag = new Set(long);
  return short.every((t) => bag.has(t));
}

export function keepEnrolled<T extends { title: string; fromHac: boolean }>(
  courses: T[],
  matches: (a: string, b: string) => boolean = sameClass,
): T[] {
  const roll = courses.filter((c) => c.fromHac);
  if (roll.length === 0) return courses;

  return courses.filter((c) => {
    if (c.fromHac) return true;
    return roll.some(
      (h) =>
        h.title.trim().toLowerCase() === c.title.trim().toLowerCase() ||
        matches(h.title, c.title),
    );
  });
}

const NOT_A_CLASS = [
  "flashing lights",
  // Canvas shells the district pushes to every student. Seen on a real
  // account, one of them carrying a 100% that was lifting a GPA.
  "1forall",
  "titans info",
  "student course",
  "advisory",
  "homeroom",
  "tech waiver",
  "waiver",
  "orientation",
  "study hall",
];

// Note what is deliberately *not* in that list: "lunch". Frisco writes the
// lunch wave into real course titles — "AP Pre Calculus S1 - C Lunch",
// "Computer Science 1 Adv S1 - A Lunch" — so matching it would have excluded
// an AP class from the GPA and quietly lowered it.

/**
 * Whether a course grade can be used in a GPA at all.
 *
 * A course reading 0 has not been graded — it has not failed. Progress checks
 * count for nothing and assessments are the whole grade, so a class whose
 * assessment category is still empty prints `0.00%` while holding a page of
 * marked work. A real Frisco English class did exactly that.
 *
 * Feeding that into a GPA turns "the term has not really started" into a
 * catastrophic number, and it is the first thing a student would see. A
 * genuine zero across a whole course does not happen to someone attending
 * school, so excluding is the safe direction — and the moment one assessment
 * is marked, the course reappears on its own.
 */
export function hasUsableGrade(grade: number | null): boolean {
  return grade !== null && Number.isFinite(grade) && grade > 0;
}

export function looksNonAcademic(title: string): boolean {
  const text = title.toLowerCase();
  return NOT_A_CLASS.some((marker) => text.includes(marker));
}
