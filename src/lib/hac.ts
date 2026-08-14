/**
 * Reading a HAC gradebook table, without trusting where the columns are.
 *
 * HAC is a PowerSchool product rendering an ASP.NET grid, and the one thing
 * every existing parser of it gets wrong is the same thing: they read cells by
 * position. `tds[4]` is the score until a campus turns on a column nobody
 * asked about, and then `tds[4]` is the category and every grade in the app is
 * a word. Nothing throws. Nothing looks broken. The numbers are just wrong.
 *
 * So this binds to the header labels, and when there is no header row it says
 * so rather than guessing quietly — `usedFallback` is part of the result and
 * the caller is expected to care.
 *
 * Split in two on purpose. Everything here is pure and takes strings, so the
 * decisions that can be subtly wrong are testable without a browser. Walking
 * the actual document is a dozen obvious lines and lives in `hac-dom.ts`,
 * which only runs where there is a DOM.
 */

/// One course's table, already lifted out of the page.
export type HacTable = {
  course: string;
  /// The overall course grade as HAC prints it, or null. Free text: it can be
  /// a number, a letter, or empty early in a term.
  grade: string | null;
  lastUpdated: string | null;
  /// Header cells, in order. Empty when the table has no header row.
  headers: string[];
  /// Data rows, each already reduced to trimmed cell text.
  rows: string[][];
  /// The assignment name per row, taken from the row's link rather than a
  /// cell — a row without a link is a totals row and is not an assignment.
  names: (string | null)[];
};

export type HacAssignment = {
  course: string;
  name: string;
  category: string | null;
  assignedOn: string | null;
  dueOn: string | null;
  /// Null when there is no numeric score — which includes an ungraded
  /// assignment, an excused one, and a missing one. Those are different
  /// things and `status` keeps them apart.
  score: number | null;
  pointsPossible: number | null;
  status: HacStatus;
};

/// What a non-numeric score cell meant.
export type HacStatus =
  | "GRADED"
  /// Posted but not marked yet. Not a zero, and treating it as one would
  /// invent a failure the student never had.
  | "UNGRADED"
  /// HAC prints "M" for missing.
  | "MISSING"
  /// "Z" — excused, exempt, or dropped depending on the campus. Either way it
  /// does not belong in an average.
  | "EXCUSED";

/// Header labels we have seen or expect, per field. Compared case- and
/// space-insensitively, so "Date Due" and "DateDue" both land.
const HEADERS: Record<string, string[]> = {
  dueOn: ["date due", "due date", "due"],
  assignedOn: ["date assigned", "assigned", "assign date"],
  category: ["category", "assignment type", "type"],
  score: ["score", "points earned", "grade"],
  pointsPossible: ["total points", "points possible", "possible", "max points"],
  name: ["assignment", "description", "assignment name"],
};

/// The positions the third-party parser used, kept only as a last resort and
/// only when there is no header row at all. Recorded when used, because a
/// silent guess here is the exact failure this file exists to avoid.
const FALLBACK_INDEX: Record<string, number> = {
  dueOn: 0,
  assignedOn: 1,
  name: 2,
  category: 3,
  score: 4,
  pointsPossible: 5,
};

const normalise = (s: string) => s.toLowerCase().replace(/[\s_]+/g, " ").trim();

/**
 * Which column holds a field, by label.
 *
 * Returns -1 when the header row exists but says nothing matching — which is
 * a real answer, not a failure: a table without a Category column should
 * produce assignments with no category, not assignments with a wrong one.
 */
export function columnIndex(headers: string[], field: string): number {
  const wanted = HEADERS[field];
  if (!wanted) return -1;

  const cleaned = headers.map(normalise);

  // Exact match first. "Score" must not be won by "Score Type" simply because
  // it appeared earlier in the row.
  for (const label of wanted) {
    const exact = cleaned.indexOf(label);
    if (exact !== -1) return exact;
  }

  for (const label of wanted) {
    const partial = cleaned.findIndex((h) => h.includes(label));
    if (partial !== -1) return partial;
  }

  return -1;
}

