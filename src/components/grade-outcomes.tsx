"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchGradeState,
  resolveGradeConflict,
  saveGradeOutcomes,
} from "@/app/actions/logs";
import { useCrypto } from "@/components/crypto-provider";
import { planOutcomes, type ExistingOutcome, type GradedAssignment, type OutcomeConflict } from "@/lib/outcomes";

/**
 * The join between the gradebooks and the insight engine.
 *
 * Until this existed the two halves of the app never met: Canvas grades synced
 * every ten minutes, HAC grades arrived on request, and the engine could see
 * neither, every score it used had been typed in by hand. A student with a
 * connected gradebook still had to re-enter their own marks for any of it to
 * mean anything, which almost nobody would do.
 *
 * Runs quietly. Recording a score that already exists in Canvas is not news,
 * and a card announcing "added 14 scores" every ten minutes would be noise.
 * The one thing it does surface is a disagreement, where a student typed a
 * mark and the gradebook says something else, because that is the only case
 * where the app genuinely does not know which number is right.
 */

type AssignmentPayload = {
  name?: string;
  course?: string;
  pointsPossible?: number | null;
  score?: number | null;
  state?: string;
  status?: string;
};

type OutcomePayload = {
  percentage?: number;
  subject?: string | null;
};

/// Only these mean "there is a real mark here". Canvas says `GRADED`; HAC's
/// score cell says so by carrying a number, and `EXCUSED` never does.
const isGraded = (p: AssignmentPayload) =>
  p.state === "GRADED" || p.status === "GRADED";

export function GradeOutcomes() {
  const { conceal, reveal, status } = useCrypto();
  const [conflicts, setConflicts] = useState<OutcomeConflict[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(async () => {
    const state = await fetchGradeState();
    if (!state) return;

    try {
      const graded: GradedAssignment[] = [];

      for (const a of state.assignments) {
        const p = await reveal<AssignmentPayload>({
          cipher: a.payloadCipher,
          iv: a.payloadIv,
        });
        if (!isGraded(p)) continue;
        if (typeof p.score !== "number") continue;
        if (typeof p.pointsPossible !== "number") continue;

        // Neither gradebook says when a mark was entered, so the due date is
        // the day the score belongs to. It is the date the student associates
        // with the test anyway.
        const occurredOn = a.dueAt
          ? new Date(a.dueAt).toISOString().slice(0, 10)
          : null;
        if (!occurredOn) continue;

        graded.push({
          id: a.id,
          courseId: a.courseId,
          course: p.course ?? "",
          name: p.name ?? "Assignment",
          occurredOn,
          score: p.score,
          pointsPossible: p.pointsPossible,
        });
      }

      const existing: ExistingOutcome[] = await Promise.all(
        state.outcomes.map(async (o) => {
          const p = await reveal<OutcomePayload>({
            cipher: o.payloadCipher,
            iv: o.payloadIv,
          });
          return {
            id: o.id,
            assignmentId: o.assignmentId,
            source: o.source as ExistingOutcome["source"],
            occurredOn: new Date(o.occurredOn).toISOString().slice(0, 10),
            percentage: p.percentage ?? 0,
            subject: p.subject ?? null,
          };
        }),
      );

      const plan = planOutcomes(graded, existing);
      setConflicts(plan.conflicts);

      if (plan.create.length === 0) return;

      const outcomes = await Promise.all(
        plan.create.map(async (o) => ({
          assignmentId: o.assignmentId,
          courseId: o.courseId,
          occurredOn: o.occurredOn,
          payload: await conceal({
            percentage: o.percentage,
            pointsEarned: o.pointsEarned,
            pointsPossible: o.pointsPossible,
            subject: o.subject,
            label: o.label,
          }),
        })),
      );

      // Source is per-batch, and a batch can hold both gradebooks. Splitting
      // them keeps the record of where a score came from honest.
      const bySource = new Map<"CANVAS" | "HAC", typeof outcomes>();
      plan.create.forEach((o, i) => {
        const source =
          state.assignments.find((a) => a.id === o.assignmentId)?.source === "HAC"
            ? "HAC"
            : "CANVAS";
        const list = bySource.get(source) ?? [];
        list.push(outcomes[i]);
        bySource.set(source, list);
      });

      for (const [source, list] of bySource) {
        await saveGradeOutcomes({ source, outcomes: list });
      }
    } catch {
      // A row that won't decrypt after a password change must not take the
      // dashboard down. The next load tries again.
    }
  }, [conceal, reveal]);

  useEffect(() => {
    if (status !== "unlocked") return;
    // `run` awaits a round trip before it touches state, so there is no
    // cascading render for the rule to see, and the data arrives as
    // ciphertext, so this cannot happen anywhere but the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void run();
    // Ten minutes, matching the Canvas pull, so a grade posted during a free
    // period becomes a score in the same visit rather than the next one.
    const timer = window.setInterval(() => void run(), 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [status, run]);

  async function resolve(conflict: OutcomeConflict, useGradebook: boolean) {
    setBusy(conflict.outcomeId);

    const payload = useGradebook
      ? await conceal({
          percentage: conflict.gradebook,
          subject: null,
          label: conflict.label,
        })
      : null;

    await resolveGradeConflict({
      outcomeId: conflict.outcomeId,
      assignmentId: conflict.assignmentId,
      payload,
    });

    setBusy(null);
    setConflicts((current) =>
      current.filter((c) => c.outcomeId !== conflict.outcomeId),
    );
  }

  if (status !== "unlocked" || conflicts.length === 0) return null;

  return (
    <ConflictCard
      conflicts={conflicts}
      busy={busy}
      onResolve={(c, useGradebook) => void resolve(c, useGradebook)}
    />
  );
}

/**
 * The card, with no crypto and no fetching.
 *
 * Split out so it can be rendered against made-up conflicts and looked at,
 * the panel above needs an unlocked key and a real disagreement to exist,
 * which makes the one thing worth checking (does this read as neutral, rather
 * than as an accusation?) the one thing hardest to see.
 */
export function ConflictCard({
  conflicts,
  busy = null,
  onResolve,
}: {
  conflicts: OutcomeConflict[];
  busy?: string | null;
  onResolve: (conflict: OutcomeConflict, useGradebook: boolean) => void;
}) {
  return (
    <section className="rounded-lg border border-alert/40 bg-surface p-6">
      <h2 className="h3 text-[17px]">Two different scores</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
        You logged one number and the gradebook says another. Insight
        won&rsquo;t pick for you, whichever you choose is the one your insights
        are built on.
      </p>

      <ul className="mt-6">
        {conflicts.map((c) => (
          <li key={c.outcomeId} className="border-t border-line py-4 first:border-t-0">
            <p className="text-[15px] text-text">{c.label}</p>
            <p className="mt-1 text-[14px] text-text-faint">
              You logged {Math.round(c.manual)}% · the gradebook says{" "}
              {Math.round(c.gradebook)}%
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy === c.outcomeId}
                onClick={() => onResolve(c, true)}
                className="rounded bg-accent px-3 py-1.5 text-[14px] text-on-light disabled:opacity-40"
              >
                Use {Math.round(c.gradebook)}%
              </button>
              <button
                type="button"
                disabled={busy === c.outcomeId}
                onClick={() => onResolve(c, false)}
                className="text-[14px] text-text-faint hover:text-text-muted"
              >
                Keep mine
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
