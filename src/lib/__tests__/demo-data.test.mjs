import { buildDemoData } from "../demo-data.ts";
import { computeInsights } from "../insights.ts";

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name); }
};

const END = new Date("2026-08-28T12:00:00");
const data = buildDemoData({ endingOn: END });

console.log("a term that looks like a term");
{
  ok("has sessions", data.sessions.length > 30);
  ok("has a night for every day", data.sleep.length === 84);
  ok("has phone time for every day", data.screenTime.length === 84);
  ok("has enough scores to compare", data.outcomes.length >= 8);

  ok("sessions end after they start", data.sessions.every((s) => s.endedAt > s.startedAt));
  ok("durations are plausible", data.sessions.every((s) => s.durationMinutes >= 25 && s.durationMinutes <= 100));
  ok("nobody sleeps 20 hours", data.sleep.every((s) => s.hours > 4 && s.hours < 12));
  ok("scores stay percentages", data.outcomes.every((o) => o.percentage >= 45 && o.percentage <= 100));
  ok("nobody studies at the weekend here",
     data.sessions.every((s) => s.startedAt.getDay() !== 0 && s.startedAt.getDay() !== 6));
  ok("distraction never exceeds the session", data.sessions.every((s) => s.distractedMinutes < s.durationMinutes));
}

console.log("\nreproducible");
{
  // A demo that looks different every time can't be discussed or screenshotted.
  const again = buildDemoData({ endingOn: END });
  ok("the same seed gives the same term",
     JSON.stringify(again.outcomes) === JSON.stringify(data.outcomes));
  const other = buildDemoData({ endingOn: END, seed: 7 });
  ok("a different seed gives a different one",
     JSON.stringify(other.outcomes) !== JSON.stringify(data.outcomes));
}

console.log("\nthe engine finds what was planted");
{
  const inputs = {
    sessions: data.sessions.map((s, i) => ({
      id: `s${i}`,
      startedAt: s.startedAt,
      durationMinutes: s.durationMinutes,
      subject: s.subject,
      location: s.location,
      noise: s.noise,
      distractedMinutes: s.distractedMinutes,
    })),
    outcomes: data.outcomes.map((o, i) => ({
      id: `o${i}`,
      occurredOn: new Date(`${o.date}T12:00:00`),
      percentage: o.percentage,
      subject: o.subject,
    })),
    sleep: data.sleep.map((s) => ({ forDate: new Date(`${s.date}T12:00:00`), hours: s.hours })),
    screenTime: data.screenTime.map((s) => ({ forDate: new Date(`${s.date}T12:00:00`), minutes: s.minutes })),
  };

  const all = computeInsights(inputs);
  const surfaced = all.filter((i) => i.isSurfaced);

  // The whole point of a demo: it has to show something. An empty dashboard
  // demonstrates nothing.
  ok("something surfaces at all", surfaced.length > 0);
  // Two effects were built in — late nights and short sleep. At least one has
  // to survive the permutation test or the demo is just noise.
  ok("a planted factor is among them",
     surfaced.some((i) => i.category === "STUDY_TIMING" || i.category === "SLEEP"));
  ok("and it points the right way",
     surfaced.filter((i) => ["STUDY_TIMING", "SLEEP"].includes(i.category))
       .every((i) => i.magnitude < 0));
  ok("every surfaced finding beat chance", surfaced.every((i) => i.chance <= 0.05));

  console.log(`       (surfaced: ${surfaced.map((i) => `${i.category} ${i.magnitude}pp`).join(", ") || "none"})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
