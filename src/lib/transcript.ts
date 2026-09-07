/**
 * The transcript: every semester already finished, and the school's own GPA.
 *
 * **This page is the only authoritative GPA in the system.** Everything else
 * Insight shows is an estimate worked out from marks that are still moving.
 * The district computes the real figure once a semester closes and prints it
 * here, so where the two disagree, this one is right and ours is a projection.
 *
 * It also carries the finished semester grades themselves, which is what makes
 * a GPA estimate worth anything in September: without them the estimate is
 * built from three weeks of a term, and one bad quiz swings it.
 *
 * Structure, confirmed against a working implementation of the same page:
 *
 *   plnMain_rpTranscriptGroup_lblYearValue_{i}       "2024-2025"
 *   plnMain_rpTranscriptGroup_lblGradeValue_{i}      "09"
 *   plnMain_rpTranscriptGroup_lblBuildingValue_{i}   school name
 *   plnMain_rpTranscriptGroup_dgCourses_{i}          that year's course table
 *     tr.sg-asp-table-data-row
 *       td  0 code, 1 description, 2 sem1, 3 sem2, 4 final, 5 credit
 *
 *   plnMain_rpTranscriptGroup_tblCumGPAInfo
 *     span id ~ lblGPADescr\d+   "Weighted GPA" / "4.0 College GPA"
 *     span id ~ lblGPACum\d+     the value
 *     span id ~ lblGPARank\d+    class rank
 *
 * The index has no count anywhere — loop until the element is missing.
 *
 * **On the cell indices.** They are positional, which is the failure mode this
 * codebase works hardest to avoid: an inserted column shifts every field with
 * no error and serves wrong data confidently. There is no header row here to
 * bind to, so instead every row is validated — a course code that looks like a
 * course code, grades that look like grades — and anything that doesn't fit is
 * dropped rather than guessed at. A missing course is visible; a wrong grade is
 * not.
 */

export type TranscriptCourse = {
  code: string;
  description: string;
  /// Semester finals. Null where the semester has not happened or the row
  /// carries a letter — `P`, `W` — which is a real outcome and not a number.
  sem1: number | null;
  sem2: number | null;
  credit: number | null;
};

export type TranscriptYear = {
  year: string;
  gradeLevel: string;
  building: string;
  courses: TranscriptCourse[];
};

export type TranscriptGpa = {
  label: string;
  value: number;
  rank: string | null;
};

export type Transcript = {
  years: TranscriptYear[];
  /// As the district printed it. Never recomputed.
  gpa: TranscriptGpa[];
};

/**
 * A semester grade, or null.
 *
 * `P`, `W`, `CNS` and a blank are all real states and none of them is a
 * number. Turning any of them into a zero would invent a failure — the same
 * mistake `parseScore` exists to prevent on the assignments page.
 */
export function semesterGrade(cell: string | undefined): number | null {
  const text = (cell ?? "").trim();
  if (!text) return null;
  if (!/^\d{1,3}(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 && value <= 150 ? value : null;
}

/// A course code, as the transcript writes them: `03100500 - 1`, `A3580300 - 1`,
/// `waivertech - 1`. Loose on the code itself and strict on the shape, because
/// the shape is what distinguishes a course row from a total row.
export function looksLikeCourseRow(cells: string[]): boolean {
  if (cells.length < 6) return false;
  const code = cells[0]?.trim() ?? "";
  const description = cells[1]?.trim() ?? "";
  if (code.length === 0 || description.length === 0) return false;
  // Totals rows carry a label in the first cell and no course code shape.
  return /-\s*\d+\s*$/.test(code);
}

/// Credit hours. `1.0000`, `0.0000`. A zero-credit row is a waiver or an
/// audit, and it is exactly what should not count toward a GPA.
export function creditOf(cell: string | undefined): number | null {
  const text = (cell ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * Whether a transcript course should count toward a GPA.
 *
 * Zero credit is the district's own answer to "is this a real course", printed
 * on the page — better than any inference from a title. It is what marks the
 * tech waivers that would otherwise be averaged in.
 */
export function countsTowardGpa(course: TranscriptCourse): boolean {
  if (course.credit !== null && course.credit <= 0) return false;
  return course.sem1 !== null || course.sem2 !== null;
}

/// Every semester grade on the transcript, as a flat list, for the GPA.
export function semesterGrades(
  transcript: Transcript,
): { code: string; description: string; grade: number }[] {
  const out: { code: string; description: string; grade: number }[] = [];
  for (const year of transcript.years) {
    for (const course of year.courses) {
      if (!countsTowardGpa(course)) continue;
      for (const grade of [course.sem1, course.sem2]) {
        if (grade !== null) {
          out.push({ code: course.code, description: course.description, grade });
        }
      }
    }
  }
  return out;
}

/**
 * Turn the raw page structures into a transcript.
 *
 * Every row is validated rather than trusted. The course table has no header
 * row to bind to, so the cell indices are positional — the failure mode this
 * codebase works hardest to avoid, because an inserted column shifts every
 * field with no error. A row that does not look like a course row is dropped
 * instead of being read at the wrong offsets: a missing course is visible on
 * screen, a wrong grade is not.
 */
export function buildTranscript(raw: {
  years: {
    year: string;
    gradeLevel: string;
    building: string;
    rows: string[][];
  }[];
  gpa: { label: string; value: string; rank: string | null }[];
}): Transcript {
  const years: TranscriptYear[] = raw.years.map((y) => ({
    year: y.year,
    gradeLevel: y.gradeLevel,
    building: y.building,
    courses: y.rows.filter(looksLikeCourseRow).map((cells) => ({
      code: cells[0].trim(),
      description: cells[1].trim(),
      sem1: semesterGrade(cells[2]),
      sem2: semesterGrade(cells[3]),
      credit: creditOf(cells[5]),
    })),
  }));

  const gpa: TranscriptGpa[] = [];
  for (const row of raw.gpa) {
    const value = Number(row.value.trim());
    if (!Number.isFinite(value)) continue;
    gpa.push({ label: row.label.trim(), value, rank: row.rank });
  }

  return { years, gpa };
}

/**
 * The district's own weighted and unweighted figures, picked out by keyword.
 *
 * Matched loosely because the labels are "Weighted GPA" and "4.0 College GPA"
 * today and neither is promised. "Unweighted" has to be excluded from the
 * weighted match explicitly, or a label containing both words lands in the
 * wrong slot.
 */
export function officialGpa(transcript: Transcript): {
  weighted: TranscriptGpa | null;
  unweighted: TranscriptGpa | null;
} {
  const find = (test: (label: string) => boolean) =>
    transcript.gpa.find((g) => test(g.label.toLowerCase())) ?? null;

  return {
    weighted: find((l) => l.includes("weighted") && !l.includes("unweighted")),
    unweighted: find((l) => l.includes("unweighted") || l.includes("4.0")),
  };
}
