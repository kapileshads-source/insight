"use client";

import Link from "next/link";

import { useAssignments } from "@/components/assignments-data";
import { useGradebook } from "@/components/gradebook-data";
import { useStudyData } from "@/components/study-data";
import { assignmentSummary } from "@/lib/assignments";
import { hasUsableGrade, levelOf, onlyEnrolled, presentGpa } from "@/lib/gpa";
import { formatDuration } from "@/lib/records";

/**
 * The dashboard as a hub.
 *
 * Every tile is the headline of a page and a link to it. Nothing here is a
 * control, nothing here is a list, and nothing here needs scrolling, the
 * point is that opening Insight answers "where am I" in one glance, and every
 * follow-up question has one obvious place to go.
 *
 * This replaces a dashboard that carried the full grades list, the full
 * assignments list, the week chart, the findings, the gathering list and the
 * chat, all in one column. Each of those now lives on the page it belongs to,
 * and its number appears here.
 *
 * All three providers are read rather than fetched. The tiles are a fourth
 * view of decrypts that have already happened, not a fourth pass over the
 * ciphertext.
 */

function Tile({
  href,
  label,
  children,
  foot,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
  foot?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="panel panel-link enter flex min-h-[9.5rem] flex-col justify-between px-6 py-5"
    >
      <span className="label text-text-faint">{label}</span>
      <div className="mt-3">{children}</div>
      {foot && <div className="mt-3 text-[13px] text-text-faint">{foot}</div>}
    </Link>
  );
}

/// A figure and its unit. Null renders as a dash, never as zero, no data is
/// not the same fact as none.
///
/// The unit is two short words at most. "since you last looked" was tried
/// here and wrapped under the number, so the figure and its own label ended up
/// on separate lines; anything longer belongs in the foot.
function Big({ value, unit }: { value: string | null; unit?: string }) {
  return (
    <span className="figure text-[2rem] text-text">
      {value ?? ", "}
      {unit && (
        <span className="ml-1.5 font-sans text-[13px] text-text-muted">
          {unit}
        </span>
      )}
    </span>
  );
}

export function SummaryTiles() {
  const gradebook = useGradebook();
  const study = useStudyData();
  const assignments = useAssignments();

  // GPA, worked out exactly as /gpa does it, the same `presentGpa`, so the
  // tile and the page can never disagree.
  let gpa: string | null = null;
  let gpaFoot: string | null = null;
  if (gradebook.status === "ready") {
    const courses = onlyEnrolled(gradebook.gpa).filter((c) =>
      hasUsableGrade(c.grade),
    );
    const today = presentGpa(
      gradebook.past ?? { weighted: null, unweighted: null },
      gradebook.priorCount,
      courses.map((c) => ({
        level: levelOf(c.title),
        grade: c.grade as number,
      })),
    );
    gpa = today.weighted?.toFixed(3) ?? null;
    gpaFoot =
      today.unweighted !== null
        ? `${today.unweighted.toFixed(3)} unweighted`
        : null;
  }

  const due = assignments.groups ? assignmentSummary(assignments.groups) : null;

  const marked = gradebook.status === "ready" ? gradebook.fresh.length : 0;
  const classCount =
    gradebook.status === "ready" ? gradebook.courses.length : 0;

  const surfaced = (study.insights ?? []).filter((i) => i.isSurfaced).length;
  const stillGathering = (study.insights ?? []).filter(
    (i) => !i.isSurfaced,
  ).length;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Tile
        href="/gpa"
        label="Your GPA"
        foot={gpaFoot ?? "Try a different grade"}
      >
        <Big value={gpa} />
      </Tile>

      <Tile
        href="/study"
        label="Studied this week"
        foot={
          study.stats
            ? `${study.stats.sessionsThisWeek} session${study.stats.sessionsThisWeek === 1 ? "" : "s"}`
            : "Start a session"
        }
      >
        <Big
          value={
            study.stats ? formatDuration(study.stats.minutesThisWeek) : null
          }
        />
      </Tile>

      <Tile
        href="/work"
        label="What's due"
        foot={
          due && due.missing > 0 ? (
            // The one number here a student can still do something about, and
            // the only place on this screen with a colour.
            <span className="text-alert">
              {due.missing} marked missing
            </span>
          ) : due ? (
            `${due.total} open in total`
          ) : (
            "From Canvas and HAC"
          )
        }
      >
        <Big value={due ? String(due.dueSoon) : null} unit="due today" />
      </Tile>

      <Tile
        href="/work"
        label="New marks"
        foot={
          classCount > 0
            ? `since you last looked · ${classCount} ${classCount === 1 ? "class" : "classes"}`
            : "Once your gradebook syncs"
        }
      >
        <Big
          value={gradebook.status === "ready" ? String(marked) : null}
          unit="new"
        />
      </Tile>

      <Tile
        href="/logs"
        label="What we're seeing"
        foot={
          surfaced > 0
            ? `found · ${stillGathering} more still gathering`
            : "Needs more sessions before anything is solid"
        }
      >
        <Big
          value={study.insights === null ? null : String(surfaced)}
          unit={surfaced === 1 ? "pattern" : "patterns"}
        />
      </Tile>

      <Tile
        href="/logs"
        label="Sleep, 7-day"
        foot="From what you've logged"
      >
        <Big
          value={
            study.stats?.meanSleep
              ? study.stats.meanSleep.toFixed(1)
              : null
          }
          unit="hrs"
        />
      </Tile>
    </div>
  );
}
