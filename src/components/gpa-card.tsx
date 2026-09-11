"use client";

import { useState } from "react";
import Link from "next/link";

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
 * so it can be rendered against fixtures and looked at, which is how the rest
 * of this app's display bugs were found.
 *
 * **Everything here is written to keep one promise: this is an estimate.** The
 * district computes GPA once, after a semester closes. A figure derived from
 * in-progress marks is a projection, it will disagree with the transcript, and
 * the moment a student believes it is their real GPA the app has lied to them
 * about the number they care about most.
 *
 * So the word "estimate" is in the heading, not in a footnote, a caveat below
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
  // shell rather than a class, "Frisco ISD 1forAll Student Course 26-27" was
  // sitting at 100% and lifting a real GPA. When HAC has said nothing yet,
  // everything is kept rather than the estimate silently blanking.
  const courses = onlyEnrolled(all);

  // Excluded by default where the title says so, and adjustable by hand.
  // Deliberately a student's decision rather than a model's: a guess about
  // whether a course counts silently moves a GPA, and nobody can see it happen.
  // Non-academic classes sit out by default. The card only shows a total, so
  // this is fixed here; changing which classes count is done on /gpa, where
  // the change is visible next to the class it applies to.
  const excluded = new Set(
    courses.filter((c) => looksNonAcademic(c.title)).map((c) => c.id),
  );

  // A course reading 0.00 has not been graded, it has not failed.
  //
  // Progress checks count for nothing and assessments are the whole grade, so
  // a class whose assessment category is still empty prints 0.00% in HAC while
  // holding a page of marked work. Kapilesh's own English class did exactly
  // that. Feeding it into a GPA turns "the term has not really started" into a
  // 3.000, which is both false and alarming, and it is the first number a
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

  // Says it is waiting rather than rendering nothing.
  //
  // Returning null was defensible, an empty GPA is not a GPA, but in
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
          percentage, this works out both GPAs from it, weighted on the 6.0
          scale and unweighted on the 4.0 one.
        </p>
        {ungraded.length > 0 && (
          <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-text-faint">
            {ungraded.length === 1
              ? `${ungraded[0].title} reads 0%, which means no assessments have been marked in it yet, so it isn't counted.`
              : `${ungraded.length} classes read 0%, which means no assessments have been marked in them yet, so they aren't counted.`}
          </p>
        )}
      </section>
    );
  }

  // The number a student is actually asking for: where they stand today, with
  // this term counted as it currently stands. Anchored to the school's own
  // cumulative figure rather than recomputed from the transcript, see
  // `presentGpa` for why re-adding it lands a quarter of a point out.
  const today = presentGpa(
    past ?? { weighted: null, unweighted: null },
    priorCount,
    forEstimate
      .filter((c) => !c.excluded)
      .map((c) => ({ level: c.level, grade: c.grades[0] })),
  );
  const anchored = past?.weighted != null;

  /* Starlight, not another Midnight panel.
   *
   * The dashboard's problem was never that any one card was ugly, it was that
   * ten cards cut from the same dark cloth, at the same width, gave the eye
   * nothing to land on, so the screen read as one grey wall. The palette has
   * carried `--paper` and `--on-light` since the beginning for "the
   * inverted sections", and nothing inside the app had ever used them.
   *
   * Inverting *this* card and nothing else on the screen is the whole point:
   * there is exactly one question a student opens Insight to answer, and now
   * exactly one thing on the page is made of different material. */
  return (
    <section className="enter overflow-hidden rounded-xl bg-paper text-on-light">
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

      {/* One line out, and the rest on its own page.

          This card used to carry everything: the caveat paragraph, the list of
          which classes count, the what-if boxes, and a note about any class
          reading 0%. All of it is worth saying and none of it is worth saying
          on the screen a student opens twenty times a week. It made the first
          thing on the dashboard the densest thing on it.

          So the card is the answer and the page is the working. */}
      <div className="border-on-light/10 bg-paper-dim/60 flex flex-wrap items-center gap-x-5 gap-y-2 border-t px-7 py-4 sm:px-9">
        <Link
          href="/gpa"
          className="btn-secondary-on-light px-5 py-2.5 text-[14px] font-medium"
        >
          Try a different grade
        </Link>
        <p className="text-[14px] text-on-light-muted">
          See what a class ending differently would do, and which ones count.
        </p>
      </div>
    </section>
  );
}

/**
 * The working behind the number: what it is and is not, which classes are in
 * it, and what happens if one of them ends differently.
 *
 * Lives on `/gpa` rather than on the dashboard. Everything here is true and
 * worth saying once; none of it is worth reading daily, and putting it under
 * the headline figure made the top of the dashboard its heaviest region.
 */
