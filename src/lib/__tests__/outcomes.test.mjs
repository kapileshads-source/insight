import { planOutcomes } from "../outcomes.ts";

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name); }
};

const graded = (over) => ({
  id: "asg1",
  courseId: "c1",
  course: "AP Biology",
  name: "Unit 2 Test",
  occurredOn: "2026-09-19",
  score: 82,
  pointsPossible: 100,
  ...over,
});

const outcome = (over) => ({
  id: "o1",
  assignmentId: null,
  source: "MANUAL",
  occurredOn: "2026-09-19",
  percentage: 82,
  subject: "AP Biology",
  ...over,
});

console.log("a graded assignment becomes a score");
{
  const plan = planOutcomes([graded()], []);
  ok("one created", plan.create.length === 1);
  ok("percentage is right", plan.create[0].percentage === 82);
  ok("keeps the assignment it came from", plan.create[0].assignmentId === "asg1");
  ok("keeps the day", plan.create[0].occurredOn === "2026-09-19");
  ok("labels it", plan.create[0].label === "Unit 2 Test");
  ok("subject comes from the course", plan.create[0].subject === "AP Biology");
  ok("keeps the raw points too", plan.create[0].pointsEarned === 82 && plan.create[0].pointsPossible === 100);
}

console.log("\nnever the same test twice");
{
  // The engine averages outcomes, so a duplicate quietly weights one test
  // double and distorts every correlation drawn from it.
  const again = planOutcomes([graded()], [outcome({ id: "o9", assignmentId: "asg1", source: "CANVAS" })]);
  ok("an assignment already recorded is skipped", again.create.length === 0);
  ok("and counted as such", again.skipped.alreadyRecorded === 1);

  // The student typed it in before Canvas caught up.
  const typed = planOutcomes([graded()], [outcome()]);
  ok("a hand-entered match is not duplicated", typed.create.length === 0);
  ok("counted as matched by hand", typed.skipped.matchedByHand === 1);
  ok("and agreeing numbers say nothing", typed.conflicts.length === 0);
}

console.log("\nwhen the two disagree, it asks rather than picking");
{
  const plan = planOutcomes([graded({ score: 91 })], [outcome({ percentage: 82 })]);
  ok("nothing is created", plan.create.length === 0);
  ok("a conflict is raised", plan.conflicts.length === 1);
  ok("carrying what the student typed", plan.conflicts[0].manual === 82);
  ok("and what the gradebook says", plan.conflicts[0].gradebook === 91);
  ok("named so it can be shown", plan.conflicts[0].label === "Unit 2 Test");
  // Rounding differs between gradebooks; 82 for 82.4 is not a disagreement.
  ok("a rounding difference is not a conflict",
     planOutcomes([graded({ score: 82.4 })], [outcome({ percentage: 82 })]).conflicts.length === 0);
}

console.log("\nmatching a hand-entered score to a test");
{
  const nextDay = planOutcomes([graded()], [outcome({ occurredOn: "2026-09-20" })]);
  ok("a day either way is the same test", nextDay.skipped.matchedByHand === 1);
  const nextWeek = planOutcomes([graded()], [outcome({ occurredOn: "2026-09-26" })]);
  ok("a week later is a different one", nextWeek.create.length === 1);

  // "Bio" against "AP Biology" is the same class, and the alternative is
  // double-counting a test.
  ok("subjects match loosely",
     planOutcomes([graded()], [outcome({ subject: "Bio" })]).skipped.matchedByHand === 1);
  ok("a different class is a different test",
     planOutcomes([graded()], [outcome({ subject: "World History" })]).create.length === 1);
  ok("a subjectless manual score doesn't swallow everything",
     planOutcomes([graded()], [outcome({ subject: null })]).create.length === 1);
}

console.log("\nthings that are not assessments");
{
  // Extra credit and ungraded practice both have no points possible, and
  // neither has a percentage.
  const zero = planOutcomes([graded({ pointsPossible: 0 })], []);
  ok("zero points is skipped", zero.create.length === 0 && zero.skipped.noPointsPossible === 1);

  // A 5-point warm-up recorded as 100 is 2000%, and would move a term's
  // average on its own.
  const silly = planOutcomes([graded({ score: 100, pointsPossible: 5 })], []);
  ok("an impossible percentage is refused", silly.create.length === 0 && silly.skipped.implausible === 1);

  // Extra credit that is merely generous is still a real score.
  ok("105% is kept", planOutcomes([graded({ score: 21, pointsPossible: 20 })], []).create.length === 1);

  ok("a negative score is refused",
     planOutcomes([graded({ score: -5 })], []).skipped.implausible === 1);
}

console.log("\nnothing to do");
{
  const empty = planOutcomes([], []);
  ok("no assignments is safe", empty.create.length === 0 && empty.conflicts.length === 0);
  ok("counters start at zero", empty.skipped.alreadyRecorded === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
