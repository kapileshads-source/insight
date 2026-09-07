"use client";

import { useState } from "react";

import {
  estimateGpa,
  hasUsableGrade,
  onlyEnrolled,
  presentGpa,
  levelOf,
  looksNonAcademic,
  type CourseLevel,
  type GpaCourse,
} from "@/lib/gpa";

/**
 * The GPA estimate.
 *
 * Pure: it is handed courses and grades and renders. No crypto and no fetching,
 * so it can be rendered against fixtures and looked at — which is how the rest
 * of this app's display bugs were found.
 *
 * **Everything here is written to keep one promise: this is an estimate.** The
 * district computes GPA once, after a semester closes. A figure derived from
 * in-progress marks is a projection, it will disagree with the transcript, and
 * the moment a student believes it is their real GPA the app has lied to them
 * about the number they care about most.
 *
 * So the word "estimate" is in the heading, not in a footnote — a caveat below
 * a large confident number is a caveat nobody reads.
 */

const LEVEL_LABEL: Record<CourseLevel, string> = {
  AP: "AP",
  ADVANCED: "Advanced",
  ON_LEVEL: "On-level",
};

export type GpaInput = {
  id: string;
  title: string;
  /// True for a course HAC named. HAC lists what a student is actually
  /// enrolled in; Canvas lists that plus whatever the district pushed into it.
  fromHac: boolean;
  /// The gradebook's own figure, already parsed to a number. Courses without
  /// one simply do not count yet.
  grade: number | null;
};

