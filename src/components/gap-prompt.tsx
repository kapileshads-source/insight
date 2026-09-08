"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { markPrompted, shouldPrompt } from "@/app/actions/prompt";

/// The gap-filling prompt from the plan.
///
/// Asks once a block at high schools and once every two periods at middle
/// schools, and only during the school day. Dismissing counts the same as
/// answering — being asked is what advances the counter, so saying "no" once
/// doesn't get you asked again ten minutes later.
export function GapPrompt() {
  const [state, setState] = useState<
    | { show: false }
    | { show: true; kind: "PERIODIC"; sequence: number }
    | { show: true; kind: "POST_TERM" }
    | null
  >(null);
  const [, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    shouldPrompt().then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    if (!state?.show) return;
    const kind = state.kind;
    const sequence = kind === "PERIODIC" ? state.sequence : undefined;
    setState({ show: false });
    start(async () => {
      await markPrompted(kind, sequence);
    });
  }

  if (!state?.show) return null;

  const postTerm = state.kind === "POST_TERM";

  return (
    <section className="rounded-lg border border-line-hi bg-surface p-6">
      <h2 className="h3 text-[17px]">
        {postTerm ? "That's the term done." : "Anything Canvas missed?"}
      </h2>
      <p className="mt-3 max-w-lg text-[16px] leading-relaxed text-text-muted">
        {postTerm
          ? "Last chance to add anything from this term that never made it in — a paper score, a quiz, a late night. After this we'll stop asking until next semester."
          : "Quizzes handed back on paper, scores read out in class, work set verbally — none of that reaches Canvas. Add it and it counts the same as everything else."}
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href="/dashboard#log"
          onClick={dismiss}
          className="btn-primary px-6 py-3 text-[15px]"
        >
          Add something
        </Link>
        <button
          onClick={dismiss}
          className="btn-secondary px-5 py-3 text-[15px] text-text-muted"
        >
          Nothing to add
        </button>
      </div>
    </section>
  );
}
