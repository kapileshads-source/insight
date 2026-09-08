"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchPairingState,
  saveAssignmentLinks,
  unlinkAssignments,
} from "@/app/actions/pairing";
import { useCrypto } from "@/components/crypto-provider";
import type { MatchCandidate, Pairing } from "@/lib/assignment-match";
import { planPairings } from "@/lib/pairing-plan";

/**
 * Working out which Canvas row and which HAC row are the same assignment.
 *
 * Both titles are encrypted, so the comparison can only happen here. The
 * server stores the answer and enforces the one thing a browser can't: that an
 * assignment is never in two pairings at once.
 *
 * Confident pairings are made silently. The middle band — where the titles
 * look alike but something doesn't line up — is the only part worth a
 * student's attention, and it is shown one question at a time rather than as a
 * queue, because a queue of yes/no questions is a queue nobody finishes.
 */

type Payload = {
  name?: string;
  course?: string;
  pointsPossible?: number | null;
  score?: number | null;
};

export type PairingChoice = Pairing & { canvasTitle: string; hacTitle: string };

/// A pairing already made, with a way back out. The undo is the whole reason
/// this is a link and not a merge — without it the schema's justification is
/// a comment rather than a feature.
export type LinkedPair = {
  id: string;
  canvasTitle: string;
  hacTitle: string;
  autoLinked: boolean;
};

