import { GATES } from "./insights";

/**
 * How far off the engine is from being able to say anything.
 *
 * The gates in `insights.ts` are the best thing in this app and they have a
 * cost nobody accounted for: a new student logs sessions for three or four
 * weeks and gets **nothing back**. The entire period in which someone decides
 * whether an app is worth keeping is the period this app has nothing to say.
 *
 * The fix is not to loosen a gate. It is to make the wait legible. A countdown
 * is a reason to keep going; an empty screen is a reason to stop, and the two
 * look identical from the outside.
 *
 * **What this must never do is promise a finding.** Clearing the floors only
 * buys a *comparison*; the permutation test then throws most of them out, which
 * is the entire point of it. "Two more scores and Insight will tell you about
 * your sleep" would be a lie roughly four times in five. So the wording here
 * says what happens — it starts checking — and never what it will find.
 */

/// Outcomes needed before any split has enough on both sides. A comparison
/// divides scores into two groups and wants `minPerGroup` in each, so the floor
/// is twice that — and even then only if they happen to land either side.
export const OUTCOMES_FLOOR = GATES.minPerGroup * 2;

export type Readiness = {
  sessions: number;
  outcomes: number;
  sessionsNeeded: number;
  outcomesNeeded: number;
  /// Both floors met. Not a promise that anything will surface.
  ready: boolean;
  headline: string;
  detail: string;
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * Read the two counts a student can actually influence.
 *
 * Deliberately only these. The other gates — the hold rate, the spread across
 * weeks, the permutation test — cannot be turned into a to-do item, because
 * nothing a student *does* moves them. Showing "your pattern must hold 60% of
 * the time" as a progress bar would invite them to think they had failed at
 * something.
 */
export function readiness(sessions: number, outcomes: number): Readiness {
  const sessionsNeeded = Math.max(0, GATES.minSessions - sessions);
  const outcomesNeeded = Math.max(0, OUTCOMES_FLOOR - outcomes);
  const ready = sessionsNeeded === 0 && outcomesNeeded === 0;

  if (ready) {
    return {
      sessions,
      outcomes,
      sessionsNeeded,
      outcomesNeeded,
      ready: true,
      headline: "Insight is checking your habits now",
      // Says what it does, not what it will find. Most comparisons fail the
      // shuffle, and that is the feature.
      detail:
        "You've logged enough for it to start comparing. It only shows a pattern that beats a thousand shuffles of your own data, so it may still stay quiet — that is it working, not failing.",
    };
  }

  const parts: string[] = [];
  if (sessionsNeeded > 0) {
    parts.push(plural(sessionsNeeded, "study session", "study sessions"));
  }
  if (outcomesNeeded > 0) {
    parts.push(plural(outcomesNeeded, "test score", "test scores"));
  }

  return {
    sessions,
    outcomes,
    sessionsNeeded,
    outcomesNeeded,
    ready: false,
    headline: `${parts.join(" and ")} to go`,
    detail:
      "Insight needs enough of your own history before it compares anything, so that what it tells you isn't a coincidence. Nothing is shown until then.",
  };
}

/// A 0–1 fraction for a progress bar. Both floors weighted equally: they are
/// both blocking, and a bar that races to 90% on sessions alone would suggest
/// the wait is nearly over when no test has been recorded at all.
export function readinessFraction(r: Readiness): number {
  const sessionPart = Math.min(1, r.sessions / GATES.minSessions);
  const outcomePart = Math.min(1, r.outcomes / OUTCOMES_FLOOR);
  return (sessionPart + outcomePart) / 2;
}
