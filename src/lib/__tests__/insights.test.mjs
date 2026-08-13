import { computeInsights, basicStats, GATES } from "../insights.ts";

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) {
    pass++;
    console.log("  ok  ", name);
  } else {
    fail++;
    console.log("  FAIL", name);
  }
};

const day = (n) => {
  const d = new Date(2026, 8, 1);
  d.setDate(d.getDate() + n);
  return d;
};
const at = (n, hour) => {
  const d = day(n);
  d.setHours(hour, 0, 0, 0);
  return d;
};

/// Builds a student whose late sessions really did precede worse scores.
function lateNightStudent() {
  const sessions = [];
  const outcomes = [];
  let sid = 0;

  // Ten tests, alternating subject and week. Odd ones were prepared for late,
  // and scored ~20 points worse.
  for (let i = 0; i < 10; i++) {
    const testDay = i * 7 + 6;
    const late = i % 2 === 1;
    const subject = i % 2 === 0 ? "Chemistry" : "Chemistry";
    for (let s = 0; s < 3; s++) {
      sessions.push({
        id: `s${sid++}`,
        startedAt: at(testDay - (s + 1), late ? 23 : 19),
        durationMinutes: 50,
        subject,
        location: "HOME",
        noise: "QUIET",
      });
    }
    outcomes.push({
      id: `o${i}`,
      occurredOn: day(testDay),
      percentage: late ? 68 + (i % 3) : 90 + (i % 3),
      subject,
    });
  }
  return { sessions, outcomes, sleep: [], screenTime: [] };
}

console.log("a real pattern surfaces");
{
  const res = computeInsights(lateNightStudent());
  const timing = res.find((r) => r.factor === "study_start_time");
  ok("timing insight computed", Boolean(timing));
  ok("it is surfaced", timing?.isSurfaced === true);
  ok("direction is negative", timing?.direction === "NEGATIVE");
  ok("magnitude is a real drop", timing && timing.magnitude <= -15);
  ok(
    "negative insight carries a suggestion",
    Boolean(timing?.suggestion && timing.suggestion.length > 20),
  );
  ok(
    "counter-examples reported",
    timing && timing.heldIn.of > 0 && timing.heldIn.held <= timing.heldIn.of,
  );
  ok("holds across multiple weeks", (timing?.weeksHeld ?? 0) >= 2);
}

console.log("\nwording never claims causation");
{
  const res = computeInsights(lateNightStudent());
  const banned = /\bcauses?\b|\bbecause\b|\bhurts?\b|\bimproves?\b|\bmakes? you\b|\bleads? to\b|\bboosts?\b/i;
  const offenders = res
    .flatMap((r) => [r.statement, r.suggestion ?? ""])
    .filter((t) => banned.test(t));
  ok("no causal verbs in any statement or suggestion", offenders.length === 0);
  ok(
    "statements are phrased as co-occurrence",
    res.every((r) => /came before|lined up|followed/i.test(r.statement)),
  );
}

console.log("\nthin data does not surface");
{
  const thin = {
    sessions: [
      { id: "a", startedAt: at(1, 23), durationMinutes: 60, subject: "Math" },
      { id: "b", startedAt: at(8, 19), durationMinutes: 60, subject: "Math" },
    ],
    outcomes: [
      { id: "x", occurredOn: day(2), percentage: 60, subject: "Math" },
      { id: "y", occurredOn: day(9), percentage: 95, subject: "Math" },
    ],
    sleep: [],
    screenTime: [],
  };
  const res = computeInsights(thin);
  ok("nothing is surfaced on 2 sessions", res.every((r) => !r.isSurfaced));
  ok(
    "but the ungated insight is still returned for the UI",
    res.length > 0,
  );
  const timing = res.find((r) => r.factor === "study_start_time");
  ok(
    "and it reports how little it rests on",
    timing !== undefined && timing.sampleSize < GATES.minSessions,
  );
}

