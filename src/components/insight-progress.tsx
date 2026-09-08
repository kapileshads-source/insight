import { GATES } from "@/lib/insights";
import {
  OUTCOMES_FLOOR,
  readiness,
  readinessFraction,
} from "@/lib/readiness";

/**
 * The wait, made visible.
 *
 * A student who logs faithfully for three weeks currently sees no difference
 * between "the engine is gathering" and "this app does nothing", because both
 * look like an empty screen. That is the single biggest reason to stop using
 * it, and it happens before the app has had a chance to be useful.
 *
 * No crypto here, and none needed: the counts are row existence, which is
 * plaintext by the schema rule. The server can say *that* eleven sessions
 * exist without being able to read one of them. Which also means this renders
 * on the server, before the unlock, so the first thing a new student sees on
 * the dashboard is where they are rather than nothing at all.
 */
export function InsightProgress({
  sessions,
  outcomes,
}: {
  sessions: number;
  outcomes: number;
}) {
  const state = readiness(sessions, outcomes);
  const fraction = readinessFraction(state);

  // Once the engine can speak, its own output is the better thing to show. A
  // permanent "you're all set" card is clutter on every load afterwards.
  if (state.ready) return null;

  return (
    <section className="panel px-7 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="h3 text-[17px]">{state.headline}</h2>
        <span className="label text-text-faint">Before any pattern shows</span>
      </div>

      {/* One bar for the pair, not two. They are both blocking, so two bars
          would invite finishing one and reading it as progress. */}
      <div
        className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuenow={Math.round(fraction * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progress towards enough data for an insight"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${Math.max(2, fraction * 100)}%` }}
        />
      </div>

      <dl className="mt-5 flex gap-10">
        <Count label="study sessions" have={sessions} need={GATES.minSessions} />
        <Count label="test scores" have={outcomes} need={OUTCOMES_FLOOR} />
      </dl>

      <p className="mt-5 max-w-lg text-[14px] leading-relaxed text-text-faint">
        {state.detail}
      </p>
    </section>
  );
}

/// Shown as "5 of 8" rather than a percentage. A student can act on the gap
/// between two whole numbers; 62% tells them nothing they can do.
function Count({
  label,
  have,
  need,
}: {
  label: string;
  have: number;
  need: number;
}) {
  const met = have >= need;
  return (
    <div>
      <dd className={`figure text-[1.5rem] ${met ? "text-up" : "text-text"}`}>
        {Math.min(have, need)}
        <span className="text-[0.6em] text-text-faint"> of {need}</span>
      </dd>
      <dt className="mt-1 text-[13px] text-text-faint">{label}</dt>
    </div>
  );
}
