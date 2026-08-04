"use client";

import { useState, useTransition } from "react";
import { readScreenTime, type OcrCandidate } from "@/lib/ocr";

/// Reads a Screen Time screenshot and hands back a suggested number.
///
/// It suggests; it never decides. OCR on a phone screenshot misreads often
/// enough that silently trusting it would put wrong numbers into a data set
/// whose whole value is being accurate, and the student would never know.
export function ScreenshotReader({
  onPick,
}: {
  onPick: (minutes: number, raw: string) => void;
}) {
  const [pending, start] = useTransition();
  const [best, setBest] = useState<OcrCandidate | null>(null);
  const [alternatives, setAlternatives] = useState<OcrCandidate[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  function handle(file: File) {
    setProblem(null);
    setBest(null);
    setAlternatives([]);

    start(async () => {
      const res = await readScreenTime(file);
      if (!res.ok) {
        setProblem(
          res.reason === "no-time-found"
            ? "Couldn't find a time in that image. Crop it tighter around the total, or just type the number below."
            : "Couldn't read that image. Typing it below works just as well.",
        );
        return;
      }
      setBest(res.best);
      setAlternatives(res.alternatives);
    });
  }

  const format = (m: number) =>
    m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;

  return (
    <div className="rounded-md border border-line bg-bg p-4">
      <label htmlFor="screenshot" className="label text-text-muted">
        Or read it from a screenshot
      </label>

      <input
        id="screenshot"
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handle(f);
        }}
        className="mt-2 block w-full text-[14px] text-text-muted file:mr-3 file:rounded-md file:border file:border-line-hi file:bg-surface file:px-4 file:py-2 file:text-[14px] file:text-text"
      />

      <p className="mt-2 text-[13px] leading-relaxed text-text-faint">
        The image is read on this device and never uploaded. Only the number is
        saved, and only after you confirm it.
      </p>

      {pending && (
        <p className="mt-3 text-[15px] text-text-muted">Reading the image…</p>
      )}

      {problem && (
        <p role="alert" className="mt-3 text-[15px] text-down">
          {problem}
        </p>
      )}

      {best && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-[15px] text-text-muted">
            Found <span className="text-text">{best.raw}</span>. Is that the
            daily total?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onPick(best.minutes, best.raw)}
              className="btn-primary px-5 py-2.5 text-[15px]"
            >
              Use {format(best.minutes)}
            </button>
            {alternatives.map((a) => (
              <button
                key={a.minutes}
                type="button"
                onClick={() => onPick(a.minutes, a.raw)}
                className="rounded-md border border-line-hi px-4 py-2.5 text-[15px] text-text-muted"
              >
                {format(a.minutes)}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[13px] text-text-faint">
            None of these right? Type it in the box above instead.
          </p>
        </div>
      )}
    </div>
  );
}
