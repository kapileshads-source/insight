"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { fetchGradebook } from "@/app/actions/grades";
import { useCrypto } from "@/components/crypto-provider";
import { GpaCard, type GpaInput } from "@/components/gpa-card";
import {
  buildGradebook,
  gradedSince,
  percentOf,
  showsPercent,
  type CourseGrades,
  type GradeRow,
  type GradeStatus,
} from "@/lib/gradebook";

/**
 * Your grades, which the app collected for a year and never showed anyone.
 *
 * Everything here is decrypted in the browser, like every other record. The
 * server hands over ciphertext and a `updatedAt` column it keeps for its own
 * bookkeeping; the marks themselves are unreadable to it.
 *
 * The "new since you last looked" mark is stored in `localStorage` rather than
 * on the server, deliberately. It is a per-device convenience — checking on
 * your laptop should not clear the badge on your phone — and it is also one
 * more thing the server has no business knowing. It is wrapped in try/catch
 * because a private window throws on access rather than returning null.
 */

const SEEN_KEY = "insight.grades.lastSeen";

type Payload = {
  name?: string;
  course?: string;
  category?: string | null;
  score?: number | null;
  pointsPossible?: number | null;
  status?: GradeStatus;
};

function readLastSeen(): Date | null {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    if (!raw) return null;
    const at = new Date(raw);
    return Number.isNaN(at.getTime()) ? null : at;
  } catch {
    return null;
  }
}

function writeLastSeen(at: Date) {
  try {
    window.localStorage.setItem(SEEN_KEY, at.toISOString());
  } catch {
    // Private windows and blocked site data. The badge simply never appears,
    // which is a worse experience and not a broken one.
  }
}

export function GradesPanel() {
  const { status, reveal } = useCrypto();
  const [courses, setCourses] = useState<CourseGrades[] | null>(null);
  const [fresh, setFresh] = useState<GradeRow[]>([]);
  const [gpa, setGpa] = useState<GpaInput[]>([]);
  const [failed, setFailed] = useState(false);

  /// Gathers and decrypts, and touches no state. Keeping the fetch and the
  /// setState apart is what lets the effect below cancel cleanly — and it is
  /// also the difference between this and the two panels beside it, which set
  /// state directly inside their effects and trip the lint rule about it.
  const gather = useCallback(async (): Promise<
    | { ok: true; courses: CourseGrades[]; fresh: GradeRow[]; gpa: GpaInput[] }
    | { ok: false }
  > => {
    const stored = await fetchGradebook();
    if (!stored) return { ok: true, courses: [], fresh: [], gpa: [] };

    try {
      const names = new Map<string, string>();
      const reported = new Map<string, string | null>();
      const gpa: GpaInput[] = [];
      await Promise.all(
        stored.courses.map(async (c) => {
          const p = await reveal<{
            name?: string;
            shortName?: string;
            reportedGrade?: string | null;
          }>({ cipher: c.payloadCipher, iv: c.payloadIv });
          const label = p.shortName || p.name || "Course";
          names.set(c.id, label);
          // Only the gradebook's own figure is ever shown. See `gradebook.ts`
          // for why nothing is computed here.
          if (p.reportedGrade != null) reported.set(label, p.reportedGrade);

          // The same figure, parsed, for the GPA estimate. A course with no
          // grade posted contributes nothing rather than a zero.
          const asNumber = p.reportedGrade == null ? NaN : Number(p.reportedGrade);
          gpa.push({
            id: c.id,
            title: label,
            grade: Number.isFinite(asNumber) ? asNumber : null,
          });
        }),
      );

      const rows: GradeRow[] = await Promise.all(
        stored.assignments.map(async (a) => {
          const p = await reveal<Payload>({
            cipher: a.payloadCipher,
            iv: a.payloadIv,
          });
          return {
            id: a.id,
            course: names.get(a.courseId) || p.course || "Course",
            name: p.name || "Untitled",
            category: p.category ?? null,
            score: p.score ?? null,
            pointsPossible: p.pointsPossible ?? null,
            status: p.status ?? "UNGRADED",
            updatedAt: new Date(a.updatedAt),
          };
        }),
      );

      const seen = readLastSeen();
      return {
        ok: true,
        courses: buildGradebook(rows, reported),
        fresh: gradedSince(rows, seen),
        gpa,
      };
    } catch {
      // A row that won't decrypt is a real possibility after a password change,
      // and it must not take the dashboard down with it.
      return { ok: false };
    }
  }, [reveal]);

  useEffect(() => {
    if (status !== "unlocked") return;

    // Guarded because the read is slow — every row is decrypted one at a time
    // — and a student can unlock, look, and navigate away well before it
    // finishes. Without this, the result lands on an unmounted component.
    let live = true;
    void gather().then((result) => {
      if (!live) return;
      if (!result.ok) {
        setFailed(true);
        return;
      }
      setCourses(result.courses);
      setFresh(result.fresh);
      setGpa(result.gpa);
      // Written only once the marks are actually on screen. Stamping "seen" at
      // fetch time would clear the badge for grades the student never saw,
      // because the tab closed or the decrypt failed halfway.
      writeLastSeen(new Date());
    });

    return () => {
      live = false;
    };
  }, [status, gather]);

  if (status !== "unlocked" || courses === null) return null;
  if (failed) return <GradesUnreadable />;
  if (courses.length === 0) return null;

  return (
    <>
      <GradesList courses={courses} newCount={fresh.length} />
      <GpaCard courses={gpa} />
    </>
  );
}

function GradesUnreadable() {
  return (
    <section className="mt-14 panel p-6">
      <h2 className="h3 text-[17px]">Your grades</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
        These couldn&rsquo;t be read with your current password. Syncing{" "}
        <Link href="/canvas" className="text-sky underline underline-offset-2">
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
  return (
    <section className="mt-14">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="h3 text-[17px]">Your grades</h2>
        {newCount > 0 && (
          <span className="label rounded-full bg-sky-soft px-3 py-1 text-sky">
            {newCount} new since you last looked
          </span>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {courses.map((c) => (
          <CourseCard key={c.course} course={c} />
        ))}
      </div>

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
              className="mt-3 text-[14px] text-sky hover:underline"
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
