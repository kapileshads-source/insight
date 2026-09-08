import {
  outcomesFromMarkedWork,
  mergeOutcomes,
  percentOfWork,
  MIN_POINTS,
} from "../graded-work.ts";

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name); }
};

const work = (over = {}) => ({
  id: "a", course: "Chemistry", name: "Unit 3 Test", category: "Assessments",
  score: 45, pointsPossible: 50, dueAt: new Date("2026-09-01"),
  updatedAt: new Date("2026-09-08"), ...over,
});

console.log("percentages");
ok("straightforward", percentOfWork(work()) === 90);
ok("extra credit above 100 is kept", percentOfWork(work({ score: 52, pointsPossible: 50 })) === 104);
ok("a broken points-possible is dropped", percentOfWork(work({ score: 9, pointsPossible: 1 })) === null);
ok("zero points possible is dropped", percentOfWork(work({ pointsPossible: 0 })) === null);
ok("ungraded is dropped", percentOfWork(work({ score: null })) === null);

console.log("\nwhat counts as an assessment");
const only = (rows) => outcomesFromMarkedWork(rows).outcomes;
ok("a small warm-up is left out",
  only([work({ category: "Progress Checks", pointsPossible: 2, score: 2 })]).length === 0);
ok("a small quiz is kept anyway",
  only([work({ category: "Quiz", pointsPossible: 10, score: 9 })]).length === 1);
ok(`an uncategorised ${MIN_POINTS}-pointer is kept`,
  only([work({ category: null, pointsPossible: MIN_POINTS, score: 18 })]).length === 1);
ok("an uncategorised 5-pointer is not",
  only([work({ category: null, pointsPossible: 5, score: 5 })]).length === 0);
ok("the excluded count is reported",
  outcomesFromMarkedWork([
    work({ id: "1", category: "Homework", pointsPossible: 5, score: 5 }),
    work({ id: "2" }),
  ]).excludedAsMinor === 1);

console.log("\ndates");
// The bug that would have ruined the feature silently: on a first sync every
// row shares one updatedAt, so using it would stack a whole term on one day.
const synced = new Date("2026-09-08");
const rows = [
  work({ id: "1", dueAt: new Date("2026-08-20"), updatedAt: synced }),
  work({ id: "2", dueAt: new Date("2026-09-03"), updatedAt: synced }),
];
const dates = only(rows).map((o) => o.occurredOn.getTime());
ok("uses the due date, not the sync time", new Set(dates).size === 2);
ok("and not one of them is the sync time",
  dates.every((d) => d !== synced.getTime()));
ok("undated work is dropped rather than guessed",
  only([work({ dueAt: null })]).length === 0);
ok("and counted", outcomesFromMarkedWork([work({ dueAt: null })]).excludedUndated === 1);

console.log("\nsubject");
ok("carries the course, which the cross-subject gate counts",
  only([work()])[0].subject === "Chemistry");

console.log("\nmerging with typed scores");
const typed = [{ id: "t", occurredOn: new Date("2026-09-01"), percentage: 88, subject: "Chemistry" }];
const derived = only([work()]);
ok("same subject and day is not counted twice",
  mergeOutcomes(typed, derived).length === 1);
ok("and the typed one is what survives",
  mergeOutcomes(typed, derived)[0].percentage === 88);
ok("a different day is kept",
  mergeOutcomes(typed, only([work({ dueAt: new Date("2026-09-05") })])).length === 2);
ok("a different subject is kept",
  mergeOutcomes(typed, only([work({ course: "English" })])).length === 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
