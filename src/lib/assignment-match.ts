/**
 * Deciding whether a HAC assignment and a Canvas assignment are the same thing.
 *
 * They rarely say so. A teacher types "Ch 5 Quiz" into one gradebook and
 * "Chapter 5 Quiz" into the other, or posts a Canvas page called "Unit 2 Test"
 * against a HAC row called "Unit 2 Test Retake", which is a *different*
 * assignment that looks almost identical. HAC has no stable assignment id
 * (two independent parsers of it capture none), so there is nothing to join
 * on but the words, the dates and the numbers.
 *
 * The rule this file is built around: **a wrong merge is far worse than a
 * missed one.** A missed match shows a student two rows where they expected
 * one, and they can see that with their own eyes. A wrong merge silently
 * averages two different tests into one grade, which nobody ever notices and
 * which quietly corrupts every correlation the insight engine draws on top.
 *
 * So scoring is deliberately asymmetric: agreement nudges confidence up,
 * while a handful of specific disagreements veto a pairing outright, however
 * similar the titles look.
 *
 * Everything here is pure. It runs in the browser, because the server cannot
 * read assignment names, same reason the insight engine does.
 */

export type MatchCandidate = {
  id: string;
  /// Course name as its own system spells it. Matched, not assumed equal.
  course: string;
  title: string;
  dueAt?: Date | null;
  /// Points possible. Null when unknown, never a guessed default, because a
  /// 5-point warm-up silently becoming a 100-point assignment poisons every
  /// percentage built on it.
  points?: number | null;
  score?: number | null;
};

export type Pairing = {
  canvasId: string;
  hacId: string;
  confidence: number;
  /// Why, in words a student could read. The middle band asks them to
  /// confirm, and "these look like the same thing" is not enough to decide on.
  reasons: string[];
};

export type MatchResult = {
  /// Confident enough to link without asking.
  linked: Pairing[];
  /// Plausible. Shown to the student to confirm or reject.
  review: Pairing[];
  /// No counterpart found. These become assignments in their own right.
  canvasOnly: string[];
  hacOnly: string[];
};

/// Above this, link it. Below `REVIEW`, don't even offer it.
const LINK = 0.75;
const REVIEW = 0.45;

/// Abbreviations teachers actually type. Expanded on both sides so "ch 5" and
/// "chapter 5" reduce to the same tokens.
const ABBREVIATIONS: Record<string, string> = {
  ch: "chapter",
  chpt: "chapter",
  chap: "chapter",
  hw: "homework",
  ws: "worksheet",
  wkst: "worksheet",
  asgn: "assignment",
  assmt: "assignment",
  tst: "test",
  quiz: "quiz",
  vocab: "vocabulary",
  rev: "review",
  sg: "study guide",
  wu: "warmup",
  ec: "extra credit",
  proj: "project",
  prj: "project",
  pres: "presentation",
  sec: "section",
  pt: "part",
  lab: "lab",
  prac: "practice",
  proble: "problem",
  probs: "problems",

  // Course names, which is where this was failing hardest. A whole semester
  // of "World History" against "World Hist" scored 0.33 on tokens and fell
  // under the floor, so four of nine real assignments never matched, while
  // the traps this file exists to catch were all caught. Precision was fine;
  // recall was the problem, and it was the course line every time.
  hist: "history",
  alg: "algebra",
  geo: "geometry",
  trig: "trigonometry",
  calc: "calculus",
  precal: "precalculus",
  precalc: "precalculus",
  stats: "statistics",
  stat: "statistics",
  chem: "chemistry",
  bio: "biology",
  phys: "physics",
  env: "environmental",
  gov: "government",
  econ: "economics",
  psych: "psychology",
  soc: "sociology",
  lit: "literature",
  eng: "english",
  span: "spanish",
  comp: "composition",
  // The level words, which have to reduce to one spelling before the check
  // below compares them, see coursesMatch.
  h: "honors",
  honours: "honors",
  hon: "honors",
};

/// Words that carry no signal and would inflate similarity between unrelated
/// titles if counted.
const STOPWORDS = new Set([
  "the", "a", "an", "of", "for", "and", "to", "in", "on", "assignment",
  "grade", "graded", "period",
]);

/// A title containing one of these describes a *second attempt at* something,
/// not the thing itself. "Unit 2 Test" and "Unit 2 Test Retake" score almost
/// identically on every other signal, and merging them would overwrite a
/// student's real result with their retake or the reverse.
const ATTEMPT_MARKERS = [
  "retake", "redo", "re-take", "corrections", "correction", "makeup",
  "make up", "make-up", "revision", "revised", "resubmit", "second attempt",
];

