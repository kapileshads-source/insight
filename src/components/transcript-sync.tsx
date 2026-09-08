"use client";

import { useState } from "react";

import {
  pullTranscript,
  storeTranscript,
} from "@/app/actions/hac";
import { useCrypto } from "@/components/crypto-provider";
import { parseTranscriptHtml } from "@/lib/hac-dom";
import { buildTranscript, officialGpa } from "@/lib/transcript";

/**
 * Reading the transcript.
 *
 * Separate from the classwork sync because it answers a different question and
 * changes on a different clock. Classwork moves every time a teacher marks
 * something; a transcript moves twice a year, when a semester closes. So this
 * is a button rather than anything automatic — re-reading it on every dashboard
 * load would be pointless work and a good way to find whatever rate limit HAC
 * has.
 *
 * The page is fetched by the server and parsed here, like everything else: the
 * server has no key, so it cannot store what it just read.
 */
export function TranscriptSync() {
  const { conceal, status } = useCrypto();
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "working" }
    | { kind: "done"; years: number; courses: number; weighted: string | null }
    | { kind: "problem"; message: string }
  >({ kind: "idle" });

  async function pull() {
    setState({ kind: "working" });

    const page = await pullTranscript();
    if (!page.ok) {
      setState({ kind: "problem", message: page.error });
      return;
    }

    try {
      const transcript = buildTranscript(parseTranscriptHtml(page.html));

      if (transcript.years.length === 0) {
        setState({
          kind: "problem",
          message:
            "The transcript page loaded but had no years on it. If you're a first-year student that is expected — there is nothing on it until a semester closes.",
        });
        return;
      }

      const sealed = await conceal(transcript);
      const stored = await storeTranscript(sealed);
      if (!stored.ok) {
        setState({ kind: "problem", message: stored.error });
        return;
      }

      const official = officialGpa(transcript);
      setState({
        kind: "done",
        years: transcript.years.length,
        courses: transcript.years.reduce((n, y) => n + y.courses.length, 0),
        weighted: official.weighted
          ? official.weighted.value.toFixed(4)
          : null,
      });
    } catch {
      setState({
        kind: "problem",
        message: "Couldn't read that transcript. Nothing was saved.",
      });
    }
  }

  if (status !== "unlocked") return null;

  return (
    <section className="panel mt-6 px-7 py-6">
      <h2 className="h3 text-[17px]">Your transcript</h2>
      <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-text-muted">
        Every semester you&rsquo;ve finished, and the GPA your school actually
        calculated. That figure is the real one — everything else Insight shows
        you is an estimate from marks that are still moving.
      </p>

      <button
        type="button"
        onClick={() => void pull()}
        disabled={state.kind === "working"}
        className="btn-primary mt-5 px-6 py-3 text-[15px] disabled:opacity-50"
      >
        {state.kind === "working" ? "Reading…" : "Read my transcript"}
      </button>

      {state.kind === "done" && (
        <p className="mt-4 text-[15px] leading-relaxed text-text-muted">
          {state.years} {state.years === 1 ? "year" : "years"}, {state.courses}{" "}
          courses.
          {state.weighted
            ? ` Your school's weighted GPA is ${state.weighted}.`
            : " No GPA printed on it yet."}
        </p>
      )}

      {state.kind === "problem" && (
        <p className="mt-4 max-w-lg text-[14px] leading-relaxed text-alert">
          {state.message}
        </p>
      )}

      <p className="mt-4 text-[13px] leading-relaxed text-text-faint">
        Worth doing once a semester — it only changes when one ends.
      </p>
    </section>
  );
}