/**
 * A number out of a HAC score cell.
 *
 * The cell is free text and carries meaning beyond the number: `M` for
 * missing, `Z` for excused, blank for not yet marked. Parsing those as zero
 * would put failures a student never had into the average the insight engine
 * reads.
 */
export function parseScore(cell: string | undefined): {
  score: number | null;
  status: HacStatus;
} {
  const text = (cell ?? "").trim();
  if (text === "") return { score: null, status: "UNGRADED" };

  const upper = text.toUpperCase();
  if (upper === "M" || upper === "MSG" || upper === "MISSING") {
    return { score: null, status: "MISSING" };
  }
  if (upper === "Z" || upper === "X" || upper === "EXC" || upper === "EXCUSED") {
    return { score: null, status: "EXCUSED" };
  }

  // Strip anything that isn't part of a number: percent signs, stray letters,
  // and the occasional "85 / 100" where only the first half is the score.
  const match = text.match(/-?\d+(\.\d+)?/);
  if (!match) return { score: null, status: "UNGRADED" };

  const value = Number(match[0]);
  if (!Number.isFinite(value)) return { score: null, status: "UNGRADED" };

  return { score: value, status: "GRADED" };
}

/**
 * A date out of a HAC cell, as a plain `YYYY-MM-DD` key.
 *
 * Kept as a string rather than a `Date`: these are calendar dates with no time
 * and no timezone, and turning them into instants is how a due date lands on
 * the wrong day for anyone west of UTC.
 */
export function parseHacDate(cell: string | undefined): string | null {
  const text = (cell ?? "").replace(/\+/g, " ").trim();
  if (!text) return null;

  const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return null;

  const [, m, d, y] = match;
  const year = y.length === 2 ? 2000 + Number(y) : Number(y);
  const month = Number(m);
  const day = Number(d);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Turn one course's table into assignments.
 *
 * Rows without a name are dropped: in HAC those are the running totals at the
 * bottom of each category, and counting them would double every grade.
 */
export function readTable(table: HacTable): {
  assignments: HacAssignment[];
  usedFallback: boolean;
} {
  const hasHeaders = table.headers.length > 0;
  const usedFallback = !hasHeaders;

  const indexOf = (field: string): number => {
    if (hasHeaders) return columnIndex(table.headers, field);
    return FALLBACK_INDEX[field] ?? -1;
  };

  const cols = {
    dueOn: indexOf("dueOn"),
    assignedOn: indexOf("assignedOn"),
    category: indexOf("category"),
    score: indexOf("score"),
    pointsPossible: indexOf("pointsPossible"),
  };

  const cell = (row: string[], index: number): string | undefined =>
    index >= 0 ? row[index] : undefined;

  const assignments: HacAssignment[] = [];

  table.rows.forEach((row, i) => {
    const name = table.names[i];
    if (!name) return;

    const { score, status } = parseScore(cell(row, cols.score));
    const possible = parseScore(cell(row, cols.pointsPossible));

    assignments.push({
      course: table.course,
      name,
      category: cell(row, cols.category)?.trim() || null,
      assignedOn: parseHacDate(cell(row, cols.assignedOn)),
      dueOn: parseHacDate(cell(row, cols.dueOn)),
      score,
      pointsPossible: possible.score,
      status,
    });
  });

  return { assignments, usedFallback };
}

/// Everything on the page, and whether any of it had to be guessed at.
export function readPage(tables: HacTable[]): {
  assignments: HacAssignment[];
  usedFallback: boolean;
} {
  const all: HacAssignment[] = [];
  let usedFallback = false;

  for (const table of tables) {
    const read = readTable(table);
    all.push(...read.assignments);
    usedFallback ||= read.usedFallback;
  }

  return { assignments: all, usedFallback };
}