export function normalizeTitle(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleTokens(input: string): string[] {
  return normalizeTitle(input)
    .split(" ")
    .filter(Boolean)
    .flatMap((t) => (ABBREVIATIONS[t] ?? t).split(" "))
    .filter((t) => !STOPWORDS.has(t));
}

/// Jaccard overlap of the word sets. Blunt, and deliberately only ever one
/// signal among several.
export function titleSimilarity(a: string, b: string): number {
  const left = new Set(titleTokens(a));
  const right = new Set(titleTokens(b));
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;

  return shared / (left.size + right.size - shared);
}

/// The numbers inside a title, which carry far more weight than the words
/// around them: "Unit 2" and "Unit 3" are 80% similar as text and are not the
/// same assignment in any universe.
function numbersIn(title: string): string[] {
  return normalizeTitle(title).split(" ").filter((t) => /^\d+$/.test(t));
}

function hasAttemptMarker(title: string): boolean {
  const clean = normalizeTitle(title);
  return ATTEMPT_MARKERS.some((m) => clean.includes(normalizeTitle(m)));
}

function daysApart(a?: Date | null, b?: Date | null): number | null {
  if (!a || !b) return null;
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}

/// Course names differ between systems more than assignment names do,
/// "AP Biology" against "Biology AP 1-2", "Alg II H" against "Algebra 2
/// Honors". Matched on tokens, with the level words that distinguish two real
/// courses treated as significant.
export function coursesMatch(a: string, b: string): boolean {
  const left = new Set(titleTokens(a));
  const right = new Set(titleTokens(b));
  if (left.size === 0 || right.size === 0) return false;

  // An honours or AP course is not the on-level one, whatever else agrees.
  //
  // These are compared *after* expansion, which is the whole point: "Alg II H"
  // and "Algebra II Honors" are the same class, and treating "h" and "honors"
  // as different levels vetoed every pairing between them, the exact case
  // this function's own comment claims to handle.
  for (const level of ["ap", "honors", "gt", "ib", "dc"]) {
    if (left.has(level) !== right.has(level)) return false;
  }

  const numbersLeft = [...left].filter((t) => /^\d+$/.test(t));
  const numbersRight = [...right].filter((t) => /^\d+$/.test(t));
  if (
    numbersLeft.length > 0 &&
    numbersRight.length > 0 &&
    !numbersLeft.some((n) => numbersRight.includes(n))
  ) {
    return false;
  }

  return titleSimilarity(a, b) >= 0.4;
}

/// Score one possible pairing. Returns null when something vetoes it.
export function scorePair(
  canvas: MatchCandidate,
  hac: MatchCandidate,
): { confidence: number; reasons: string[] } | null {
  if (!coursesMatch(canvas.course, hac.course)) return null;

  // --- vetoes, before any credit is given -----------------------------------

  // One is a retake and the other isn't.
  if (hasAttemptMarker(canvas.title) !== hasAttemptMarker(hac.title)) return null;

  // Both name a number and the numbers disagree, Unit 2 is not Unit 3.
  const canvasNumbers = numbersIn(canvas.title);
  const hacNumbers = numbersIn(hac.title);
  if (
    canvasNumbers.length > 0 &&
    hacNumbers.length > 0 &&
    !canvasNumbers.some((n) => hacNumbers.includes(n))
  ) {
    return null;
  }

  // Both know what they're out of, and disagree. A 20-point quiz and a
  // 100-point test are not one assignment recorded twice.
  const knownPoints =
    typeof canvas.points === "number" && typeof hac.points === "number";
  if (knownPoints && canvas.points !== hac.points) return null;

  // Weeks apart. Teachers enter grades late, but not a fortnight late in one
  // system and not the other.
  const gap = daysApart(canvas.dueAt, hac.dueAt);
  if (gap !== null && gap > 14) return null;

  // --- credit ---------------------------------------------------------------

  let confidence = 0;
  const reasons: string[] = [];

  // Weighted so that an identical title and nothing else lands exactly on the
  // review threshold: worth asking about, never enough to link on its own.
  const similarity = titleSimilarity(canvas.title, hac.title);
  confidence += similarity * 0.45;
  if (similarity >= 0.8) reasons.push("The names are nearly identical.");
  else if (similarity >= 0.5) reasons.push("The names are similar.");

  if (canvasNumbers.length > 0 && hacNumbers.length > 0) {
    confidence += 0.1;
    reasons.push(`Both are numbered ${canvasNumbers.join(", ")}.`);
  }

  if (gap !== null) {
    if (gap < 1) {
      confidence += 0.3;
      reasons.push("Both are due the same day.");
    } else if (gap <= 3) {
      confidence += 0.15;
      reasons.push("The due dates are within a few days.");
    }
  }

  if (knownPoints) {
    confidence += 0.2;
    reasons.push(`Both are out of ${canvas.points}.`);
  }

  if (
    typeof canvas.score === "number" &&
    typeof hac.score === "number" &&
    canvas.score === hac.score
  ) {
    confidence += 0.2;
    reasons.push("The scores are the same.");
  }

  return { confidence: Math.min(confidence, 1), reasons };
}

/**
 * Pair up two lists of assignments.
 *
 * Greedy on the strongest pairings first, and each assignment is used once,
 * so a title that resembles three others is spent on the best of them rather
 * than claiming all three.
 */
export function matchAssignments(
  canvas: MatchCandidate[],
  hac: MatchCandidate[],
): MatchResult {
  const scored: Pairing[] = [];

  for (const c of canvas) {
    for (const h of hac) {
      const result = scorePair(c, h);
      if (!result || result.confidence < REVIEW) continue;

      scored.push({
        canvasId: c.id,
        hacId: h.id,
        confidence: result.confidence,
        reasons: result.reasons,
      });
    }
  }

  scored.sort((a, b) => b.confidence - a.confidence);

  const usedCanvas = new Set<string>();
  const usedHac = new Set<string>();
  const linked: Pairing[] = [];
  const review: Pairing[] = [];

  for (const pairing of scored) {
    if (usedCanvas.has(pairing.canvasId) || usedHac.has(pairing.hacId)) continue;
    usedCanvas.add(pairing.canvasId);
    usedHac.add(pairing.hacId);

    (pairing.confidence >= LINK ? linked : review).push(pairing);
  }

  return {
    linked,
    review,
    // Anything unpaired stands on its own. That is the point of the exercise:
    // the union of both gradebooks is more than either, and the assignments
    // only one system knows about are exactly what a student is missing today.
    canvasOnly: canvas.filter((c) => !usedCanvas.has(c.id)).map((c) => c.id),
    hacOnly: hac.filter((h) => !usedHac.has(h.id)).map((h) => h.id),
  };
}
