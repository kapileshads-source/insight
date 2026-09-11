import { OUTCOMES_FLOOR, readiness, readinessFraction } from "../readiness.ts";
import { GATES } from "../insights.ts";

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name); }
};

console.log("the floors come from the engine, not from a copy of them");
{
  // If someone tunes GATES, this must move with it rather than quietly
  // promising the wrong wait.
  ok("outcome floor is twice the per-group minimum", OUTCOMES_FLOOR === GATES.minPerGroup * 2);
  ok("a fresh account needs the full session floor", readiness(0, 0).sessionsNeeded === GATES.minSessions);
  ok("and the full outcome floor", readiness(0, 0).outcomesNeeded === OUTCOMES_FLOOR);
}

console.log("counting down");
{
  const r = readiness(5, 2);
  ok("counts sessions remaining", r.sessionsNeeded === GATES.minSessions - 5);
  ok("counts outcomes remaining", r.outcomesNeeded === OUTCOMES_FLOOR - 2);
  ok("not ready", r.ready === false);
  ok("names both", r.headline.includes("study sessions") && r.headline.includes("test scores"));
}

console.log("wording stays grammatical at one");
{
  const r = readiness(GATES.minSessions - 1, OUTCOMES_FLOOR - 1);
  ok("singular session", r.headline.includes("1 study session") && !r.headline.includes("1 study sessions"));
  ok("singular score", r.headline.includes("1 test score") && !r.headline.includes("1 test scores"));
}

console.log("only the missing half is mentioned");
{
  const enoughSessions = readiness(GATES.minSessions, 1);
  ok("no session clause when the floor is met", !enoughSessions.headline.includes("session"));
  ok("still asks for scores", enoughSessions.headline.includes("test score"));

  const enoughOutcomes = readiness(1, OUTCOMES_FLOOR);
  ok("no score clause when that floor is met", !enoughOutcomes.headline.includes("test score"));
  ok("still asks for sessions", enoughOutcomes.headline.includes("study session"));
}

console.log("never overshoots");
{
  const r = readiness(500, 500);
  ok("no negative sessions", r.sessionsNeeded === 0);
  ok("no negative outcomes", r.outcomesNeeded === 0);
  ok("ready", r.ready === true);
}

console.log("ready never promises a finding");
{
  const r = readiness(GATES.minSessions, OUTCOMES_FLOOR);
  ok("ready at exactly the floors", r.ready === true);
  // Clearing the floors buys a comparison, not a result. Most comparisons
  // fail the permutation test, and that is the point of it, so the copy must
  // not say a pattern is coming.
  const said = `${r.headline} ${r.detail}`.toLowerCase();
  ok("does not say it will tell you something", !said.includes("will tell you"));
  ok("does not promise a pattern", !/will (show|find|reveal)/.test(said));
  ok("warns it may stay quiet", said.includes("quiet"));
}

console.log("the progress bar weights both floors");
{
  ok("empty is zero", readinessFraction(readiness(0, 0)) === 0);
  ok("full is one", readinessFraction(readiness(GATES.minSessions, OUTCOMES_FLOOR)) === 1);
  // A bar racing to 90% on sessions alone would suggest the wait is nearly
  // over when no test has been recorded at all.
  ok("sessions alone cap at half", readinessFraction(readiness(999, 0)) === 0.5);
  ok("outcomes alone cap at half", readinessFraction(readiness(0, 999)) === 0.5);
  ok("never exceeds one", readinessFraction(readiness(999, 999)) === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
