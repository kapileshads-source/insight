import {
  courseScore,
  msUntilNextSync,
  RETRY_AFTER_FAILURE_MS,
  shouldSync,
  SYNC_EVERY_MS,
} from "../canvas-sync.ts";

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name); }
};

const NOW = 1_800_000_000_000;
const base = (over) => ({
  now: NOW,
  connected: true,
  tokenLive: true,
  unlocked: true,
  visible: true,
  lastSyncedAt: NOW - SYNC_EVERY_MS - 1000,
  lastAttemptAt: null,
  lastFailureAt: null,
  ...over,
});

console.log("when it pulls");
{
  ok("stale data gets refreshed", shouldSync(base()).sync === true);
  ok("nothing pulled yet", shouldSync(base({ lastSyncedAt: null })).sync === true);
  ok("fresh data is left alone", shouldSync(base({ lastSyncedAt: NOW - 1000 })).sync === false);
  ok("exactly ten minutes counts as due",
     shouldSync(base({ lastSyncedAt: NOW - SYNC_EVERY_MS })).sync === true);
}

console.log("\nwhen it refuses, and says why");
{
  // Each of these is a call that would have gone out for nobody's benefit.
  ok("not connected", shouldSync(base({ connected: false })).because.includes("connected"));
  ok("locked, no key, nothing to encrypt with",
     shouldSync(base({ unlocked: false })).sync === false);
  // A dashboard left open in a background tab for a week would otherwise call
  // Canvas a thousand times for nobody to read.
  ok("hidden tab", shouldSync(base({ visible: false })).sync === false);
  // A 90-day token that died overnight would generate a failed call every ten
  // minutes forever.
  ok("dead token", shouldSync(base({ tokenLive: false })).sync === false);
}

console.log("\ntabs don't race");
{
  // Set before the sync starts, not after, so two tabs in the same tick
  // can't both decide to go.
  ok("another tab just went", shouldSync(base({ lastAttemptAt: NOW - 1000 })).sync === false);
  ok("an old attempt doesn't block forever",
     shouldSync(base({ lastAttemptAt: NOW - SYNC_EVERY_MS - 1 })).sync === true);
  // An attempt in flight hasn't updated the server's timestamp yet, so the
  // attempt has to be checked first.
  ok("an in-flight attempt beats a stale server time",
     shouldSync(base({ lastSyncedAt: NOW - 86_400_000, lastAttemptAt: NOW - 5 })).sync === false);
}

console.log("\nfailures back off further than successes");
{
  ok("waits after a failure",
     shouldSync(base({ lastFailureAt: NOW - 60_000 })).sync === false);
  ok("tries again after an hour",
     shouldSync(base({ lastFailureAt: NOW - RETRY_AFTER_FAILURE_MS - 1 })).sync === true);
  ok("backoff is longer than the interval", RETRY_AFTER_FAILURE_MS > SYNC_EVERY_MS);
}

console.log("\nthe timer doesn't fire more often than it needs to");
{
  ok("nothing yet means now", msUntilNextSync(base({ lastSyncedAt: null })) === 0);
  ok("counts down from the newest of the two",
     msUntilNextSync(base({ lastSyncedAt: NOW - 60_000, lastAttemptAt: null }))
       === SYNC_EVERY_MS - 60_000);
  ok("never negative",
     msUntilNextSync(base({ lastSyncedAt: NOW - 86_400_000 })) === 0);
  ok("a newer attempt pushes it out",
     msUntilNextSync(base({ lastSyncedAt: NOW - 86_400_000, lastAttemptAt: NOW }))
       === SYNC_EVERY_MS);
}

console.log("\nthe course grade Canvas computes, quoted not derived");
{
  // Absent until the request asks for include[]=total_scores. Without it every
  // course had a name and no grade, so the GPA estimate had nothing to average
  // and rendered nothing at all.
  ok("reads the student's own score", courseScore({ id: "1", name: "Bio", enrollments: [{ type: "student", computed_current_score: 93 }] }) === 93);
  ok("no enrolments is null", courseScore({ id: "1", name: "Bio" }) === null);
  // A teacher hiding totals is legitimate, and a hidden total is not a zero.
  ok("a hidden total is null, not zero", courseScore({ id: "1", name: "Bio", enrollments: [{ type: "student", computed_current_score: null }] }) === null);
  ok("a real zero survives", courseScore({ id: "1", name: "Bio", enrollments: [{ type: "student", computed_current_score: 0 }] }) === 0);
  // A student who is also a TA somewhere has two enrolments.
  ok("prefers the student enrolment", courseScore({ id: "1", name: "Bio", enrollments: [{ type: "ta", computed_current_score: 100 }, { type: "student", computed_current_score: 78 }] }) === 78);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
