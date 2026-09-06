import {
  assignmentSummary,
  bucketFor,
  groupAssignments,
  submissionStateFromHac,
} from "../assignments.ts";

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

const NOW = new Date("2026-09-15T14:00:00");
const inDays = (n, hour = 23) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  d.setHours(hour, 59, 0, 0);
  return d;
};

const row = (over) => ({
  id: "a1",
  name: "Chapter 5 Quiz",
  course: "AP Biology",
  dueAt: inDays(0),
  pointsPossible: 20,
  score: null,
  state: "UNSUBMITTED",
  ...over,
});

console.log("which group a piece of work belongs in");
{
  ok("due today", bucketFor(row({ dueAt: inDays(0) }), NOW) === "TODAY");
  ok("due tomorrow", bucketFor(row({ dueAt: inDays(1) }), NOW) === "TOMORROW");
  ok("later this week", bucketFor(row({ dueAt: inDays(4) }), NOW) === "THIS_WEEK");
  ok("beyond a week", bucketFor(row({ dueAt: inDays(20) }), NOW) === "LATER");
  ok("past due", bucketFor(row({ dueAt: inDays(-2) }), NOW) === "OVERDUE");

  // Canvas assignments frequently have no date at all. "No due date" is not
  // "due never", and must not sort to either end of the list.
  ok("no due date gets its own group", bucketFor(row({ dueAt: null }), NOW) === "UNDATED");

  // Missing outranks every date: Canvas only marks work missing once the due
  // date has stopped being the useful fact.
  ok("missing beats its own date", bucketFor(row({ state: "MISSING", dueAt: inDays(-9) }), NOW) === "MISSING");
  ok("missing beats a future date too", bucketFor(row({ state: "MISSING", dueAt: inDays(3) }), NOW) === "MISSING");
}

console.log("\nwork that is done leaves the list");
{
  ok("graded is a score, not a task", bucketFor(row({ state: "GRADED", score: 18 }), NOW) === null);
  ok("submitted is done", bucketFor(row({ state: "SUBMITTED" }), NOW) === null);
  // Handed in late is still handed in. Nagging about it helps nobody.
  ok("late but submitted is done", bucketFor(row({ state: "LATE" }), NOW) === null);
  ok("submitted stays gone even when overdue", bucketFor(row({ state: "SUBMITTED", dueAt: inDays(-5) }), NOW) === null);
}

console.log("\nthe order the list appears in");
{
  const groups = groupAssignments(
    [
      row({ id: "later", dueAt: inDays(12) }),
      row({ id: "today", dueAt: inDays(0) }),
      row({ id: "missing", state: "MISSING", dueAt: inDays(-4) }),
      row({ id: "graded", state: "GRADED" }),
      row({ id: "undated", dueAt: null }),
      row({ id: "overdue", dueAt: inDays(-1) }),
    ],
    NOW,
  );

  const order = groups.map((g) => g.bucket);
  ok("missing comes first, always", order[0] === "MISSING");
  ok("then past due", order[1] === "OVERDUE");
  ok("then today", order[2] === "TODAY");
  // The "No due date" group used to sit at the bottom collecting the term's
  // leftovers, which pushed the dates a student needed off the card. Rows with
  // no date and nothing to place them are now dropped entirely.
  ok("undated is not shown at all", !order.includes("UNDATED"));
  ok("graded work never appears", !groups.some((g) => g.rows.some((r) => r.id === "graded")));
  ok("every group has a readable label", groups.every((g) => g.label.length > 0));
  ok("no empty groups are rendered", groups.every((g) => g.rows.length > 0));
}

console.log("\nwithin a group");
{
  const [group] = groupAssignments(
    [
      row({ id: "warmup", dueAt: inDays(0), pointsPossible: 5 }),
      row({ id: "test", dueAt: inDays(0), pointsPossible: 100 }),
    ],
    NOW,
  );
  // A 100-point test outranks a 5-point warm-up due the same day.
  ok("the bigger thing comes first on the same day", group.rows[0].id === "test");

  const [dated] = groupAssignments(
    [
      row({ id: "friday", dueAt: inDays(5), pointsPossible: 10 }),
      row({ id: "wednesday", dueAt: inDays(3), pointsPossible: 10 }),
    ],
    NOW,
  );
  ok("otherwise the sooner thing comes first", dated.rows[0].id === "wednesday");
}

console.log("\nthe summary line");
{
  const groups = groupAssignments(
    [
      row({ id: "m1", state: "MISSING" }),
      row({ id: "m2", state: "MISSING" }),
      row({ id: "t", dueAt: inDays(0) }),
      row({ id: "l", dueAt: inDays(20) }),
      row({ id: "g", state: "GRADED" }),
    ],
    NOW,
  );
  const summary = assignmentSummary(groups);
  ok("counts what is missing", summary.missing === 2);
  // "42 assignments" is true of every student in the district.
  ok("counts only what is soon", summary.dueSoon === 1);
  ok("totals what is left to do", summary.total === 4);
}

console.log("\nnothing to show");
{
  ok("empty input is safe", groupAssignments([], NOW).length === 0);
  ok("a fully graded course shows nothing", groupAssignments([row({ state: "GRADED" })], NOW).length === 0);
  const summary = assignmentSummary([]);
  ok("the summary survives it", summary.total === 0 && summary.missing === 0);
}

