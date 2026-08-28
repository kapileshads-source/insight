"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { fetchStoredAssignments } from "@/app/actions/canvas";
import { useCrypto } from "@/components/crypto-provider";
import {
  assignmentSummary,
  groupAssignments,
  submissionStateFromHac,
  type AssignmentGroup,
  type AssignmentRow,
  type SubmissionState,
} from "@/lib/assignments";

/**
 * What Canvas says is due.
 *
 * These rows have been syncing for weeks with nowhere to appear, which is why
 * school starting changed nothing on screen. Decryption happens here, in the
 * browser, because assignment names are in the blob the server cannot read.
 *
 * The list is deliberately short-tempered: graded work leaves it, submitted
 * work leaves it, and missing work is pinned to the top. A list that shows
 * everything Canvas holds is a filing cabinet, and nobody reads those twice.
 */

/// Canvas and HAC store different shapes. Canvas has `state`; HAC has `status`
/// and carries its own course name. Reading only Canvas's vocabulary is what
/// put graded HAC rows into "Past due".
type Payload = {
  name?: string;
  course?: string;
  pointsPossible?: number | null;
  state?: SubmissionState;
  status?: string;
  score?: number | null;
};

function relativeDue(dueAt: Date | null, now: Date): string {
  if (!dueAt) return "";
  const time = dueAt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const sameYear = dueAt.getFullYear() === now.getFullYear();
  const date = dueAt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  // 11:59 PM is Canvas's default and carries no information worth the space.
  return dueAt.getHours() === 23 && dueAt.getMinutes() === 59
    ? date
    : `${date}, ${time}`;
}

function Row({ row, now }: { row: AssignmentRow; now: Date }) {
  const due = relativeDue(row.dueAt, now);

  return (
    <li className="flex items-baseline justify-between gap-4 border-t border-line py-3 first:border-t-0">
      <div className="min-w-0">
        <p className="truncate text-[15px] text-text">{row.name}</p>
        <p className="mt-0.5 truncate text-[13px] text-text-faint">
          {row.course}
          {due && ` · ${due}`}
        </p>
      </div>
      {row.pointsPossible ? (
        <span className="shrink-0 text-[13px] text-text-muted">
          {row.pointsPossible} pts
        </span>
      ) : null}
    </li>
  );
}

function Group({ group, now }: { group: AssignmentGroup; now: Date }) {
  // Missing work is the only category where the student can still change the
  // outcome and where nobody else will tell them, so it gets the one colour.
  const urgent = group.bucket === "MISSING" || group.bucket === "OVERDUE";

  return (
    <section className="mt-6 first:mt-0">
      <h3
        className={`label ${group.bucket === "MISSING" ? "text-butter" : "text-text-faint"}`}
      >
        {group.label}
        {urgent && ` · ${group.rows.length}`}
      </h3>
      <ul className="mt-2">
        {group.rows.map((row) => (
          <Row key={row.id} row={row} now={now} />
        ))}
      </ul>
    </section>
  );
}

export function AssignmentsPanel() {
  const { reveal, status } = useCrypto();
  const [groups, setGroups] = useState<AssignmentGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    const stored = await fetchStoredAssignments();
    if (!stored) {
      setGroups([]);
      return;
    }

    try {
      const courseNames = new Map<string, string>();
      await Promise.all(
        stored.courses.map(async (c) => {
          const p = await reveal<{ name?: string; shortName?: string }>({
            cipher: c.payloadCipher,
            iv: c.payloadIv,
          });
          courseNames.set(c.id, p.shortName || p.name || "Course");
        }),
      );

      const rows: AssignmentRow[] = await Promise.all(
        stored.assignments.map(async (a) => {
          const p = await reveal<Payload>({
            cipher: a.payloadCipher,
            iv: a.payloadIv,
          });
          return {
            id: a.id,
            name: p.name || "Untitled assignment",
            course: courseNames.get(a.courseId) || p.course || "Course",
            dueAt: a.dueAt ? new Date(a.dueAt) : null,
            pointsPossible: p.pointsPossible ?? null,
            score: p.score ?? null,
            state:
              p.state ??
              (p.status ? submissionStateFromHac(p.status) : "UNSUBMITTED"),
          };
        }),
      );

      setGroups(groupAssignments(rows));
    } catch {
      // A row that won't decrypt is a real possibility after a password
      // change, and it must not take the dashboard down with it.
      setFailed(true);
    }
  }, [reveal]);

  useEffect(() => {
    if (status === "unlocked") void load();
  }, [status, load]);

  if (status !== "unlocked" || groups === null) return null;

  if (failed) {
    return (
      <section className="mt-14 rounded-lg border border-line bg-surface p-6">
        <h2 className="h3 text-[17px]">What&rsquo;s due</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
          These couldn&rsquo;t be read with your current password. Syncing{" "}
          <Link href="/canvas" className="text-sky underline underline-offset-2">
            Canvas
          </Link>{" "}
          again will rewrite them.
        </p>
      </section>
    );
  }

  // Nothing due is worth saying plainly rather than showing an empty card, and
  // a student with no Canvas connection should be told that instead.
  if (groups.length === 0) return null;

  return <AssignmentList groups={groups} showAll={showAll} onShowAll={() => setShowAll(true)} />;
}

/**
 * The card itself, with no crypto and no fetching.
 *
 * Split out so it can be rendered against sample data and looked at — the
 * panel above needs a signed-in user and an unlocked key, which makes the one
 * thing worth checking (does this read well?) the one thing hardest to check.
 */
export function AssignmentList({
  groups,
  showAll = false,
  onShowAll,
}: {
  groups: AssignmentGroup[];
  showAll?: boolean;
  onShowAll?: () => void;
}) {
  const summary = assignmentSummary(groups);
  const visible = showAll ? groups : groups.slice(0, 3);
  const hidden = groups.length - visible.length;

  return (
    <section className="mt-14 rounded-lg border border-line bg-surface p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="h3 text-[17px]">What&rsquo;s due</h2>
        <Link href="/canvas" className="label text-text-faint hover:text-text-muted">
          From Canvas
        </Link>
      </div>

      <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
        {summary.missing > 0 && (
          <span className="text-butter">
            {summary.missing} marked missing.{" "}
          </span>
        )}
        {summary.dueSoon > 0
          ? `${summary.dueSoon} due today or already past.`
          : "Nothing due today."}{" "}
        <span className="text-text-faint">
          {summary.total} open in total.
        </span>
      </p>

      <div className="mt-6">
        {visible.map((group) => (
          <Group key={group.bucket} group={group} now={new Date()} />
        ))}
      </div>

      {hidden > 0 && (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-6 text-[14px] text-sky"
        >
          Show {hidden} more group{hidden === 1 ? "" : "s"}
        </button>
      )}

      <p className="mt-6 border-t border-line pt-4 text-[13px] leading-relaxed text-text-faint">
        Graded and handed-in work isn&rsquo;t listed — this is what&rsquo;s
        left. Names and points are encrypted here in your browser, the same as
        everything else.
      </p>
    </section>
  );
}
