/**
 * The gradebook view: what you scored, per class.
 *
 * Insight ingested grades for a year and never showed them to anyone. They went
 * straight into the insight engine as `Outcome` rows, which meant the app knew
 * a student's scores and offered no way to look at them. That is the front door
 * of every grade app students actually keep on their phones, and it was missing.
 *
 * **The rule this file exists to enforce: a course grade is quoted, never
 * computed.** Frisco weights its categories — "Progress Check for Learning"
 * against "Assessment of Learning" — and the weights are not published in the
 * page we read. A real gradebook, captured 2026-09-05, printed
 * `Student Grades 0.00%` for a class holding seven graded progress checks,
 * because its assessment category was empty. Any average we derived would have
 * said something like 87% and contradicted the number the student sees in HAC.
 *
 * Being wrong about a grade is the fastest way to lose someone's trust, and it
 * is unrecoverable: they will not check whether the rest of the app is right.
 * So `reportedGrade` is free text straight from the source, and there is
 * deliberately no function here that returns a course percentage.
 *
 * Per-assignment percentages are a different thing and are fine — 17 out of 20
 * is 85% by arithmetic nobody weights.
 */

export type GradeStatus =
  | "GRADED"
  | "UNGRADED"
  | "MISSING"
  | "EXCUSED"
  | "INCOMPLETE";

export type GradeRow = {
  id: string;
  course: string;
  name: string;
  category: string | null;
  score: number | null;
  pointsPossible: number | null;
  status: GradeStatus;
  /// When a sync last rewrote this row — the closest thing to "graded at" that
  /// either gradebook gives us.
  updatedAt: Date;
};

export type CourseGrades = {
  course: string;
  /// Exactly as the gradebook printed it, or null. Never derived. Free text,
  /// because it can be a percentage, a letter, or empty early in a term.
  reportedGrade: string | null;
  rows: GradeRow[];
  /// How many rows actually carry a mark. A class with twelve assignments and
  /// no scores should say so rather than look like a class you are failing.
  gradedCount: number;
};

/**
 * One assignment's own percentage.
 *
 * Null unless both halves are present and the denominator is positive. A
 * zero-point assignment is an extra-credit or ungraded placeholder, and
 * dividing by it produces `Infinity`, which renders as a very confident lie.
 */
export function percentOf(row: {
  score: number | null;
  pointsPossible: number | null;
}): number | null {
  if (row.score === null || row.pointsPossible === null) return null;
  if (!(row.pointsPossible > 0)) return null;
  if (!Number.isFinite(row.score)) return null;
  return Math.round((row.score / row.pointsPossible) * 1000) / 10;
}

/**
 * Whether the percentage is worth printing beside the raw mark.
 *
 * Almost every Frisco assignment is out of 100, which makes "93/100" and "93%"
 * the same sentence twice — and the repetition is not harmless, because a
 * column of duplicated figures is what the eye learns to skip. The percentage
 * earns its place only when the arithmetic isn't already done: 17 out of 20.
 */
export function showsPercent(row: {
  score: number | null;
  pointsPossible: number | null;
}): boolean {
  if (percentOf(row) === null) return false;
  return row.pointsPossible !== 100;
}

/// Rows worth showing in a gradebook. An assignment nobody has marked is not a
/// grade, and a list padded with blanks hides the marks that exist.
export function isGraded(row: { status: GradeStatus }): boolean {
  return row.status === "GRADED";
}

/**
 * Group rows into classes, newest mark first.
 *
 * `reportedGrades` maps course name to whatever the gradebook printed. A course
 * missing from it simply has no grade to show — which is the honest state early
 * in a term, and is why the value is nullable rather than defaulted to zero.
 */
export function buildGradebook(
  rows: GradeRow[],
  reportedGrades: Map<string, string | null> = new Map(),
): CourseGrades[] {
  const byCourse = new Map<string, GradeRow[]>();

  for (const row of rows) {
    const key = row.course || "Course";
    const list = byCourse.get(key);
    if (list) list.push(row);
    else byCourse.set(key, [row]);
  }

  const courses: CourseGrades[] = [];
  for (const [course, list] of byCourse) {
    const sorted = [...list].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
    courses.push({
      course,
      reportedGrade: reportedGrades.get(course) ?? null,
      rows: sorted,
      gradedCount: sorted.filter(isGraded).length,
    });
  }

  // A class with nothing to say is not shown at all.
  //
  // The first version sorted these to the bottom instead, on the reasoning that
  // a missing class looks like a broken sync. On a real account that produced a
  // screen of six identical cards reading "No grade posted yet / Nothing marked
  // yet in this class" — including two that are not classes — and the marks
  // that did exist were buried under them. An empty card is not reassurance,
  // it is noise, and there are enough of them in September to bury everything
  // else.
  //
  // A course reappears the instant it has either a posted grade or one marked
  // assignment, which is the only state in which it has anything to show.
  return courses
    .filter((c) => c.gradedCount > 0 || c.reportedGrade !== null)
    .sort((a, b) => {
      if ((a.gradedCount > 0) !== (b.gradedCount > 0)) {
        return a.gradedCount > 0 ? -1 : 1;
      }
      return a.course.localeCompare(b.course);
    });
}

/**
 * Marks that appeared since the student last looked.
 *
 * This is the whole retention idea in one function: checking grades is already
 * a daily habit, so the app that says "three new marks" before you think to
 * open the gradebook becomes the one you open.
 *
 * `since` being null means we have never recorded a visit — a first run, or a
 * new device. That returns nothing rather than everything: greeting someone
 * with "47 new grades" on their first open is noise, not news.
 */
export function gradedSince(rows: GradeRow[], since: Date | null): GradeRow[] {
  if (!since) return [];
  return rows
    .filter((r) => isGraded(r) && r.updatedAt.getTime() > since.getTime())
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}