console.log("\nHAC and Canvas speak different languages");
{
  // Without this mapping HAC rows arrived with no state at all, defaulted to
  // unsubmitted, and a test sat weeks ago sat in "Past due" telling the
  // student to go and do it.
  ok("graded is graded", submissionStateFromHac("GRADED") === "GRADED");
  ok("missing is missing", submissionStateFromHac("MISSING") === "MISSING");
  // The question this answers is "is there anything left to do?", and for
  // excused work there isn't.
  ok("excused leaves the list", bucketFor(row({ state: submissionStateFromHac("EXCUSED") }), NOW) === null);
  ok("ungraded is still to do", submissionStateFromHac("UNGRADED") === "UNSUBMITTED");
  ok("anything unexpected is still to do", submissionStateFromHac("WHAT") === "UNSUBMITTED");

  // The failure this guards, end to end.
  const gradedWeeksAgo = row({
    state: submissionStateFromHac("GRADED"),
    dueAt: inDays(-21),
  });
  ok("a graded HAC row never lands in Past due", bucketFor(gradedWeeksAgo, NOW) === null);
}

console.log("\nundated work that was handed out recently");
{
  const key = (n) => {
    const d = new Date(NOW);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  // "No due date" is a pile with no order to it. When it was handed out is the
  // only signal either gradebook gives, so recent work is guessed as current —
  // as a guess, in its own group.
  ok("assigned this week is probably this week",
     bucketFor(row({ dueAt: null, assignedOn: key(-2) }), NOW) === "RECENT");
  ok("assigned a month ago is not",
     bucketFor(row({ dueAt: null, assignedOn: key(-30) }), NOW) === "UNDATED");
  ok("exactly a week still counts",
     bucketFor(row({ dueAt: null, assignedOn: key(-7) }), NOW) === "RECENT");
  // Canvas unlock dates are often in the future.
  ok("unlocking tomorrow counts",
     bucketFor(row({ dueAt: null, assignedOn: key(1) }), NOW) === "RECENT");
  ok("no assigned date is still undated",
     bucketFor(row({ dueAt: null, assignedOn: null }), NOW) === "UNDATED");
  ok("nonsense is undated, not crashed",
     bucketFor(row({ dueAt: null, assignedOn: "soon" }), NOW) === "UNDATED");

  // A real due date always wins; the guess never overrides a fact.
  ok("a due date beats the guess",
     bucketFor(row({ dueAt: inDays(0), assignedOn: key(-1) }), NOW) === "TODAY");

  const groups = groupAssignments(
    [
      row({ id: "later", dueAt: inDays(20) }),
      row({ id: "guessed", dueAt: null, assignedOn: key(-1) }),
      row({ id: "undated", dueAt: null, assignedOn: null }),
    ],
    NOW,
  );
  const order = groups.map((g) => g.bucket);
  ok("the guess sits above Later", order.indexOf("RECENT") < order.indexOf("LATER"));
  // The guess still surfaces work that is probably current; what disappears is
  // the row with no date and no signal at all.
  ok("the guessed row still appears", order.includes("RECENT"));
  ok("the truly undated row does not", !order.includes("UNDATED"));
  ok("it says it is a guess", groups.find((g) => g.bucket === "RECENT").label === "Probably this week");
}

console.log("\nthe module a class is on");
{
  const key = (n) => {
    const d = new Date(NOW);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  // The teacher's own view of where the class is, which beats any inference
  // from a date.
  ok("work in the current unit is current",
     bucketFor(row({ dueAt: null, assignedOn: null, inCurrentModule: true }), NOW) === "RECENT");
  ok("even if it was handed out months ago",
     bucketFor(row({ dueAt: null, assignedOn: key(-90), inCurrentModule: true }), NOW) === "RECENT");
  ok("work outside it falls back to the date",
     bucketFor(row({ dueAt: null, assignedOn: key(-90), inCurrentModule: false }), NOW) === "UNDATED");
  // A real due date is a fact and still wins over both signals.
  ok("a due date still wins",
     bucketFor(row({ dueAt: inDays(12), inCurrentModule: true }), NOW) === "LATER");
}

console.log("\nticked-off work leaves the list");
{
  const groups = groupAssignments(
    [
      row({ id: "done", dueAt: inDays(1), completedAt: new Date() }),
      row({ id: "left", dueAt: inDays(1) }),
    ],
    NOW,
  );
  const ids = groups.flatMap((g) => g.rows.map((r) => r.id));
  ok("the finished one is gone", !ids.includes("done"));
  ok("the unfinished one stays", ids.includes("left"));

  // Un-ticking has to bring it back, or the button is a one-way door.
  const back = groupAssignments([row({ id: "done", dueAt: inDays(1), completedAt: null })], NOW);
  ok("un-ticking restores it", back.flatMap((g) => g.rows).length === 1);

  // Missing work that has been handed in should stop being chased too.
  const missing = groupAssignments(
    [row({ id: "m", dueAt: inDays(-3), state: "MISSING", completedAt: new Date() })],
    NOW,
  );
  ok("even overdue work leaves once ticked", missing.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