console.log("\na single bad week cannot become an insight");
{
  const sessions = [];
  const outcomes = [];
  // Eight sessions and three tests, all inside one week, one subject.
  for (let i = 0; i < 8; i++) {
    sessions.push({
      id: `s${i}`,
      startedAt: at(1 + (i % 3), 23),
      durationMinutes: 60,
      subject: "History",
    });
  }
  for (let i = 0; i < 3; i++) {
    outcomes.push({
      id: `o${i}`,
      occurredOn: day(4),
      percentage: 55,
      subject: "History",
    });
  }
  // A comparison group in the same week so the split is non-empty.
  for (let i = 0; i < 3; i++) {
    sessions.push({
      id: `e${i}`,
      startedAt: at(2, 18),
      durationMinutes: 60,
      subject: "Art",
    });
    outcomes.push({
      id: `p${i}`,
      occurredOn: day(3),
      percentage: 92,
      subject: "Art",
    });
  }
  const res = computeInsights({ sessions, outcomes, sleep: [], screenTime: [] });
  const timing = res.find((r) => r.factor === "study_start_time");
  ok(
    "one subject in one week fails the breadth gate",
    timing !== undefined && timing.isSurfaced === false,
  );
}

console.log("\nsleep compares to the student's own average");
{
  const sessions = [];
  const outcomes = [];
  const sleep = [];
  for (let i = 0; i < 10; i++) {
    const testDay = i * 7 + 6;
    const short = i % 2 === 1;
    for (let s = 0; s < 3; s++) {
      sessions.push({
        id: `s${i}-${s}`,
        startedAt: at(testDay - (s + 1), 19),
        durationMinutes: 50,
        subject: i % 2 ? "Bio" : "Chem",
      });
      sleep.push({ forDate: day(testDay - (s + 1)), hours: short ? 5 : 8 });
    }
    outcomes.push({
      id: `o${i}`,
      occurredOn: day(testDay),
      percentage: short ? 70 : 92,
      subject: i % 2 ? "Bio" : "Chem",
    });
  }
  const res = computeInsights({ sessions, outcomes, sleep, screenTime: [] });
  const s = res.find((r) => r.factor === "sleep_below_baseline");
  ok("sleep insight surfaces", s?.isSurfaced === true);
  ok("phrased against their own average", /your own average/i.test(s?.statement ?? ""));
  ok(
    "no universal hour target anywhere",
    !/8 hours|eight hours|recommended/i.test(
      `${s?.statement} ${s?.suggestion}`,
    ),
  );
}

console.log("\nempty input is safe");
{
  const res = computeInsights({ sessions: [], outcomes: [], sleep: [], screenTime: [] });
  ok("no insights, no crash", Array.isArray(res) && res.length === 0);
  const stats = basicStats({ sessions: [], outcomes: [], sleep: [], screenTime: [] });
  ok("stats still render", stats.sessionsThisWeek === 0 && stats.daysLoggedOfLast7.length === 7);
}

console.log("\na week that mixes late and early sessions");
{
  // The bug this guards: the timing factor used the *latest* session in the
  // seven-day window, so one 11 PM session marked the whole week late. Every
  // outcome then landed in the same group, the control group was empty, and
  // compare() returned null — the factor silently never fired for anybody who
  // studied late even once. The older test above missed it because its student
  // is all-or-nothing: every session for a test is late, or none is. Real
  // weeks mix, and mixing is what emptied the other side.
  const sessions = [];
  const outcomes = [];
  let sid = 0;

  for (let i = 0; i < 10; i++) {
    const testDay = i * 7 + 6;
    const mostlyLate = i % 2 === 1;
    // Three sessions: a mostly-late week is 2 of 3 late, an early week 1 of 3.
    const hours = mostlyLate ? [23, 23, 17] : [17, 18, 23];
    for (const hour of hours) {
      sessions.push({
        id: `m${sid++}`,
        startedAt: at(testDay - 2, hour),
        durationMinutes: 45,
        subject: "Chemistry",
      });
    }
    outcomes.push({
      id: `mo${i}`,
      occurredOn: day(testDay),
      percentage: mostlyLate ? 68 : 88,
      subject: "Chemistry",
    });
  }

  const insights = computeInsights({ sessions, outcomes, sleep: [], screenTime: [] });
  const timing = insights.find((i) => i.category === "STUDY_TIMING");

  ok("the timing factor still has two sides to compare", timing !== undefined);
  ok("it finds the direction", timing !== undefined && timing.magnitude < 0);
  ok("and it is strong enough to surface", timing !== undefined && timing.isSurfaced);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