export function GpaCard({
  courses: all,
  past = null,
  priorCount = 0,
}: {
  courses: GpaInput[];
  /// The school's own cumulative figure, off the transcript. Authoritative.
  past?: { weighted: number | null; unweighted: number | null } | null;
  /// How many finished semester grades that figure covers.
  priorCount?: number;
}) {
  // HAC is the roll. A Canvas course with no counterpart there is a district
  // shell rather than a class — "Frisco ISD 1forAll Student Course 26-27" was
  // sitting at 100% and lifting a real GPA. When HAC has said nothing yet,
  // everything is kept rather than the estimate silently blanking.
  const courses = onlyEnrolled(all);

  // Excluded by default where the title says so, and adjustable by hand.
  // Deliberately a student's decision rather than a model's: a guess about
  // whether a course counts silently moves a GPA, and nobody can see it happen.
  const [excluded, setExcluded] = useState<Set<string>>(
    () => new Set(courses.filter((c) => looksNonAcademic(c.title)).map((c) => c.id)),
  );
  const [open, setOpen] = useState(false);

  // A course reading 0.00 has not been graded — it has not failed.
  //
  // Progress checks count for nothing and assessments are the whole grade, so
  // a class whose assessment category is still empty prints 0.00% in HAC while
  // holding a page of marked work. Kapilesh's own English class did exactly
  // that. Feeding it into a GPA turns "the term has not really started" into a
  // 3.000, which is both false and alarming — and it is the first number a
  // student would see.
  //
  // A genuine zero for a whole course is not a thing that happens to someone
  // attending school, so excluding is the safe direction. If one ever is real,
  // it appears again the moment a single assessment is marked.
  const withGrades = courses.filter((c) => hasUsableGrade(c.grade));
  const ungraded = courses.filter(
    (c) => c.grade !== null && !hasUsableGrade(c.grade),
  );

  const forEstimate: GpaCourse[] = withGrades.map((c) => ({
    id: c.id,
    title: c.title,
    level: levelOf(c.title),
    grades: [c.grade as number],
    excluded: excluded.has(c.id),
  }));

  const estimate = estimateGpa(forEstimate);

  function toggle(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Says it is waiting rather than rendering nothing.
  //
  // Returning null was defensible — an empty GPA is not a GPA — but in
  // practice it made the feature look absent rather than pending, and it was
  // asked about three times. One line costs nothing and answers the question
  // before it is asked.
  if (withGrades.length === 0) {
    if (courses.length === 0) return null;
    return (
      <section className="panel mt-6 px-7 py-6">
        <h2 className="h3 text-[17px]">GPA estimate</h2>
        <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-text-muted">
          Waiting on a posted grade. As soon as one of your classes has a
          percentage, this works out both GPAs from it — weighted on the 6.0
          scale and unweighted on the 4.0 one.
        </p>
        {ungraded.length > 0 && (
          <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-text-faint">
            {ungraded.length === 1
              ? `${ungraded[0].title} reads 0%, which means no assessments have been marked in it yet — so it isn't counted.`
              : `${ungraded.length} classes read 0%, which means no assessments have been marked in them yet — so they aren't counted.`}
          </p>
        )}
      </section>
    );
  }

  // The number a student is actually asking for: where they stand today, with
  // this term counted as it currently stands. Anchored to the school's own
  // cumulative figure rather than recomputed from the transcript — see
  // `presentGpa` for why re-adding it lands a quarter of a point out.
  const today = presentGpa(
    past ?? { weighted: null, unweighted: null },
    priorCount,
    forEstimate
      .filter((c) => !c.excluded)
      .map((c) => ({ level: c.level, grade: c.grades[0] })),
  );
  const anchored = past?.weighted != null;

  return (
    <section className="panel mt-6 px-7 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="h3 text-[17px]">
          {anchored ? "Your GPA right now" : "GPA estimate"}
        </h2>
        <span className="label text-text-faint">
          {anchored
            ? `${today.counted} semester grades, ${today.inProgress} still moving`
            : `${estimate.counted} ${estimate.counted === 1 ? "class" : "classes"}`}
        </span>
      </div>

      <div className="mt-5 flex flex-wrap gap-10">
        <Figure
          label="Weighted"
          value={anchored ? today.weighted : estimate.weighted}
        />
        <Figure
          label="Unweighted"
          value={anchored ? today.unweighted : estimate.unweighted}
        />
      </div>

      {/* The school's own figure, kept beside the estimate rather than
          replaced by it. Where the two disagree this one is right, and a
          student should be able to see both without going anywhere. */}
      {anchored && (
        <div className="mt-6 border-t border-line pt-5">
          <p className="label text-text-faint">
            Last confirmed by your school
          </p>
          <div className="mt-2 flex flex-wrap gap-10">
            <Figure label="Weighted" value={past?.weighted ?? null} small />
            <Figure label="Unweighted" value={past?.unweighted ?? null} small />
          </div>
        </div>
      )}

      {/* Stated plainly and near the numbers, not in small print underneath. */}
      <p className="mt-5 max-w-lg text-[14px] leading-relaxed text-text-faint">
        {anchored
          ? "Your finished semesters are exactly what the school calculated — that part isn't guesswork. This term is added at whatever your gradebook shows today, so the top number moves every time a mark is posted, and it isn't official until the semester closes."
          : "Worked out from the grades your gradebook is showing right now. Your school calculates the real one when the semester ends, and the two will not match exactly — this moves every time a mark is posted."}
      </p>

      {!anchored && (
        <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-text-faint">
          Read your transcript on the HAC page and this becomes your real
          cumulative GPA, brought up to today — not just this term.
        </p>
      )}

      {ungraded.length > 0 && (
        <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-text-faint">
          {ungraded.length === 1
            ? `${ungraded[0].title} isn't counted yet — it still reads 0%, which means no assessments have been marked in it.`
            : `${ungraded.length} classes aren't counted yet — they still read 0%, which means no assessments have been marked in them.`}
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-4 text-[14px] text-sky hover:underline"
      >
        {open ? "Hide the classes" : "Which classes count"}
      </button>

      {open && (
        <ul className="mt-4 border-t border-line">
          {withGrades.map((c) => {
            const out = excluded.has(c.id);
            return (
              <li
                key={c.id}
                className="flex items-center justify-between gap-4 border-b border-line py-2.5"
              >
                <label className="flex min-w-0 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={!out}
                    onChange={() => toggle(c.id)}
                    className="h-4 w-4 shrink-0 accent-sky"
                  />
                  <span
                    className={`truncate text-[15px] ${
                      out ? "text-text-faint line-through" : "text-text-muted"
                    }`}
                  >
                    {c.title}
                  </span>
                </label>
                <span className="shrink-0 text-[13px] text-text-faint">
                  {LEVEL_LABEL[levelOf(c.title)]} · {c.grade}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/// Null renders as a dash, never as 0.00. A student with no marks yet has *no*
/// GPA, and a zero would read as catastrophe rather than as absence.
function Figure({
  label,
  value,
  small = false,
}: {
  label: string;
  value: number | null;
  small?: boolean;
}) {
  return (
    <div>
      <div
        className={`figure text-text ${small ? "text-[1.4rem]" : "text-[2.2rem]"}`}
      >
        {value === null ? "—" : value.toFixed(3)}
      </div>
      <p className="mt-1 text-[13px] text-text-faint">{label}</p>
    </div>
  );
}