export function GpaDetail({
  courses: all,
  past = null,
  priorCount = 0,
}: {
  courses: GpaInput[];
  past?: { weighted: number | null; unweighted: number | null } | null;
  priorCount?: number;
}) {
  const courses = onlyEnrolled(all);
  const [excluded, setExcluded] = useState<Set<string>>(
    () => new Set(courses.filter((c) => looksNonAcademic(c.title)).map((c) => c.id)),
  );
  const [tryout, setTryout] = useState<Map<string, number>>(new Map());

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

  const anchored = past?.weighted != null;
  const live = forEstimate
    .filter((c) => !c.excluded)
    .map((c) => ({ id: c.id, level: c.level, grade: c.grades[0] }));

  const today = presentGpa(
    past ?? { weighted: null, unweighted: null },
    priorCount,
    live.map((c) => ({ level: c.level, grade: c.grade })),
  );
  const withTryout = gpaIf(
    past ?? { weighted: null, unweighted: null },
    priorCount,
    live,
    tryout,
  );
  const trying = tryout.size > 0;
  const shift = gpaDelta(today.weighted, withTryout.weighted);

  function toggle(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

  if (withGrades.length === 0) {
    return (
      <p className="max-w-xl text-[16px] leading-relaxed text-text-muted">
        No class has a posted percentage yet, so there is nothing to work from.
        This fills in as soon as one does.
      </p>
    );
  }

  return (
    <div>
      {/* The result, above the inputs rather than below them. It is what the
          page is for, and it should not move down the screen as classes are
          added. */}
      <section className="panel flex flex-wrap items-end gap-x-10 gap-y-5 px-7 py-6">
        <div>
          <p className="label text-text-faint">
            {trying ? "With those grades" : "Your GPA right now"}
          </p>
          <p
            // Keyed on the value so React remounts it when the number changes,
            // which is what re-fires the animation. Without the key it renders
            // in place and never moves.
            key={String(trying ? withTryout.weighted : today.weighted)}
            className="figure figure-live mt-2 text-[2.6rem] text-text"
          >
            {(trying ? withTryout.weighted : today.weighted)?.toFixed(3) ?? ", "}
          </p>
          <p className="mt-1 text-[13px] text-text-faint">Weighted</p>
        </div>
        <div>
          <p className="figure text-[1.6rem] text-text">
            {(trying ? withTryout.unweighted : today.unweighted)?.toFixed(3) ??
              ", "}
          </p>
          <p className="mt-1 text-[13px] text-text-faint">Unweighted</p>
        </div>
        {trying && shift !== null && (
          <p className="figure pb-1 text-[1.3rem] text-text">
            {shift > 0 ? "+" : shift < 0 ? "\u2212" : ""}
            {Math.abs(shift).toFixed(3)}
            <span className="ml-2 font-sans text-[13px] text-text-faint">
              {shift === 0 ? "no change" : "vs. now"}
            </span>
          </p>
        )}
        {trying && (
          <button
            type="button"
            onClick={() => setTryout(new Map())}
            className="btn-secondary ml-auto px-5 py-2.5 text-[14px]"
          >
            Clear
          </button>
        )}
      </section>

      <section className="mt-8">
        <h2 className="h3 text-[17px]">Your classes</h2>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-text-muted">
          Type a grade in the box to see where you would land. Untick a class to
          leave it out of the calculation entirely.
        </p>

        <ul className="mt-5 border-t border-line">
          {withGrades.map((c) => {
            const out = excluded.has(c.id);
            return (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line py-3"
              >
                <label className="flex min-w-0 flex-1 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={!out}
                    onChange={() => toggle(c.id)}
                    className="tick"
                  />
                  <span
                    className={`truncate text-[15px] ${
                      out ? "text-text-faint line-through" : "text-text"
                    }`}
                  >
                    {c.title}
                  </span>
                </label>
                <span className="flex shrink-0 items-center gap-4 text-[13px] text-text-faint">
                  {LEVEL_LABEL[levelOf(c.title)]}
                  <span
                    className={tryout.has(c.id) ? "line-through opacity-60" : ""}
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
                    className="w-20 rounded border border-line bg-bg px-2.5 py-1.5 text-[14px] text-text disabled:opacity-40"
                  />
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-10 max-w-2xl space-y-3 text-[15px] leading-relaxed text-text-muted">
        <h2 className="h3 text-[17px] text-text">How this is worked out</h2>
        <p>
          {anchored
            ? "Your finished semesters are exactly what the school calculated, that part isn't guesswork. This term is added at whatever your gradebook shows today, so the number moves every time a mark is posted, and it isn't official until the semester closes."
            : "Worked out from the grades your gradebook is showing right now. Your school calculates the real one when the semester ends, and the two will not match exactly."}
        </p>
        {!anchored && (
          <p>
            Read your transcript on the HAC page and this becomes your real
            cumulative GPA, brought up to today, not just this term.
          </p>
        )}
        <p className="text-text-faint">
          Frisco weights per percentage point: an on-level class tops out at
          5.0, Advanced at 5.5 and AP at 6.0, losing 0.1 for every point below
          100. The unweighted figure uses letter grades on the 4.0 scale, which
          is a different calculation entirely, that is why the two move at
          different speeds.
        </p>
        {ungraded.length > 0 && (
          <p className="text-text-faint">
            {ungraded.length === 1
              ? `${ungraded[0].title} isn't counted yet, it still reads 0%, which means no assessments have been marked in it.`
              : `${ungraded.length} classes aren't counted yet, they still read 0%, which means no assessments have been marked in them.`}
          </p>
        )}
      </section>
    </div>
  );
}

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
        {value === null ? ", " : value.toFixed(3)}
      </div>
      <p className="mt-1.5 text-[13px] text-on-light-muted">{label}</p>
    </div>
  );
}
