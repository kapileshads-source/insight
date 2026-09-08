"use client";

import { useState } from "react";

import {
  estimateGpa,
  hasUsableGrade,
  onlyEnrolled,
  presentGpa,
  levelOf,
  looksNonAcademic,
  gpaIf,
  gpaDelta,
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
  /// Hypothetical grades, by course id. Empty is the normal state, and an
  /// empty map returns the real GPA exactly — see `gpaIf`.
  const [tryout, setTryout] = useState<Map<string, number>>(new Map());

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
      <section className="panel px-7 py-6">
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

  // What the GPA would be with the tried-out grades. Computed here rather than
  // asked of anything — this is the number a student decides things on.
  const withTryout = gpaIf(
    past ?? { weighted: null, unweighted: null },
    priorCount,
    forEstimate
      .filter((c) => !c.excluded)
      .map((c) => ({ id: c.id, level: c.level, grade: c.grades[0] })),
    tryout,
  );
  const trying = tryout.size > 0;
  const shift = gpaDelta(today.weighted, withTryout.weighted);

  function tryGrade(id: string, raw: string) {
    setTryout((prev) => {
      const next = new Map(prev);
      const value = Number(raw);
      // An empty box means "back to the real grade", not "a zero".
      if (raw.trim() === "" || !Number.isFinite(value)) next.delete(id);
      else next.set(id, Math.max(0, Math.min(120, value)));
      return next;
    });
  }

  /* Starlight, not another Midnight panel.
   *
   * The dashboard's problem was never that any one card was ugly — it was that
   * ten cards cut from the same dark cloth, at the same width, gave the eye
   * nothing to land on, so the screen read as one grey wall. The palette has
   * carried `--paper` and `--on-light` since the beginning for "the
   * inverted sections", and nothing inside the app had ever used them.
   *
   * Inverting *this* card and nothing else on the screen is the whole point:
   * there is exactly one question a student opens Insight to answer, and now
   * exactly one thing on the page is made of different material. */
  return (
    <section className="overflow-hidden rounded-xl bg-paper text-on-light">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-6 px-7 py-7 sm:px-9 sm:py-8">
        <div>
          <h2 className="label text-on-light-muted">
            {anchored ? "Your GPA right now" : "GPA estimate"}
          </h2>

          <div className="mt-4 flex flex-wrap items-end gap-x-9 gap-y-4">
            <Figure
              label="Weighted"
              value={anchored ? today.weighted : estimate.weighted}
              hero
            />
            <Figure
              label="Unweighted"
              value={anchored ? today.unweighted : estimate.unweighted}
            />
          </div>

          <p className="mt-4 text-[13px] text-on-light-muted">
            {anchored
              ? `${today.counted} semester grades · ${today.inProgress} still moving`
              : `${estimate.counted} ${estimate.counted === 1 ? "class" : "classes"} counted`}
          </p>
        </div>

        {/* The school's own figure, kept beside the estimate rather than
            replaced by it. Where the two disagree this one is right, and a
            student should be able to see both without going anywhere. */}
        {anchored && (
          <div className="border-on-light/15 sm:border-l sm:pl-8">
            <p className="label text-on-light-muted">
              Last confirmed by your school
            </p>
            <div className="mt-3 flex gap-8">
              <Figure label="Weighted" value={past?.weighted ?? null} small />
              <Figure
                label="Unweighted"
                value={past?.unweighted ?? null}
                small
              />
            </div>
          </div>
        )}
      </div>

      {/* The caveats, on a slightly darker shelf so the numbers above keep the
          light. Stated plainly and near the figures, not in small print. */}
      <div className="border-on-light/10 bg-paper-dim/60 border-t px-7 py-5 sm:px-9">
        <p className="max-w-2xl text-[14px] leading-relaxed text-on-light-muted">
          {anchored
            ? "Your finished semesters are exactly what the school calculated — that part isn't guesswork. This term is added at whatever your gradebook shows today, so the top number moves every time a mark is posted, and it isn't official until the semester closes."
            : "Worked out from the grades your gradebook is showing right now. Your school calculates the real one when the semester ends, and the two will not match exactly — this moves every time a mark is posted."}
        </p>

        {!anchored && (
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-on-light-muted">
            Read your transcript on the HAC page and this becomes your real
            cumulative GPA, brought up to today — not just this term.
          </p>
        )}

        {ungraded.length > 0 && (
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-on-light-muted">
            {ungraded.length === 1
              ? `${ungraded[0].title} isn't counted yet — it still reads 0%, which means no assessments have been marked in it.`
              : `${ungraded.length} classes aren't counted yet — they still read 0%, which means no assessments have been marked in them.`}
          </p>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-4 text-[14px] font-medium text-on-light underline underline-offset-4"
        >
          {open ? "Hide the classes" : "Which classes count, and try a grade"}
        </button>

        {open && (
          <ul className="border-on-light/15 mt-4 border-t">
            {withGrades.map((c) => {
              const out = excluded.has(c.id);
              return (
                <li
                  key={c.id}
                  className="border-on-light/10 flex items-center justify-between gap-4 border-b py-2.5"
                >
                  <label className="flex min-w-0 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={!out}
                      onChange={() => toggle(c.id)}
                      className="tick tick-on-light"
                    />
                    <span
                      className={`truncate text-[15px] ${
                        out
                          ? "text-on-light-muted line-through"
                          : "text-on-light"
                      }`}
                    >
                      {c.title}
                    </span>
                  </label>
                  <span className="flex shrink-0 items-center gap-3 text-[13px] text-on-light-muted">
                    {LEVEL_LABEL[levelOf(c.title)]}
                    {/* The real grade, struck through once a hypothetical is
                        standing in for it, so it is never unclear which of the
                        two numbers on this row is true. */}
                    <span
                      className={
                        tryout.has(c.id) ? "line-through opacity-60" : ""
                      }
                    >
                      {c.grade}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={tryout.get(c.id) ?? ""}
                      onChange={(e) => tryGrade(c.id, e.target.value)}
                      disabled={out}
                      aria-label={`Try a different grade for ${c.title}`}
                      placeholder="try"
                      className="border-on-light/25 w-16 rounded border bg-transparent px-2 py-1 text-[13px] text-on-light placeholder:text-on-light-muted disabled:opacity-40"
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {/* The answer, right under the boxes that produced it. Deterministic —
            the same `presentGpa` the big number at the top uses, with the
            typed grades swapped in. Nothing is asked of a model, because this
            is the figure a student decides things on. */}
        {open && trying && (
          <div className="border-on-light/15 mt-5 flex flex-wrap items-end gap-x-8 gap-y-3 border-t pt-5">
            <div>
              <p className="label text-on-light-muted">With those grades</p>
              <p className="figure mt-1.5 text-[1.8rem] text-on-light">
                {withTryout.weighted === null
                  ? "—"
                  : withTryout.weighted.toFixed(3)}
              </p>
            </div>
            {shift !== null && (
              <p className="figure pb-1 text-[1.1rem] text-on-light">
                {shift > 0 ? "+" : shift < 0 ? "\u2212" : ""}
                {Math.abs(shift).toFixed(3)}
                <span className="ml-2 font-sans text-[13px] text-on-light-muted">
                  {shift === 0 ? "no change" : "vs. now"}
                </span>
              </p>
            )}
            <button
              type="button"
              onClick={() => setTryout(new Map())}
              className="ml-auto pb-1 text-[13px] text-on-light underline underline-offset-4"
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/// Null renders as a dash, never as 0.00. A student with no marks yet has *no*
/// GPA, and a zero would read as catastrophe rather than as absence.
function Figure({
  label,
  value,
  small = false,
  hero = false,
}: {
  label: string;
  value: number | null;
  small?: boolean;
  hero?: boolean;
}) {
  const size = hero
    ? "text-[3.4rem] sm:text-[4rem]"
    : small
      ? "text-[1.35rem]"
      : "text-[2rem]";

  return (
    <div>
      <div className={`figure text-on-light ${size}`}>
        {value === null ? "—" : value.toFixed(3)}
      </div>
      <p className="mt-1.5 text-[13px] text-on-light-muted">{label}</p>
    </div>
  );
}
