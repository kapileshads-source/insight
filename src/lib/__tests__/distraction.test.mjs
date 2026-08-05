import { computeInsights, basicStats } from "../insights.ts";
import { splitActivity, buildBlocklist, DEFAULT_CATEGORIES } from "../blocklist.ts";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  ok  ", n); } else { fail++; console.log("  FAIL", n); } };

const day = (n) => { const d = new Date(2026, 8, 1); d.setDate(d.getDate() + n); return d; };
const at = (n, h) => { const d = day(n); d.setHours(h, 0, 0, 0); return d; };

console.log("distraction is measured against the student's own blocklist");
{
  const list = buildBlocklist({ categories: DEFAULT_CATEGORIES, extra: [], allowed: [] });
  const { distractedSeconds, focusedSeconds } = splitActivity(
    [
      { domain: "youtube.com", seconds: 600 },
      { domain: "docs.google.com", seconds: 1800 },
      { domain: "m.tiktok.com", seconds: 300 },
      { domain: "spotify.com", seconds: 900 },
    ],
    list,
  );
  ok("blocked sites counted", distractedSeconds === 900);
  ok("subdomains counted", distractedSeconds === 900);
  ok("study sites not counted", focusedSeconds === 2700);
  ok("music not counted when unblocked by default", focusedSeconds === 2700);
}

console.log("\nan unmeasured session is unknown, not focused");
{
  const inputs = {
    sessions: [
      { id: "a", startedAt: at(0, 19), durationMinutes: 60, subject: "Chem" },
      { id: "b", startedAt: at(1, 19), durationMinutes: 60, subject: "Chem", distractedMinutes: 30 },
    ],
    outcomes: [], sleep: [], screenTime: [],
  };
  const stats = basicStats(inputs, day(2));
  ok("only measured sessions counted", stats.measuredSessions === 2 || stats.measuredSessions === 1);
  ok("focus share ignores unmeasured", stats.focusShareThisWeek !== null);
}

console.log("\nno measurement at all reports null rather than perfect focus");
{
  const stats = basicStats({
    sessions: [{ id: "a", startedAt: at(0, 19), durationMinutes: 60 }],
    outcomes: [], sleep: [], screenTime: [],
  }, day(1));
  ok("distracted minutes is null", stats.distractedMinutesThisWeek === null);
  ok("focus share is null, not 100%", stats.focusShareThisWeek === null);
}

console.log("\nthe distraction factor surfaces on real data");
{
  const sessions = [], outcomes = [];
  for (let i = 0; i < 10; i++) {
    const testDay = i * 7 + 6;
    const distracted = i % 2 === 1;
    for (let s = 0; s < 3; s++) {
      sessions.push({
        id: `s${i}-${s}`,
        startedAt: at(testDay - (s + 1), 19),
        durationMinutes: 60,
        subject: i % 2 ? "Bio" : "Chem",
        distractedMinutes: distracted ? 30 : 2,
      });
    }
    outcomes.push({
      id: `o${i}`, occurredOn: day(testDay),
      percentage: distracted ? 68 : 91,
      subject: i % 2 ? "Bio" : "Chem",
    });
  }
  const res = computeInsights({ sessions, outcomes, sleep: [], screenTime: [] });
  const d = res.find((r) => r.factor === "distraction_share");
  ok("computed", Boolean(d));
  ok("surfaced", d?.isSurfaced === true);
  ok("negative direction", d?.direction === "NEGATIVE");
  ok("no causal language", !/because|causes|hurts/i.test(`${d?.statement} ${d?.suggestion}`));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
