import type { OutcomeRecord } from "@/lib/insights";

/**
 * Real marked work, as outcomes the insight engine can use.
 *
 * This closes the gap the whole app was built around and never crossed. The
 * engine compares study habits against *scores*, and the only scores it ever
 * had were the ones a student typed in by hand, which, in practice, nobody
 * does. So every insight sat in "still gathering" indefinitely, and the one
 * thing making Insight more than a gradebook had never run on anything real.
 *
 * HAC and Canvas have been syncing marked work for weeks. Each graded
 * assignment already *is* an outcome: a percentage, in a subject, on a date.
 * It only had to be handed over.
 *
 * Three judgements are made here, and each one is a decision about what a
 * grade means rather than a technicality:
 */

/// The shape this needs, which both the Canvas and HAC rows already satisfy.
/// Deliberately minimal so it can be built from either without a conversion.
export type MarkedWork = {
  id: string;
  course: string;
  name: string;
  category?: string | null;
  score: number | null;
  pointsPossible: number | null;
  /// When the work was due, *not* when the mark was seen. See below.
  dueAt: Date | null;
  /// When Insight first stored the row. The fallback, and only that.
  updatedAt: Date;
};

/**
 * (1) Small assignments are excluded.
 *
 * A two-point warm-up scored 2/2 is a 100%, and it counts exactly as much
 * towards a mean as a unit test. A student with thirty completion grades and
 * four real assessments would have their scores drowned in 100s, and every
 * comparison the engine ran would be between two groups of near-identical
 * noise.
 *
 * Twenty points is the line, which in Frisco's gradebooks separates a daily
 * grade from an assessment reliably enough. It is a heuristic, and it is
 * applied loudly rather than quietly: `excludedAsMinor` reports the count so
 * the UI can say what was left out.
 */
export const MIN_POINTS = 20;

/// Categories HAC uses for work that is not an assessment. Matched loosely
/// because the district's own spelling varies by campus.
const MINOR_CATEGORIES = /progress|practice|homework|classwork|daily|warm|participation/i;

/// Categories that are assessments regardless of how few points they carry,
/// a 10-point quiz is still a quiz.
const MAJOR_CATEGORIES = /assess|test|exam|quiz|project|essay|lab|summative/i;

function isMajor(work: MarkedWork): boolean {
  const category = work.category ?? "";
  if (MAJOR_CATEGORIES.test(category)) return true;
  if (MINOR_CATEGORIES.test(category)) return false;
  // No category, or one that says nothing: fall back to what it is worth.
  return (work.pointsPossible ?? 0) >= MIN_POINTS;
}

/**
 * (2) The date is when the work was due, not when the mark appeared.
 *
 * This one would have silently ruined the whole feature. The engine looks at
 * the seven days *before* an outcome to find the sessions that prepared for
 * it. On a first sync every row arrives at once, so `updatedAt` is the same
 * timestamp for a whole term of work, which would place every test on the
 * same afternoon and compare all of them against the same handful of recent
 * sessions.
 *
 * `dueAt` is when the student actually sat the thing. It is missing often
 * enough that a fallback is needed, and a row with neither is dropped rather
 * than guessed at: an outcome on the wrong date is worse than one absent.
 */
function dateOf(work: MarkedWork): Date | null {
  if (work.dueAt) return work.dueAt;
  return null;
}

/**
 * (3) Percentages above 130 are thrown away.
 *
 * Extra credit is real and a 105% should count. A 900% is a gradebook where
 * the points-possible field was left at 1, which happens, and a single one of
 * those moves a mean by more than any study habit ever will.
 */
const MAX_SENSIBLE_PERCENT = 130;

export function percentOfWork(work: MarkedWork): number | null {
  if (work.score === null || work.pointsPossible === null) return null;
  if (work.pointsPossible <= 0) return null;
  const pct = (work.score / work.pointsPossible) * 100;
  if (!Number.isFinite(pct) || pct < 0 || pct > MAX_SENSIBLE_PERCENT) {
    return null;
  }
  return pct;
}

export type GradeOutcomeSummary = {
  outcomes: OutcomeRecord[];
  /// Graded work left out for being too small to mean anything.
  excludedAsMinor: number;
  /// Graded work left out because nothing said when it happened.
  excludedUndated: number;
};

/**
 * Turn marked work into outcomes, and say what was left out.
 *
 * The counts are returned rather than logged because a student looking at
 * "based on 11 scores" when their gradebook shows 40 assignments deserves an
 * answer, and "we ignored the homework" is a much better one than silence.
 */
export function outcomesFromMarkedWork(
  work: MarkedWork[],
): GradeOutcomeSummary {
  const outcomes: OutcomeRecord[] = [];
  let excludedAsMinor = 0;
  let excludedUndated = 0;

  for (const w of work) {
    const percentage = percentOfWork(w);
    if (percentage === null) continue;

    if (!isMajor(w)) {
      excludedAsMinor++;
      continue;
    }

    const occurredOn = dateOf(w);
    if (!occurredOn) {
      excludedUndated++;
      continue;
    }

    outcomes.push({
      id: w.id,
      occurredOn,
      percentage,
      // The course, which is what the engine's "held across more than one
      // subject" gate is counting. Without it every grade looks like the same
      // class and nothing can ever clear that gate.
      subject: w.course,
      label: w.name,
    });
  }

  return { outcomes, excludedAsMinor, excludedUndated };
}

/**
 * Merge hand-entered outcomes with ones derived from the gradebook.
 *
 * Hand-entered wins on a collision. A student who typed a score in did so for
 * a reason, usually because it was not in Canvas, and if it later shows up
 * in the gradebook too, counting it twice would weight that one test double.
 * Matching is by subject and day, which is as precise as it can be: the two
 * sources do not share an identifier.
 */
export function mergeOutcomes(
  typed: OutcomeRecord[],
  derived: OutcomeRecord[],
): OutcomeRecord[] {
  const claimed = new Set(
    typed.map((o) => `${o.subject?.trim().toLowerCase() ?? ""}|${dayKey(o.occurredOn)}`),
  );

  return [
    ...typed,
    ...derived.filter(
      (o) =>
        !claimed.has(
          `${o.subject?.trim().toLowerCase() ?? ""}|${dayKey(o.occurredOn)}`,
        ),
    ),
  ];
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
