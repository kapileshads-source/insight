/**
 * Which Canvas↔HAC pairings to make, and which to ask about.
 *
 * `assignment-match` does the comparing; this decides what to do with the
 * answer given everything the student has already settled. Three rules, and
 * each exists because the alternative annoys somebody into switching the
 * feature off:
 *
 *  - **An assignment already in a link is out of the running.** It is spoken
 *    for, and a link is one-to-one.
 *  - **A refused combination is never offered again.** Not the rows, the
 *    combination. "Unit 2 Test is not Unit 2 Test Retake" must not stop Unit 2
 *    Test finding the row it really matches.
 *  - **Confident pairings are made without asking.** The middle band is the
 *    only thing worth a student's attention, and a queue of obvious yes/no
 *    questions is a queue nobody finishes.
 */

import { matchAssignments, type MatchCandidate, type Pairing } from "./assignment-match";

export type ExistingLink = {
  canvasAssignmentId: string;
  hacAssignmentId: string;
};

export type PairingPlan = {
  /// Confident enough to record without asking.
  autoLink: Pairing[];
  /// Plausible. Worth one question each.
  review: Pairing[];
};

const key = (canvasId: string, hacId: string) => `${canvasId}|${hacId}`;

export function planPairings(
  canvas: MatchCandidate[],
  hac: MatchCandidate[],
  links: ExistingLink[],
  rejected: ExistingLink[],
): PairingPlan {
  const spokenFor = new Set<string>();
  for (const link of links) {
    spokenFor.add(link.canvasAssignmentId);
    spokenFor.add(link.hacAssignmentId);
  }

  const refused = new Set(
    rejected.map((r) => key(r.canvasAssignmentId, r.hacAssignmentId)),
  );

  // Matching only what is still available keeps the matcher's greedy choice
  // honest: a title spent on an already-linked row would otherwise crowd out
  // the row that still needs one.
  const freeCanvas = canvas.filter((c) => !spokenFor.has(c.id));
  const freeHac = hac.filter((h) => !spokenFor.has(h.id));

  const result = matchAssignments(freeCanvas, freeHac);
  const allowed = (p: Pairing) => !refused.has(key(p.canvasId, p.hacId));

  return {
    autoLink: result.linked.filter(allowed),
    review: result.review.filter(allowed),
  };
}
