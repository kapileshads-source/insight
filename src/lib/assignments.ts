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
  /// Ticked off by the student, and therefore not something to chase. Kept out
  /// of the buckets entirely rather than shown struck through: "what's due" is
  /// a list of what is left, and a finished item on it is noise.
  completedAt?: Date | null;
  id: string;
  name: string;
  course: string;
  dueAt: Date | null;
  pointsPossible: number | null;
  score: number | null;
  state: SubmissionState;
  /// When the work appeared, as YYYY-MM-DD. The only ordering signal either
  /// gradebook gives for something with no due date.
  assignedOn?: string | null;
  /// Whether it sits in the Canvas module the class is currently on. A better
  /// answer than any date for "is this undated thing current?", because it is
  /// the teacher's own view of where the class is.
  inCurrentModule?: boolean;
  /// The name of that module, shown as the reason. Every guess this card makes
  /// carries its evidence, so a student can disagree with it.
  moduleName?: string | null;
};

/**
 * A HAC score cell's meaning, as a submission state.
 *
 * The two gradebooks describe the same facts with different words, and the
 * card reads only one vocabulary. Without this, HAC rows arrived with no
 * `state` at all, defaulted to unsubmitted, and a test a student sat weeks ago
 * sat in "Past due" telling them to go and do it.
 *
 * `EXCUSED` maps to graded because the question this answers is "is there
 * anything left to do?", and for excused work there isn't. It is not a score
 * either — `outcomes.ts` never sees it, because HAC gives no number.
 */
export function submissionStateFromHac(status: string): SubmissionState {
  switch (status) {
    case "GRADED":
      return "GRADED";
    case "MISSING":
      return "MISSING";
    case "EXCUSED":
      return "GRADED";
    default:
      return "UNSUBMITTED";
  }
}

export type Bucket =
  | "MISSING"
  | "OVERDUE"
  | "TODAY"
  | "TOMORROW"
  | "THIS_WEEK"
  | "RECENT"
  | "LATER"
  /// Kept as a return value so the caller can drop these rows. Never shown:
  /// see `groupAssignments`.
  | "UNDATED";

export const BUCKET_LABELS: Record<Bucket, string> = {
  MISSING: "Missing",
  OVERDUE: "Past due",
  TODAY: "Due today",
  TOMORROW: "Due tomorrow",
  THIS_WEEK: "This week",
  RECENT: "Probably this week",
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
  "RECENT",
  "LATER",
];

/// How recently something must have been handed out to count as current.
const RECENT_DAYS = 7;

/// Whole days between a YYYY-MM-DD and today. Negative when it is in the
/// future, which an unlock date often is.
function daysSince(assignedOn: string, now: Date): number {
  const [y, m, d] = assignedOn.split("-").map(Number);
  if (!y || !m || !d) return Number.POSITIVE_INFINITY;
  const then = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return (today - then) / 86_400_000;
}

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

  if (!row.dueAt) {
    // No due date is not "due never", and it is not a due date either. Work
    // handed out in the last week is probably this week's — said as a guess,
    // in its own group, with the assigned date shown so a student can judge
    // it. Deliberately *not* written onto the row as a due date: a fabricated
    // one looks exactly like a real one, and the row we'd hide by acting on it
    // could be the one that mattered.
    // The module the class is on is the teacher's own view of what is current,
    // which beats any inference from a date.
    if (row.inCurrentModule) return "RECENT";
    if (row.assignedOn && daysSince(row.assignedOn, now) <= RECENT_DAYS) {
      return "RECENT";
    }
    return "UNDATED";
  }

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
    // A finished item is not something due. Dropped rather than struck
    // through: "what's due" is a list of what is left, and last week's ticked
    // work sitting in it is exactly the clutter that made the undated pile
    // useless.
    if (row.completedAt) continue;
    const bucket = bucketFor(row, now);
    if (!bucket) continue;
    const existing = groups.get(bucket);
    if (existing) existing.push(row);
    else groups.set(bucket, [row]);
  }

  // Driven by BUCKET_ORDER, which no longer contains UNDATED — so a row with
  // no due date and nothing to place it is collected above and then never
  // rendered. Dropped rather than shown in a "No due date" pile: that group
  // filled up with the term's leftovers and pushed the dates a student
  // actually needed off the bottom of the card. Anything genuinely current
  // still appears, because RECENT catches it from the class's module or from
  // having been handed out this week.
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
