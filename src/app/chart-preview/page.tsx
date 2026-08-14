import { InsightRow } from "@/components/insight-row";
import { computeInsights, type InsightInputs, type SessionRecord, type OutcomeRecord } from "@/lib/insights";

/**
 * The real engine, real component, generated student. Nothing hand-written —
 * every sentence below came out of computeInsights.
 */
function student(): InsightInputs {
  let seed = 4242;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];

  const SUBJECTS = ["Biology", "Algebra II", "World History"];
  const START = new Date("2026-01-05T00:00:00Z");
  const day = (n: number) => new Date(START.getTime() + n * 86_400_000);

  const sessions: SessionRecord[] = [];
  const outcomes: OutcomeRecord[] = [];
  const sleep = [];
  const screenTime = [];

  for (let d = 0; d < 84; d++) {
    sleep.push({ forDate: day(d), hours: 6 + rand() * 3.5 });
    screenTime.push({ forDate: day(d), minutes: 120 + rand() * 180 });
  }
  const sleepBy = new Map(sleep.map((s) => [s.forDate.getTime(), s.hours]));
  const meanSleep = sleep.reduce((a, b) => a + b.hours, 0) / sleep.length;

  let id = 0;
  for (let d = 9; d < 84; d += 3) {
    const subject = SUBJECTS[d % SUBJECTS.length];
    const prep: SessionRecord[] = [];
    for (let back = 1; back <= 4; back++) {
      const startedAt = day(d - back);
      startedAt.setHours(rand() < 0.45 ? 23 : 17, 30, 0, 0);
      const s: SessionRecord = {
        id: `s${id++}`, startedAt, durationMinutes: 30 + Math.floor(rand() * 70), subject,
        location: pick(["HOME", "CLASSROOM", "LIBRARY", "OTHER"] as const),
        noise: pick(["SILENT", "QUIET", "SOME", "LOUD"] as const),
        distractedMinutes: rand() < 0.4 ? Math.floor(rand() * 30) : 0,
      };
      prep.push(s); sessions.push(s);
    }
    const lateShare = prep.filter((s) => s.startedAt.getHours() >= 23).length / prep.length;
    const hours = sleepBy.get(day(d - 1).getTime()) ?? meanSleep;
    outcomes.push({
      id: `o${d}`, occurredOn: day(d), subject,
      percentage: Math.max(35, Math.min(100,
        84 + (rand() - 0.5) * 10 - lateShare * 50 - (hours < meanSleep ? 16 : 0))),
    });
  }
  return { sessions, outcomes, sleep, screenTime };
}

export default function Preview() {
  const insights = computeInsights(student());
  const surfaced = insights.filter((i) => i.isSurfaced);
  const pending = insights.filter((i) => !i.isSurfaced);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <h2 className="h2 text-[clamp(1.6rem,4vw,2.125rem)]">What we&rsquo;re seeing</h2>
      <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-text-muted">
        Patterns in your own data, compared against your own averages. These
        describe what happened together, not what caused what.
      </p>
      <div className="mt-8">
        {surfaced.map((i) => (
          <InsightRow key={i.factor} direction={i.direction} magnitude={i.magnitude}
            statement={i.statement} suggestion={i.suggestion} sampleSize={i.sampleSize}
            heldIn={i.heldIn} isSurfaced />
        ))}
      </div>

      <h3 className="h3 mt-12 text-[17px] text-text-muted">Still gathering</h3>
      <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-text-faint">
        These aren&rsquo;t solid enough to show yet. They need about 8 sessions
        behind them, holding across more than one week.
      </p>
      <div className="mt-4">
        {pending.map((i) => (
          <InsightRow key={i.factor} direction={i.direction} magnitude={i.magnitude}
            statement={i.statement} sampleSize={i.sampleSize} isSurfaced={false} />
        ))}
      </div>
    </main>
  );
}
