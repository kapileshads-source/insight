"use client";

import { useState } from "react";
import Link from "next/link";

import { GpaCard } from "@/components/gpa-card";
import { useGradebook } from "@/components/gradebook-data";
import {
  hasSomethingToShow,
  percentOf,
  showsPercent,
  type CourseGrades,
  type GradeRow,
} from "@/lib/gradebook";

/**
 * Your grades, which the app collected for a year and never showed anyone.
 *
 * Everything here is decrypted in the browser, like every other record — see
 * `gradebook-data.tsx`, which owns the one decrypt this and the GPA headline
 * both read from. The server hands over ciphertext and an `updatedAt` column
 * it keeps for its own bookkeeping; the marks themselves are unreadable to it.
 */

export function GradesPanel() {
  const data = useGradebook();

  if (data.status === "locked" || data.status === "loading") return null;
  if (data.status === "failed") return <GradesUnreadable />;
  if (data.courses.length === 0) return null;

  return <GradesList courses={data.courses} newCount={data.fresh.length} />;
}

/**
 * The GPA, on its own, so the dashboard can put it at the top of the page.
 *
 * It used to render immediately under the grades list, which is where it was
 * built and not where it belongs: "where do I stand" is the question a student
 * opens the app to answer, and it was arriving eighth down a column of panels.
 *
 * Not gated on the grades list having anything in it. Early in a term a course
 * can carry a percentage while none of its assignments fall in the window the
 * list reads, and the two were once gated together — which is exactly how the
 * estimate looked missing rather than pending.
 */
export function GpaPanel() {
  const data = useGradebook();
  if (data.status !== "ready") return null;

  return (
    <GpaCard
      courses={data.gpa}
      past={data.past}
      priorCount={data.priorCount}
    />
  );
}

function GradesUnreadable() {
  return (
    <section className="panel p-6">
      <h2 className="h3 text-[17px]">Your grades</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
        These couldn&rsquo;t be read with your current password. Syncing{" "}
        <Link href="/canvas" className="text-accent underline underline-offset-2">
          your gradebook
        </Link>{" "}
        again will rewrite them.
      </p>
    </section>
  );
}

/**
 * The card, with no crypto and no fetching, so it can be rendered and looked at.
 *
 * Every panel in this app that was only ever checked by reading its code had a
 * bug in it. This one is separated for that reason.
 */
export function GradesList({
  courses,
  newCount,
}: {
  courses: CourseGrades[];
  newCount: number;
}) {
  const shown = courses.filter(hasSomethingToShow);
  const waiting = courses.filter((c) => !hasSomethingToShow(c));

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="h3 text-[17px]">Your grades</h2>
        {newCount > 0 && (
          <span className="label rounded-full bg-accent-soft px-3 py-1 text-accent">
            {newCount} new since you last looked
          </span>
        )}
      </div>

      {/* Cards for classes with something in them; one line for the rest.
      
          Both extremes were wrong on a real account. Drawing every class gave
          six identical "Nothing marked yet" cards that buried the marks under
          them. Dropping the empty ones made the whole section disappear in
          September, when every class can be empty — which looked like the
          feature had been deleted. Saying how many are waiting is the honest
          middle: nothing is hidden, and nothing is buried. */}
      <div className="mt-4 space-y-3">
        {shown.map((c) => (
          <CourseCard key={c.course} course={c} />
        ))}
      </div>

      {waiting.length > 0 && (
        <p className="mt-4 text-[14px] leading-relaxed text-text-faint">
          {shown.length === 0
            ? `None of your ${waiting.length} classes has posted a grade yet. They'll appear here as soon as one does.`
            : `${waiting.length} other ${waiting.length === 1 ? "class has" : "classes have"} nothing marked yet — ${waiting
                .map((c) => c.course)
                .join(", ")}.`}
        </p>
      )}

      <p className="mt-4 text-[13px] leading-relaxed text-text-faint">
        Percentages are your gradebook&rsquo;s own. Insight never works one out
        itself — your classes weight their categories, so anything it calculated
        would disagree with what your school shows.
      </p>
    </section>
  );
}

/// How many marks to show before asking. Enough to see the recent run of a
/// class without turning the dashboard into a full gradebook.
const PREVIEW = 4;

function CourseCard({ course }: { course: CourseGrades }) {
  const [all, setAll] = useState(false);
  const graded = course.rows.filter((r) => r.status === "GRADED");
  const shown = all ? graded : graded.slice(0, PREVIEW);

  return (
    <div className="panel px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[16px] text-text">{course.course}</h3>
        {course.reportedGrade ? (
          <span className="figure text-[1.6rem] text-text">
            {course.reportedGrade}
            <span className="text-[0.55em] align-[0.3em]">%</span>
          </span>
        ) : (
          <span className="text-[14px] text-text-faint">No grade posted yet</span>
        )}
      </div>

      {graded.length === 0 ? (
        // Said plainly. A class with twelve unmarked assignments and an empty
        // list underneath reads like a class you are failing.
        <p className="mt-3 text-[14px] text-text-faint">
          Nothing marked yet in this class.
        </p>
      ) : (
        <>
          <ul className="mt-4">
            {shown.map((r) => (
              <Row key={r.id} row={r} />
            ))}
          </ul>

          {!all && graded.length > PREVIEW && (
            <button
              type="button"
              onClick={() => setAll(true)}
              className="mt-3 text-[14px] text-accent hover:underline"
            >
              All {graded.length} marks
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Row({ row }: { row: GradeRow }) {
  const pct = showsPercent(row) ? percentOf(row) : null;

  return (
    <li className="flex items-baseline justify-between gap-4 border-t border-line py-2.5 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <div className="truncate text-[15px] text-text-muted">{row.name}</div>
        {row.category && (
          <div className="mt-0.5 truncate text-[13px] text-text-faint">
            {row.category}
          </div>
        )}
      </div>

      <div className="shrink-0 text-right">
        <span className="figure text-[15px] text-text">
          {row.score}
          {row.pointsPossible !== null && (
            <span className="text-text-faint">/{row.pointsPossible}</span>
          )}
        </span>
        {pct !== null && (
          <div className="text-[13px] text-text-faint">{pct}%</div>
        )}
      </div>
    </li>
  );
}
