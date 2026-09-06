import { looksLikeUnitName, currentModule } from "../modules.ts";

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name); }
};

const mod = (over) => ({
  id: "m1", name: "Unit 1: Cells", position: 1, state: "completed", items: [], ...over,
});

console.log("which unit the class is on");
{
  // The strongest signal Canvas gives: the student has opened something in it.
  const started = currentModule([
    mod({ id: "a", name: "Unit 1", position: 1, state: "completed" }),
    mod({ id: "b", name: "Unit 2", position: 2, state: "started" }),
    mod({ id: "c", name: "Unit 3", position: 3, state: "unlocked" }),
  ]);
  ok("a started module wins", started.name === "Unit 2");

  // Teachers unlock modules as the term moves, so the earliest open one is
  // where the class is.
  const unlocked = currentModule([
    mod({ id: "a", name: "Unit 1", position: 1, state: "completed" }),
    mod({ id: "b", name: "Unit 2", position: 2, state: "unlocked" }),
    mod({ id: "c", name: "Unit 3", position: 3, state: "unlocked" }),
  ]);
  ok("otherwise the first unlocked one", unlocked.name === "Unit 2");

  ok("position beats list order", currentModule([
    mod({ id: "b", name: "Later", position: 5, state: "unlocked" }),
    mod({ id: "a", name: "Earlier", position: 2, state: "unlocked" }),
  ]).name === "Earlier");
}

console.log("\nwhen there is no answer");
{
  // Saying nothing is better than naming a unit the class isn't on.
  ok("everything locked gives nothing",
     currentModule([mod({ state: "locked" }), mod({ id: "m2", state: "locked" })]) === null);
  ok("everything finished gives nothing",
     currentModule([mod({ state: "completed" })]) === null);
  ok("no modules at all is safe", currentModule([]) === null);
  // Canvas allows unnamed modules and they read as blank lines.
  ok("unnamed modules are skipped",
     currentModule([mod({ name: "  ", state: "unlocked" })]) === null);
  // A course with no module states set at all still gets an answer.
  ok("missing state counts as open",
     currentModule([mod({ name: "Unit 4", state: undefined })]).name === "Unit 4");
}

console.log("\nthe assignments inside it");
{
  const chosen = currentModule([
    mod({
      id: "b", name: "Unit 2: Stoichiometry", position: 2, state: "started",
      items: [
        { type: "Assignment", content_id: "101" },
        { type: "Page", content_id: "202" },
        { type: "Assignment", content_id: "103" },
        { type: "Assignment" },
      ],
    }),
  ]);
  ok("collects the assignments", chosen.assignmentIds.join(",") === "101,103");
  // Pages, files and ungraded quizzes are not work with a due date.
  ok("ignores everything that isn't one", !chosen.assignmentIds.includes("202"));
  ok("ignores an item with no id", chosen.assignmentIds.length === 2);
  ok("keeps the name whole", chosen.name === "Unit 2: Stoichiometry");
}

console.log("\nmodule names that are teachers talking, not units");
{
  // Seen on a real Frisco account. Rendered under "What your classes are on"
  // it was a sentence pretending to be a heading.
  ok("a sentence is not a unit", looksLikeUnitName("Flashing Lights - Complete each task earn credit for this course.") === false);
  ok("a unit is a unit", looksLikeUnitName("Unit 3: Kinematics") === true);
  ok("a short module is fine", looksLikeUnitName("Module 5") === true);
  ok("trailing punctuation is fine", looksLikeUnitName("Unit 1.") === true);
  ok("mid-sentence punctuation is not", looksLikeUnitName("Read this. Then do that") === false);
  ok("very long is not", looksLikeUnitName("A".repeat(60)) === false);
  ok("many words is not", looksLikeUnitName("one two three four five six seven eight nine") === false);
  ok("blank is not", looksLikeUnitName("   ") === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
