import {
  computeInsights,
  basicStats,
  chanceOf,
  dailyStudyMinutes,
  GATES,
} from "../insights.ts";

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

console.log("\ndaily minutes, for the chart");
{
  const now = day(20);
  const sessions = [
    { id: "d1", startedAt: at(18, 16), durationMinutes: 45, distractedMinutes: 5 },
    { id: "d2", startedAt: at(18, 20), durationMinutes: 30, distractedMinutes: 0 },
    { id: "d3", startedAt: at(20, 9), durationMinutes: 60 },
  ];
  const bars = dailyStudyMinutes({ sessions, outcomes: [], sleep: [], screenTime: [] }, now);

  ok("returns fourteen days", bars.length === 14);
  ok("ends today", bars[13].date.getDate() === now.getDate());
  ok("adds up a day's sessions", bars[11].minutes === 75);
  ok("counts the sessions too", bars[11].sessions === 2);
  ok("sums measured distraction", bars[11].distractedMinutes === 5);
  // A day nothing measured is not a focused day, and must not be drawn as one.
  ok("leaves unmeasured distraction undefined", bars[13].distractedMinutes === undefined);
  // A gap would read as a day that doesn't exist. A zero reads as a day you
  // didn't study, which is both true and more useful.
  ok("empty days are zeroes, not gaps", bars[0].minutes === 0 && bars[0].sessions === 0);
  ok("no day is ever negative", bars.every((b) => b.minutes >= 0));
}

console.log("\nhow often chance alone does this");
{
  // A gap that is obviously real: one group is entirely above the other.
  const separated = [40, 42, 44, 46, 90, 92, 94, 96];
  ok("a clean split is rare by chance", chanceOf(separated, 4, -50) < 0.05);

  // The same numbers, with no real gap between the groups as drawn.
  ok("no gap is unremarkable", chanceOf(separated, 4, 0) > 0.5);

  // A group of one is one number. Its gap from the rest is whatever that
  // number happens to be, and a ten-point gap turns up here one time in eight
  // — which is exactly the kind of thing the old gates called a finding.
  ok("a group of one proves nothing", chanceOf([70, 72, 74, 76, 78, 80, 82, 95], 1, 10) > 0.05);

  ok("a degenerate split is never a finding", chanceOf([1, 2, 3], 0, 10) === 1);
  ok("neither is an all-in-one-group split", chanceOf([1, 2, 3], 3, 10) === 1);

  // An insight that appears on one page load and vanishes on the next is
  // worse than one that never appears, so the shuffle is seeded.
  const once = chanceOf(separated, 4, -50);
  ok("the same input gives the same answer", chanceOf(separated, 4, -50) === once);
}

console.log("\ncoincidences do not become insights");
{
  // Ten scores that rise steadily, split by something with nothing to do with
  // them. The old gates passed differences like this regularly; over generated
  // students they were about half of everything surfaced, and one arrived with
  // the wrong sign entirely.
  const sessions = [];
  const outcomes = [];
  for (let i = 0; i < 10; i++) {
    const testDay = i * 7 + 6;
    for (let s = 0; s < 3; s++) {
      sessions.push({
        id: `c${i}_${s}`,
        startedAt: at(testDay - 2, 17),
        durationMinutes: 45,
        subject: "Chemistry",
        // Alternating, which is exactly the kind of split that invents a
        // finding out of an unrelated trend.
        location: i % 2 === 0 ? "HOME" : "LIBRARY",
      });
    }
    outcomes.push({
      id: `co${i}`,
      occurredOn: day(testDay),
      percentage: 70 + i,
      subject: "Chemistry",
    });
  }

  const surfaced = computeInsights({ sessions, outcomes, sleep: [], screenTime: [] })
    .filter((i) => i.isSurfaced);
  ok("a coincidence is not surfaced", surfaced.length === 0);
  ok("chance is still reported for it", computeInsights({ sessions, outcomes, sleep: [], screenTime: [] })
    .every((i) => typeof i.chance === "number"));
}

