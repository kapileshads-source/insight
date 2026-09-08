"use client";

import { useState, useTransition } from "react";

import { askAboutMyStats } from "@/app/actions/chat";
import { useGradebook } from "@/components/gradebook-data";
import { useStudyData } from "@/components/study-data";
import { checkQuestion, type ChatFacts, type ChatTurn } from "@/lib/chat";
import {
  hasUsableGrade,
  levelOf,
  onlyEnrolled,
  presentGpa,
} from "@/lib/gpa";

/**
 * Asking Insight about your own numbers.
 *
 * The design constraint that shapes everything here: the server cannot read
 * this student's data, so the facts sent to the model have to be assembled in
 * the browser, from the same decrypt the rest of the dashboard uses. There is
 * no server-side "get my stats" and there cannot be one.
 *
 * What gets sent is an aggregate — GPA, course percentages, this week's
 * counts, and the sentences the insight engine has already validated. Never a
 * session, never an assignment name, never an individual mark. That is the
 * same line `requestRecommendation` draws, and it is drawn once, in
 * `chat.ts`, so there is a single place to check what leaves the device.
 *
 * The scope check runs here *and* in the action. Here so a refusal is instant
 * and costs nothing; there because a server action is reachable by direct POST
 * and a rule enforced only in the browser is not a rule.
 */

/// Kept short deliberately. Long histories are where an injection accumulates,
/// and they are resent in full on every turn, which is what an API bill is
/// made of.
const MAX_HISTORY = 8;

/**
 * The course name a person would use.
 *
 * HAC titles arrive as `MTH34300A - 8 AP Pre-Calculus S1 - C Lunch`, and the
 * model repeats them verbatim, so an answer about three classes read like a
 * registrar's export. The district code, the period number, the semester
 * marker and the lunch wave are all real information and none of it belongs in
 * a sentence answering "which class should I worry about".
 */
export function readableCourse(title: string): string {
  return (
    title
      // Leading district code and period: "MTH34300A - 8 ".
      .replace(/^[A-Z]{2,4}\d{3,6}[A-Z]?\s*[-–]\s*\d+\s*/i, "")
      // Trailing lunch wave.
      .replace(/\s*[-–]\s*[ABC]\s*Lunch\s*$/i, "")
      // Trailing semester marker.
      .replace(/\s*\bS[12]\b\s*$/i, "")
      // A teacher's surname in parentheses.
      .replace(/\s*\([^)]*\)\s*$/, "")
      .trim() || title
  );
}

export function StatsChat() {
  // Both halves of the aggregate come from providers rather than from props.
  // The chat needs the gradebook *and* the study log, and neither can be read
  // anywhere but the browser — so it reads the two decrypts the page has
  // already done rather than being handed a summary by whoever mounts it.
  const data = useGradebook();
  const { stats, insights } = useStudyData();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (data.status !== "ready") return null;

  const courses = onlyEnrolled(data.gpa).filter((c) => hasUsableGrade(c.grade));

  // The number the dashboard headlines, which is the one a student means by
  // "my GPA". The first version sent `past` — the school's last *confirmed*
  // figure — so asked "what's my GPA right now", the chat answered 4.694 while
  // the band at the top of the same screen said 4.733. Being wrong about this
  // one number is worse than not having the feature.
  const today = presentGpa(
    data.past ?? { weighted: null, unweighted: null },
    data.priorCount,
    courses.map((c) => ({
      level: levelOf(c.title),
      grade: c.grade as number,
    })),
  );

  const facts: ChatFacts = {
    gpaWeighted: today.weighted,
    gpaUnweighted: today.unweighted,
    courses: courses.map((c) => ({
      name: readableCourse(c.title),
      percent: c.grade,
    })),
    sessionsThisWeek: stats?.sessionsThisWeek ?? 0,
    minutesThisWeek: Math.round(stats?.minutesThisWeek ?? 0),
    meanSleepHours: stats?.meanSleep ?? null,
    openAssignments: 0,
    missingAssignments: 0,
    // Only the validated ones. An unvalidated pattern is a coincidence, and
    // handing one to a model to phrase is how it becomes a sentence a student
    // believes.
    patterns: (insights ?? [])
      .filter((i) => i.isSurfaced)
      .map((i) => i.statement),
  };

  function send(e: React.FormEvent) {
    e.preventDefault();
    const question = draft.trim();
    setError(null);

    // Refused before the request, so an off-topic question is free and the
    // answer arrives immediately.
    const verdict = checkQuestion(question);
    if (!verdict.allowed) {
      setError(verdict.reason);
      return;
    }

    const history = turns.slice(-MAX_HISTORY);
    setTurns([...turns, { role: "user", content: question }]);
    setDraft("");

    start(async () => {
      const res = await askAboutMyStats({ facts, history, question });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTurns((prev) => [...prev, { role: "assistant", content: res.text }]);
    });
  }

  return (
    <section className="enter panel px-7 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="h3 text-[17px]">Ask about your numbers</h2>
        <span className="label text-text-faint">Your stats only</span>
      </div>

      {turns.length === 0 && (
        <>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-text-muted">
            Questions about your grades, your GPA, how much you&rsquo;ve
            studied, and what Insight has found. It won&rsquo;t do your
            homework and it doesn&rsquo;t know about anything else.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              "Which class should I worry about?",
              "How much have I studied this week?",
              "What's my GPA doing?",
            ].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setDraft(q)}
                className="rounded-full border border-line-hi px-3.5 py-1.5 text-[13px] text-text-muted hover:border-accent hover:text-text"
              >
                {q}
              </button>
            ))}
          </div>
        </>
      )}

      {turns.length > 0 && (
        <div className="mt-5 space-y-4">
          {turns.map((t, i) => (
            <div key={i}>
              <p className="label text-text-faint">
                {t.role === "user" ? "You" : "Insight"}
              </p>
              <p
                className={`mt-1 text-[15px] leading-relaxed ${
                  t.role === "user" ? "text-text-muted" : "text-text"
                }`}
              >
                {t.content}
              </p>
            </div>
          ))}
          {pending && (
            <p className="text-[15px] text-text-faint">Thinking…</p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-[15px] leading-relaxed text-alert">
          {error}
        </p>
      )}

      <form onSubmit={send} className="mt-5 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={500}
          aria-label="Ask about your stats"
          placeholder="Ask something about your stats"
          className="min-w-0 flex-1 rounded-md border border-line bg-bg px-4 py-2.5 text-[15px]"
        />
        <button
          type="submit"
          disabled={pending || draft.trim().length === 0}
          className="btn-primary shrink-0 px-5 py-2.5 text-[15px] disabled:opacity-50"
        >
          Ask
        </button>
      </form>

      <p className="mt-3 text-[13px] leading-relaxed text-text-faint">
        Your totals are sent to phrase an answer — your GPA, your course
        percentages and this week&rsquo;s counts. Individual sessions,
        assignment names and marks are not.
      </p>
    </section>
  );
}
