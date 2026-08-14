import { courseIdFor, planHacSync } from "../hac-store.ts";
import { coursesMatch } from "../assignment-match.ts";

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name); }
};

const row = (over) => ({
  course: "AP Biology",
  name: "Ch 5 Quiz",
  category: "Quizzes",
  assignedOn: "2026-09-02",
  dueOn: "2026-09-08",
  score: 17,
  pointsPossible: 20,
  status: "GRADED",
  ...over,
});

const stored = (over) => ({ id: "a1", ...row(), ...over });

console.log("nothing stored yet");
{
  const plan = planHacSync([], [row()]);
  ok("everything is new", plan.create.length === 1 && plan.update.length === 0);
  ok("nothing unchanged", plan.unchanged === 0);
  ok("nothing missing", plan.missing.length === 0);
}

console.log("\nthe same page again");
{
  const plan = planHacSync([stored()], [row()]);
  // A sync writing three hundred identical rows every ten minutes is how a
  // free database tier gets used up.
  ok("nothing is written", plan.create.length === 0 && plan.update.length === 0);
  ok("counted as unchanged", plan.unchanged === 1);
}

console.log("\na grade appears");
{
  const plan = planHacSync(
    [stored({ score: null, status: "UNGRADED" })],
    [row({ score: 17, status: "GRADED" })],
  );
  ok("it updates rather than duplicating", plan.update.length === 1 && plan.create.length === 0);
  ok("against the stored row's id", plan.update[0].id === "a1");
  ok("carrying the new score", plan.update[0].row.score === 17);
}

console.log("\nwhat identifies a row");
{
  // Teachers move due dates. Keying on one would turn a postponed quiz into a
  // second quiz sitting beside the first.
  const moved = planHacSync([stored()], [row({ dueOn: "2026-09-15" })]);
  ok("a moved due date updates, not duplicates", moved.update.length === 1 && moved.create.length === 0);
  ok("the new date is stored", moved.update[0].row.dueOn === "2026-09-15");

  // "Warm Up" appears every week in some courses. Merging a term of them into
  // one row would erase the set.
  const weekly = planHacSync(
    [stored({ id: "w1", name: "Warm Up", assignedOn: "2026-09-01", dueOn: "2026-09-01" })],
    [
      row({ name: "Warm Up", assignedOn: "2026-09-01", dueOn: "2026-09-01" }),
      row({ name: "Warm Up", assignedOn: "2026-09-08", dueOn: "2026-09-08" }),
    ],
  );
  ok("weekly repeats stay separate", weekly.create.length === 1 && weekly.unchanged === 1);

  const otherCourse = planHacSync([stored()], [row({ course: "World History" })]);
  ok("the same name in another course is another row", otherCourse.create.length === 1);

  ok("case and spacing don't split a row",
     planHacSync([stored()], [row({ name: "  ch 5   QUIZ " })]).unchanged === 1);
}

console.log("\nHAC repeating itself on one page");
{
  const plan = planHacSync([], [row(), row()]);
  // Creating both would produce a duplicate that never resolves, because the
  // next sync would see two stored rows for one key.
  ok("the same row twice is written once", plan.create.length === 1);
}

console.log("\nwork that vanishes from the page");
{
  const plan = planHacSync([stored({ id: "gone" })], []);
  // A teacher hiding a category, or a grading period rolling over, makes work
  // disappear while the grade it carried still counts.
  ok("it is reported", plan.missing.length === 1 && plan.missing[0].id === "gone");
  ok("and not deleted", plan.create.length === 0 && plan.update.length === 0);
}

console.log("\nwhich course a HAC row belongs to");
{
  const courses = [
    { id: "c1", name: "AP Biology" },
    { id: "c2", name: "Algebra II Honors" },
  ];
  ok("exact name wins", courseIdFor("AP Biology", courses, coursesMatch) === "c1");
  // HAC and Canvas name courses differently; this reuses the same matcher the
  // assignment matcher uses rather than inventing a second opinion.
  ok("matches across spellings", courseIdFor("Biology AP 1-2", courses, coursesMatch) === "c1");
  ok("matches the abbreviated one", courseIdFor("Alg II H", courses, coursesMatch) === "c2");
  ok("an unknown class is null", courseIdFor("Ceramics 1", courses, coursesMatch) === null);

  // Two matches means the matcher can't tell them apart, and guessing would
  // file a grade against the wrong class.
  const ambiguous = [
    { id: "x", name: "AP Biology" },
    { id: "y", name: "AP Biology" },
  ];
  ok("ambiguity is refused, not guessed", courseIdFor("Biology AP", ambiguous, coursesMatch) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