export function AssignmentPairing() {
  const { reveal, status } = useCrypto();
  const [review, setReview] = useState<PairingChoice[]>([]);
  const [linked, setLinked] = useState<LinkedPair[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(async () => {
    const state = await fetchPairingState();
    if (!state) return;

    try {
      const courseNames = new Map<string, string>();
      await Promise.all(
        state.courses.map(async (c) => {
          const p = await reveal<{ name?: string; shortName?: string }>({
            cipher: c.payloadCipher,
            iv: c.payloadIv,
          });
          courseNames.set(c.id, p.shortName || p.name || "");
        }),
      );

      const titles = new Map<string, string>();
      const canvas: MatchCandidate[] = [];
      const hac: MatchCandidate[] = [];

      for (const a of state.assignments) {
        const p = await reveal<Payload>({
          cipher: a.payloadCipher,
          iv: a.payloadIv,
        });
        const candidate: MatchCandidate = {
          id: a.id,
          course: courseNames.get(a.courseId) || p.course || "",
          title: p.name ?? "",
          dueAt: a.dueAt ? new Date(a.dueAt) : null,
          points: p.pointsPossible ?? null,
          score: p.score ?? null,
        };
        if (!candidate.title) continue;
        titles.set(a.id, candidate.title);
        (a.source === "HAC" ? hac : canvas).push(candidate);
      }

      // Nothing to pair until both gradebooks have something in them.
      if (canvas.length === 0 || hac.length === 0) {
        setReview([]);
        return;
      }

      const plan = planPairings(canvas, hac, state.links, state.rejected);

      if (plan.autoLink.length > 0) {
        await saveAssignmentLinks({
          links: plan.autoLink.map((p) => ({
            canvasAssignmentId: p.canvasId,
            hacAssignmentId: p.hacId,
            confidence: p.confidence,
            autoLinked: true,
            rejected: false,
          })),
        });
      }

      setReview(
        plan.review.map((p) => ({
          ...p,
          canvasTitle: titles.get(p.canvasId) ?? "",
          hacTitle: titles.get(p.hacId) ?? "",
        })),
      );

      // Titles come from the same decrypt pass, so showing what is already
      // linked costs nothing extra.
      setLinked(
        state.links
          .map((l) => ({
            id: l.id,
            canvasTitle: titles.get(l.canvasAssignmentId) ?? "",
            hacTitle: titles.get(l.hacAssignmentId) ?? "",
            autoLinked: l.autoLinked,
          }))
          .filter((l) => l.canvasTitle && l.hacTitle),
      );
    } catch {
      // A row that won't decrypt after a password change must not take the
      // dashboard down with it.
    }
  }, [reveal]);

  useEffect(() => {
    if (status === "unlocked") void run();
  }, [status, run]);

  async function answer(choice: PairingChoice, same: boolean) {
    const id = `${choice.canvasId}|${choice.hacId}`;
    setBusy(id);

    await saveAssignmentLinks({
      links: [
        {
          canvasAssignmentId: choice.canvasId,
          hacAssignmentId: choice.hacId,
          confidence: choice.confidence,
          autoLinked: false,
          rejected: !same,
        },
      ],
    });

    setBusy(null);
    setReview((current) =>
      current.filter(
        (c) => !(c.canvasId === choice.canvasId && c.hacId === choice.hacId),
      ),
    );
  }

  async function undo(pair: LinkedPair) {
    setBusy(pair.id);
    await unlinkAssignments(pair.id);
    setBusy(null);
    setLinked((current) => current.filter((l) => l.id !== pair.id));
    // Re-run, so a row freed by the undo can be offered against something
    // else rather than sitting unpaired until the next sync.
    void run();
  }

  if (status !== "unlocked" || (review.length === 0 && linked.length === 0)) {
    return null;
  }

  return (
    <PairingCard
      choices={review}
      linked={linked}
      busy={busy}
      onAnswer={(choice, same) => void answer(choice, same)}
      onUndo={(pair) => void undo(pair)}
    />
  );
}

/**
 * The card, with no crypto and no fetching.
 *
 * Split out so it can be rendered against made-up pairings and read — whether
 * a student can actually tell these two apart from what's on screen is the
 * whole question, and it isn't one a test can answer.
 */
export function PairingCard({
  choices,
  linked = [],
  busy = null,
  onAnswer,
  onUndo,
}: {
  choices: PairingChoice[];
  linked?: LinkedPair[];
  busy?: string | null;
  onAnswer: (choice: PairingChoice, same: boolean) => void;
  onUndo?: (pair: LinkedPair) => void;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface p-6">
      <h2 className="h3 text-[17px]">
        {choices.length > 0 ? "Same assignment?" : "Linked assignments"}
      </h2>
      {choices.length > 0 && (
        <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
          These look like one assignment listed in both gradebooks, but
          they&rsquo;re close enough to be two. Linking them keeps one score
          instead of two.
        </p>
      )}

      <ul className="mt-6">
        {choices.map((c) => {
          const id = `${c.canvasId}|${c.hacId}`;
          return (
            <li key={id} className="border-t border-line py-4 first:border-t-0">
              {/* Which gradebook each came from is half the question — without
                  it a student is comparing two bare titles and guessing. */}
              <p className="flex flex-wrap items-baseline gap-2 text-[15px] text-text">
                <span className="label shrink-0 text-text-faint">Canvas</span>
                {c.canvasTitle}
              </p>
              <p className="mt-1 flex flex-wrap items-baseline gap-2 text-[15px] text-text">
                <span className="label shrink-0 text-text-faint">HAC</span>
                {c.hacTitle}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-text-faint">
                {c.reasons.join(" ")}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy === id}
                  onClick={() => onAnswer(c, true)}
                  className="rounded bg-accent px-3 py-1.5 text-[14px] text-on-light disabled:opacity-40"
                >
                  Same thing
                </button>
                <button
                  type="button"
                  disabled={busy === id}
                  onClick={() => onAnswer(c, false)}
                  className="text-[14px] text-text-faint hover:text-text-muted"
                >
                  Different assignments
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {linked.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <h3 className="label text-text-faint">
            Already linked · {linked.length}
          </h3>
          <ul className="mt-2">
            {linked.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-baseline justify-between gap-3 py-2"
              >
                <span className="min-w-0 text-[14px] text-text-muted">
                  {l.canvasTitle}
                  <span className="text-text-faint"> ↔ </span>
                  {l.hacTitle}
                  {l.autoLinked && (
                    <span className="text-text-faint"> · matched automatically</span>
                  )}
                </span>
                <button
                  type="button"
                  disabled={busy === l.id}
                  onClick={() => onUndo?.(l)}
                  className="shrink-0 text-[13px] text-text-faint hover:text-text-muted disabled:opacity-40"
                >
                  Not the same
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-6 border-t border-line pt-4 text-[13px] leading-relaxed text-text-faint">
        Nothing is merged or deleted either way — both rows stay, and a link can
        be undone.
      </p>
    </section>
  );
}
