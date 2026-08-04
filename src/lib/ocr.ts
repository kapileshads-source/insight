/**
 * Reading a screen-time total out of a screenshot.
 *
 * Runs entirely in the browser. The image is never uploaded — only the number,
 * and only after the student has confirmed it. That is a claim the privacy
 * page makes, so it has to stay true: nothing in this file sends anything
 * anywhere.
 *
 * OCR on a phone screenshot is unreliable enough that the confirm step is not
 * a courtesy. iOS and Android lay Screen Time out differently, students crop
 * inconsistently, and dark mode changes the contrast. The parser is a
 * best-effort suggestion; the student is the authority.
 */

export type OcrCandidate = {
  minutes: number;
  /// What the parser matched, shown so a student can see why it guessed this.
  raw: string;
};

export type OcrOutcome =
  | { ok: true; best: OcrCandidate; alternatives: OcrCandidate[]; text: string }
  | { ok: false; reason: "no-time-found" | "failed"; text?: string };

/// Matches the shapes both platforms use for a duration:
///   "5h 32m"  "5 hr 32 min"  "5h"  "47m"  "5:32"
const PATTERNS: { re: RegExp; toMinutes: (m: RegExpMatchArray) => number }[] = [
  {
    re: /(\d{1,2})\s*h(?:ou)?r?s?\s*(\d{1,2})\s*m(?:in)?/gi,
    toMinutes: (m) => Number(m[1]) * 60 + Number(m[2]),
  },
  {
    re: /(\d{1,2})\s*h(?:ou)?r?s?\b(?!\s*\d)/gi,
    toMinutes: (m) => Number(m[1]) * 60,
  },
  {
    re: /\b(\d{1,3})\s*m(?:in)?(?:ute)?s?\b/gi,
    toMinutes: (m) => Number(m[1]),
  },
  {
    re: /\b(\d{1,2}):(\d{2})\b/g,
    toMinutes: (m) => Number(m[1]) * 60 + Number(m[2]),
  },
];

/// Pull every duration-shaped string out of OCR text.
///
/// Exported separately from the OCR call so it can be tested without loading
/// a 10MB WASM worker, and so a bad screenshot can be diagnosed from its text.
export function parseDurations(text: string): OcrCandidate[] {
  const found: OcrCandidate[] = [];

  for (const { re, toMinutes } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const minutes = toMinutes(m);
      // A daily total above 24 hours is a misread, not a heavy user.
      if (minutes > 0 && minutes <= 24 * 60) {
        found.push({ minutes, raw: m[0].trim() });
      }
    }
  }

  // De-duplicate, keeping the first phrasing seen for each value.
  const seen = new Set<number>();
  return found.filter((c) => {
    if (seen.has(c.minutes)) return false;
    seen.add(c.minutes);
    return true;
  });
}

/// Read a screenshot and suggest a daily total.
///
/// The heuristic is deliberately crude: on both platforms the daily total is
/// the largest duration on the screen, because everything else is one app's
/// share of it. Crude and explainable beats clever and wrong, given the
/// student confirms it anyway.
export async function readScreenTime(file: File): Promise<OcrOutcome> {
  try {
    const { default: Tesseract } = await import("tesseract.js");
    const { data } = await Tesseract.recognize(file, "eng");
    const text = data.text ?? "";

    const candidates = parseDurations(text).sort(
      (a, b) => b.minutes - a.minutes,
    );
    if (candidates.length === 0) {
      return { ok: false, reason: "no-time-found", text };
    }

    return {
      ok: true,
      best: candidates[0],
      alternatives: candidates.slice(1, 5),
      text,
    };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
