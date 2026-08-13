/**
 * Turning a pile of Canvas rows into the list a student actually reads.
 *
 * Canvas shows everything a teacher ever posted, in course order, forever.
 * That is a filing cabinet, not an answer to "what do I need to do tonight" —
 * which is the only question worth asking of this data, and the reason these
 * rows have been syncing for weeks with nowhere to appear.
 *
 * Three decisions shape everything here:
 *
 *  - **Missing work comes first, always.** It is the only category where the
 *    student can still change the outcome and where nobody else will tell
 *    them. A "missing" assignment buried under next week's reading is the
 *    single most expensive thing this app could hide.
 *  - **Graded work is not a task.** It leaves the list entirely and becomes a
 *    score, which the insight engine already draws on. Keeping it would double
 *    the list and halve the chance anyone reads it.
 *  - **No due date is not "due never".** Canvas assignments frequently have no
 *    date at all. They sit in their own group rather than being sorted to one
 *    end, where they'd either dominate the top or vanish off the bottom.
 *
 * Everything here is pure and runs in the browser, because assignment names
 * are encrypted and the server cannot read them.
 */

export type SubmissionState =
  | "UNSUBMITTED"
  | "SUBMITTED"
  | "LATE"
  | "MISSING"
  | "GRADED";

export type AssignmentRow = {
  id: string;
  name: string;
  course: string;
  dueAt: Date | null;
  pointsPossible: number | null;
  score: number | null;
  state: SubmissionState;
};

export type Bucket =
  | "MISSING"
  | "OVERDUE"
  | "TODAY"
  | "TOMORROW"
  | "THIS_WEEK"
  | "LATER"
  | "UNDATED";

export const BUCKET_LABELS: Record<Bucket, string> = {
  MISSING: "Missing",
  OVERDUE: "Past due",
  TODAY: "Due today",
  TOMORROW: "Due tomorrow",
  THIS_WEEK: "This week",
  LATER: "Later",
  UNDATED: "No due date",
};

/// The order they appear. Not alphabetical, not Canvas's: urgency, then time.
export const BUCKET_ORDER: Bucket[] = [
  "MISSING",
  "OVERDUE",
  "TODAY",
  "TOMORROW",
  "THIS_WEEK",
  "LATER",
  "UNDATED",
];

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/**
 * Which group a single assignment belongs in.
 *
 * `MISSING` outranks every date, because Canvas only marks work missing once
 * it is already too late for the due date to be the useful fact.
 */
export function bucketFor(row: AssignmentRow, now: Date): Bucket | null {
  // Graded work is a score, not a task. It leaves the list.
  if (row.state === "GRADED") return null;
  if (row.state === "MISSING") return "MISSING";
  // Submitted work is done, whatever its date says.
  if (row.state === "SUBMITTED" || row.state === "LATE") return null;

  if (!row.dueAt) return "UNDATED";

  const today = startOfDay(now);
  const due = startOfDay(row.dueAt);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (days < 0) return "OVERDUE";
  if (days === 0) return "TODAY";
  if (days === 1) return "TOMORROW";
  if (days <= 7) return "THIS_WEEK";
  return "LATER";
}

export type AssignmentGroup = {
  bucket: Bucket;
  label: string;
  rows: AssignmentRow[];
};

/**
 * Group and order the whole list.
 *
 * Within a group: by date, then by points, so a 100-point test outranks a
 * 5-point warm-up due the same day. Undated work sorts by points alone —
 * there is nothing else to go on, and the big thing is the one worth seeing.
 */
export function groupAssignments(
  rows: AssignmentRow[],
  now: Date = new Date(),
): AssignmentGroup[] {
  const groups = new Map<Bucket, AssignmentRow[]>();

  for (const row of rows) {
    const bucket = bucketFor(row, now);
    if (!bucket) continue;
    const existing = groups.get(bucket);
    if (existing) existing.push(row);
    else groups.set(bucket, [row]);
  }

  return BUCKET_ORDER.filter((bucket) => groups.has(bucket)).map((bucket) => ({
    bucket,
    label: BUCKET_LABELS[bucket],
    rows: (groups.get(bucket) ?? []).sort((a, b) => {
      const at = a.dueAt?.getTime() ?? 0;
      const bt = b.dueAt?.getTime() ?? 0;
      if (at !== bt) return at - bt;
      return (b.pointsPossible ?? 0) - (a.pointsPossible ?? 0);
    }),
  }));
}

/**
 * The one-line summary above the list.
 *
 * Deliberately counts only what is actionable. "42 assignments" is true of
 * every student in the district and tells nobody anything.
 */
export function assignmentSummary(
  groups: AssignmentGroup[],
): { missing: number; dueSoon: number; total: number } {
  const count = (bucket: Bucket) =>
    groups.find((g) => g.bucket === bucket)?.rows.length ?? 0;

  return {
    missing: count("MISSING"),
    dueSoon: count("OVERDUE") + count("TODAY") + count("TOMORROW"),
    total: groups.reduce((n, g) => n + g.rows.length, 0),
  };
}