console.log("\nthe sentence agrees with its own sign");
{
  // A factor that came before *higher* scores was shown as "+8%" beside the
  // words "came before lower scores", because every phrase() ignored the
  // magnitude it was handed.
  const sessions = [];
  const outcomes = [];
  for (let i = 0; i < 10; i++) {
    const testDay = i * 7 + 6;
    const atHome = i % 2 === 0;
    for (let s = 0; s < 3; s++) {
      sessions.push({
        id: `h${i}_${s}`,
        startedAt: at(testDay - 2, 17),
        durationMinutes: 45,
        subject: "Chemistry",
        location: atHome ? "HOME" : "LIBRARY",
      });
    }
    // Home is the *better* place for this student — the opposite of the
    // sentence the code used to produce unconditionally.
    outcomes.push({
      id: `ho${i}`,
      occurredOn: day(testDay),
      percentage: atHome ? 92 : 70,
      subject: "Chemistry",
    });
  }

  const home = computeInsights({ sessions, outcomes, sleep: [], screenTime: [] })
    .find((i) => i.category === "LOCATION");

  ok("it found the direction", home !== undefined && home.magnitude > 0);
  ok("and says higher, not lower", home !== undefined && home.statement.includes("higher scores"));
  ok("never both", home !== undefined && !home.statement.includes("lower scores"));
  // A positive finding needs no fixing, so it carries no suggestion.
  ok("a good habit gets no advice", home !== undefined && home.suggestion === undefined);
}

// --- multiple comparisons ---------------------------------------------------
//
// The engine asks seven questions of the same set of scores. At maxChance 0.05
// each, the odds that at least one clears by luck are about 30% — so roughly
// one student in three would be shown a confident invented finding. These
// check the Holm correction that fixes it.
{
  console.log("\nmultiple comparisons");

  // Pure noise: scores unrelated to anything, but enough sessions and spread
  // to clear every gate except the statistical one.
  const rand = (seed) => {
    let s = seed;
    return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  };

  let anySurfaced = 0;
  const TRIALS = 40;
  for (let t = 0; t < TRIALS; t++) {
    const r = rand(t * 7919 + 13);
    const sessions = [];
    const outcomes = [];
    const sleep = [];
    for (let i = 0; i < 30; i++) {
      const day = new Date(2026, 0, 1 + i * 2);
      sessions.push({
        id: `s${i}`,
        startedAt: new Date(day.getTime() + (r() < 0.5 ? 9 : 23) * 3600e3),
        durationMinutes: r() < 0.5 ? 25 : 95,
        subject: i % 3 === 0 ? "Chem" : i % 3 === 1 ? "Eng" : "Hist",
        location: r() < 0.5 ? "HOME" : "LIBRARY",
        noise: r() < 0.5 ? "SILENT" : "NOISY",
        distractedMinutes: Math.floor(r() * 30),
      });
      sleep.push({ forDate: day, hours: 5 + r() * 5 });
      if (i % 2 === 0) {
        outcomes.push({
          id: `o${i}`,
          occurredOn: new Date(day.getTime() + 3 * 86400e3),
          // Scores drawn independently of every factor above.
          percentage: 60 + Math.floor(r() * 40),
          subject: i % 3 === 0 ? "Chem" : i % 3 === 1 ? "Eng" : "Hist",
        });
      }
    }
    const found = computeInsights({
      sessions,
      outcomes,
      sleep,
      screenTime: [],
    }).filter((i) => i.isSurfaced);
    if (found.length > 0) anySurfaced++;
  }

  // With no correction this sat well above a tenth of the runs. The bar is
  // deliberately loose — this is a stochastic test and a flaky one helps
  // nobody — but it is far below where the uncorrected engine landed.
  ok(
    `pure noise surfaces a finding in under a fifth of runs (${anySurfaced}/${TRIALS})`,
    anySurfaced <= TRIALS / 5,
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
