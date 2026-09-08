"use client";

import { useState } from "react";
import Link from "next/link";

import { setAssignmentDone } from "@/app/actions/grades";
import { useAssignments } from "@/components/assignments-data";
import {
  assignmentSummary,
  type AssignmentGroup,
  type AssignmentRow,
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

function Row({
  row,
  now,
  onDone,
}: {
  row: AssignmentRow;
  now: Date;
  onDone?: (id: string) => void;
}) {
  const due = relativeDue(row.dueAt, now);

  // With no due date, when it was handed out is the only thing worth saying —
  // and it is what the "probably this week" guess rests on, so showing it lets
  // a student judge the guess rather than take it on faith.
  const assigned =
    !row.dueAt && row.assignedOn
      ? new Date(`${row.assignedOn}T12:00:00`).toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
      : null;

  return (
    <li className="flex items-start justify-between gap-3 border-t border-line py-3 first:border-t-0">
      {/* The tick. A real checkbox rather than a styled div, so it is
          keyboard-reachable and announces itself; the label is the assignment
          name because "checkbox" on its own tells a screen reader nothing. */}
      <input
        type="checkbox"
        checked={false}
        onChange={() => onDone?.(row.id)}
        aria-label={`Mark "${row.name}" done`}
        className="tick mt-0.5"
      />
      <div className="min-w-0 flex-1">
        {/* Two lines, not one. Canvas titles run long — "Final Research
            Question- Assessment Grade- After completing the Peer Reviews
            please submit yo…" was being cut mid-word, which loses the part
            that says what the work actually is. */}
        <p className="line-clamp-2 text-[15px] leading-snug text-text">
          {row.name}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-text-faint">
          {row.course}
          {due && ` · ${due}`}
          {assigned && ` · handed out ${assigned}`}
          {!row.dueAt && row.moduleName && ` · in ${row.moduleName}`}
        </p>
      </div>
      {row.pointsPossible ? (
        <span className="mt-0.5 shrink-0 text-[13px] text-text-muted">
          {row.pointsPossible} pts
        </span>
      ) : null}
    </li>
  );
}

function Group({
  group,
  now,
  onDone,
}: {
  group: AssignmentGroup;
  now: Date;
  onDone?: (id: string) => void;
}) {
  // Missing work is the only category where the student can still change the
  // outcome and where nobody else will tell them, so it gets the one colour.
  const urgent = group.bucket === "MISSING" || group.bucket === "OVERDUE";

  return (
    <section className="mt-6 first:mt-0">
      <h3
        className={`label ${group.bucket === "MISSING" ? "text-alert" : "text-text-faint"}`}
      >
        {group.label}
        {urgent && ` · ${group.rows.length}`}
      </h3>
      <ul className="mt-2">
        {group.rows.map((row) => (
          <Row key={row.id} row={row} now={now} onDone={onDone} />
        ))}
      </ul>
    </section>
  );
}

export function AssignmentsPanel() {
  const { groups, units, failed, unlocked } = useAssignments();
  const [showAll, setShowAll] = useState(false);
  // Optimistically hidden rows. The write goes to the server, but the row has
  // to leave the list now — a checkbox that pauses before responding feels
  // broken in a way a wrong guess here would not.
  const [done, setDone] = useState<Set<string>>(new Set());

  if (!unlocked || groups === null) return null;

  if (failed) {
    return (
      <section className="enter panel p-6">
        <h2 className="h3 text-[17px]">What&rsquo;s due</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
          These couldn&rsquo;t be read with your current password. Syncing{" "}
          <Link href="/canvas" className="text-accent underline underline-offset-2">
            Canvas
          </Link>{" "}
          again will rewrite them.
        </p>
      </section>
    );
  }

  const visible = groups
    .map((g) => ({ ...g, rows: g.rows.filter((r) => !done.has(r.id)) }))
    .filter((g) => g.rows.length > 0);

  if (visible.length === 0) return null;

  function markDone(id: string) {
    setDone((prev) => new Set(prev).add(id));
    void setAssignmentDone(id, true);
  }

  return (
    <AssignmentList
      groups={visible}
      units={units}
      showAll={showAll}
      onShowAll={() => setShowAll(true)}
      onDone={markDone}
    />
  );
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
  units = [],
  showAll = false,
  onShowAll,
  onDone,
}: {
  groups: AssignmentGroup[];
  /// What each class is currently on, from Canvas modules. The one question
  /// only Canvas can answer — HAC's gradebook has no idea what is being taught.
  units?: { course: string; unit: string }[];
  showAll?: boolean;
  onShowAll?: () => void;
  /// Ticking an item off. Optional so the card can still be rendered against
  /// fixtures with no server behind it.
  onDone?: (id: string) => void;
}) {
  const summary = assignmentSummary(groups);
  const visible = showAll ? groups : groups.slice(0, 3);
  const hidden = groups.length - visible.length;

  return (
    <section className="panel p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="h3 text-[17px]">What&rsquo;s due</h2>
        <Link href="/canvas" className="label text-text-faint hover:text-text-muted">
          From Canvas
        </Link>
      </div>

      <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
        {summary.missing > 0 && (
          <span className="text-alert">
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

      {units.length > 0 && (
        <dl className="mt-6 border-t border-line pt-4">
          <dt className="label text-text-faint">What your classes are on</dt>
          {units.map((u) => (
            <dd
              key={`${u.course}-${u.unit}`}
              className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[14px] text-text-muted"
            >
              <span className="text-text-faint">{u.course}</span>
              <span className="text-text">{u.unit}</span>
            </dd>
          ))}
        </dl>
      )}

      <div className="mt-6">
        {visible.map((group) => (
          <Group
            key={group.bucket}
            group={group}
            now={new Date()}
            onDone={onDone}
          />
        ))}
      </div>

      {hidden > 0 && (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-6 text-[14px] text-accent"
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
