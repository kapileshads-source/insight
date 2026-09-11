/**
 * Deciding what a HAC sync should actually write.
 *
 * HAC rows have no id, so "have I seen this one before?" has to be answered
 * from the content, and the content is encrypted, so it can only be answered
 * in the browser, after decrypting what is already stored. That is not a
 * workaround: storing a hash of the name server-side would let anyone with the
 * database recover "Ch 5 Quiz" by guessing, and the encryption on that field
 * would be for show.
 *
 * So this is a plain diff between what the page says now and what we already
 * hold, computed on plaintext, in the one place plaintext exists.
 *
 * **What identifies a row.** Course, name, and the date it was *assigned*.
 * Not the due date: teachers move those, and keying on one would turn a
 * postponed quiz into a second quiz. Assigned dates stay put. The name alone
 * is not enough either, "Warm Up" appears every week in some courses, and
 * merging a term of them into one row would erase the whole set.
 */

import type { HacAssignment } from "./hac";

/// A HAC row already stored, after decryption.
export type StoredHacAssignment = {
  id: string;
  course: string;
  name: string;
  assignedOn: string | null;
  dueOn: string | null;
  score: number | null;
  pointsPossible: number | null;
  status: string;
};

const key = (a: { course: string; name: string; assignedOn: string | null; dueOn: string | null }) =>
  [
    a.course.trim().toLowerCase(),
    a.name.trim().toLowerCase().replace(/\s+/g, " "),
    // Assigned date first because it is the stable one. Falling back to the
    // due date keeps rows that have neither from collapsing into each other
    // any more than they already would.
    a.assignedOn ?? a.dueOn ?? "",
  ].join("|");

export type HacSyncPlan = {
  create: HacAssignment[];
  update: { id: string; row: HacAssignment }[];
  /// Rows that haven't changed. Counted rather than listed, there is nothing
  /// to do with them and a sync writing three hundred identical rows every ten
  /// minutes is how a free database tier gets used up.
  unchanged: number;
  /// Stored rows the page no longer shows. Not deleted: a teacher hiding a
  /// category, or a grading period rolling over, makes work vanish from the
  /// page while the grade it carried still counts. Surfaced so a caller can
  /// decide, and the caller currently decides to leave them alone.
  missing: StoredHacAssignment[];
};

/// Has anything worth writing changed?
function changed(stored: StoredHacAssignment, row: HacAssignment): boolean {
  return (
    stored.score !== row.score ||
    stored.pointsPossible !== row.pointsPossible ||
    stored.status !== row.status ||
    // Due dates move, and a moved one is worth storing, it is the thing the
    // assignments card sorts on.
    stored.dueOn !== row.dueOn
  );
}

export function planHacSync(
  existing: StoredHacAssignment[],
  incoming: HacAssignment[],
): HacSyncPlan {
  const byKey = new Map<string, StoredHacAssignment>();
  for (const row of existing) byKey.set(key(row), row);

  const plan: HacSyncPlan = { create: [], update: [], unchanged: 0, missing: [] };
  const seen = new Set<string>();

  for (const row of incoming) {
    const k = key(row);

    // The same key twice in one page is HAC repeating itself, not two
    // assignments. Taking the first is arbitrary but stable, and creating both
    // would produce a duplicate that never resolves.
    if (seen.has(k)) continue;
    seen.add(k);

    const stored = byKey.get(k);
    if (!stored) {
      plan.create.push(row);
      continue;
    }

    if (changed(stored, row)) plan.update.push({ id: stored.id, row });
    else plan.unchanged++;
  }

  for (const [k, row] of byKey) {
    if (!seen.has(k)) plan.missing.push(row);
  }

  return plan;
}

/**
 * Which course row a HAC assignment belongs to.
 *
 * HAC and Canvas name courses differently, "Biology AP 1-2" against "AP
 * Biology", so this reuses the same course matcher the assignment matcher
 * uses rather than inventing a second opinion. An unmatched course gets a row
 * of its own, which is correct: a class a student takes that Canvas doesn't
 * know about is still a class.
 */
export function courseIdFor(
  hacCourse: string,
  courses: { id: string; name: string }[],
  matches: (a: string, b: string) => boolean,
): string | null {
  const exact = courses.find(
    (c) => c.name.trim().toLowerCase() === hacCourse.trim().toLowerCase(),
  );
  if (exact) return exact.id;

  const matched = courses.filter((c) => matches(c.name, hacCourse));
  // Exactly one, or none. Two courses matching one HAC name means the matcher
  // can't tell them apart, and guessing would file a grade against the wrong
  // class, the mistake this whole area is built to avoid.
  return matched.length === 1 ? matched[0].id : null;
}
