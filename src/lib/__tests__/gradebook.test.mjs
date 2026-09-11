import {
  buildGradebook,
  showsPercent,
  gradedSince,
  hasSomethingToShow,
  oneCardPerClass,
  isGraded,
  percentOf,
} from "../gradebook.ts";

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name); }
};

const at = (iso) => new Date(iso);

const row = (over = {}) => ({
  id: "a1",
  course: "AP Biology",
  name: "Ch 5 Quiz",
  category: "Assessment of Learning",
  score: 17,
  pointsPossible: 20,
  status: "GRADED",
  updatedAt: at("2026-09-01T12:00:00Z"),
  ...over,
});

console.log("one assignment's own percentage");
{
  ok("17 of 20 is 85", percentOf({ score: 17, pointsPossible: 20 }) === 85);
  ok("rounds to a tenth", percentOf({ score: 2, pointsPossible: 3 }) === 66.7);
  ok("no score is null", percentOf({ score: null, pointsPossible: 20 }) === null);
  ok("no total is null", percentOf({ score: 17, pointsPossible: null }) === null);
  // Dividing by a zero-point row yields Infinity, which renders as a very
  // confident lie. Extra-credit and placeholder rows really are worth 0.
  ok("zero points is null, not Infinity", percentOf({ score: 5, pointsPossible: 0 }) === null);
  ok("negative points is null", percentOf({ score: 5, pointsPossible: -10 }) === null);
  ok("over 100 survives", percentOf({ score: 22, pointsPossible: 20 }) === 110);
}

console.log("the percentage only appears when it adds something");
{
  // "93/100" and "93%" are the same sentence twice, and a column of repeated
  // figures is what the eye learns to skip.
  ok("out of 100 needs no percentage", showsPercent({ score: 93, pointsPossible: 100 }) === false);
  ok("out of 20 does", showsPercent({ score: 17, pointsPossible: 20 }) === true);
  ok("out of 8 does", showsPercent({ score: 7, pointsPossible: 8 }) === true);
  ok("no score shows nothing", showsPercent({ score: null, pointsPossible: 20 }) === false);
  ok("zero points shows nothing", showsPercent({ score: 5, pointsPossible: 0 }) === false);
}

console.log("only marked work counts as a grade");
{
  ok("graded counts", isGraded({ status: "GRADED" }));
  ok("ungraded does not", !isGraded({ status: "UNGRADED" }));
  ok("missing does not", !isGraded({ status: "MISSING" }));
  ok("excused does not", !isGraded({ status: "EXCUSED" }));
  ok("incomplete does not", !isGraded({ status: "INCOMPLETE" }));
}

console.log("grouping into classes");
{
  const out = buildGradebook([
    row({ id: "1", course: "AP Biology", updatedAt: at("2026-09-01T00:00:00Z") }),
    row({ id: "2", course: "AP Biology", updatedAt: at("2026-09-03T00:00:00Z") }),
    row({ id: "3", course: "Algebra II", updatedAt: at("2026-09-02T00:00:00Z") }),
  ]);

  ok("one entry per class", out.length === 2);
  const bio = out.find((c) => c.course === "AP Biology");
  ok("newest mark first", bio.rows[0].id === "2");
  ok("counts the marked rows", bio.gradedCount === 2);
}

console.log("a course grade is quoted, never computed");
{
  // The real failure this guards: a class with seven graded progress checks
  // and an empty assessment category printed 0.00% in HAC. Anything we
  // derived would have contradicted what the student sees.
  const grades = new Map([["English 2", "0.00"]]);
  const out = buildGradebook(
    [
      row({ course: "English 2", score: 100, pointsPossible: 100 }),
      row({ course: "English 2", id: "b", score: 100, pointsPossible: 100 }),
    ],
    grades,
  );
  ok("quotes the source verbatim", out[0].reportedGrade === "0.00");
  ok("does not average the rows into it", out[0].reportedGrade !== "100");
  ok("no grade is null, not zero", buildGradebook([row()])[0].reportedGrade === null);
  ok("no grade is not the string 'null'", buildGradebook([row()])[0].reportedGrade !== "null");
}

console.log("classes with nothing to say are not shown");
{
  const out = buildGradebook([
    row({ course: "Zoology", status: "UNGRADED", score: null }),
    row({ course: "AP Biology" }),
  ]);
  ok("a class with a mark leads", out[0].course === "AP Biology");
  // Every class is still returned. Filtering here made the whole grades
  // section vanish in September, when every class can be empty, which looked
  // like the feature had been deleted. The card decides what to draw.
  ok("empty classes are still reported", out.length === 2);
  ok("but flagged as having nothing", !hasSomethingToShow(out[1]));
  ok("and the one with a mark is flagged", hasSomethingToShow(out[0]));

  // A posted percentage is worth showing even before any assignment is marked.
  const withGrade = buildGradebook(
    [row({ course: "Zoology", status: "UNGRADED", score: null })],
    new Map([["Zoology", "88.5"]]),
  );
  ok("a posted grade is enough to show", hasSomethingToShow(withGrade[0]));
}

console.log("what is new since you last looked");
{
  const rows = [
    row({ id: "old", updatedAt: at("2026-09-01T00:00:00Z") }),
    row({ id: "new", updatedAt: at("2026-09-05T00:00:00Z") }),
  ];
  const since = at("2026-09-03T00:00:00Z");

  ok("only newer rows", gradedSince(rows, since).length === 1);
  ok("and it is the right one", gradedSince(rows, since)[0].id === "new");
  // First run, or a new device. "47 new grades" on first open is noise.
  ok("never looked means nothing is new", gradedSince(rows, null).length === 0);
  ok("unmarked rows are never news", gradedSince([row({ status: "UNGRADED", updatedAt: at("2026-09-09T00:00:00Z") })], since).length === 0);
  ok("a row exactly at the mark is not new", gradedSince([row({ updatedAt: since })], since).length === 0);
}

console.log("\none card per class, not one per system");
{
  // A real account showed Chemistry twice: HAC's SCI22200A - 6 Chemistry Adv S1
  // at 83.00% and Canvas's Chemistry Adv YR (Whitt, Austin) at 80.02%. Not two
  // classes and not two grades, the same class from two places, fetched at
  // different moments.
  const courses = [
    { course: "SCI22200A - 6 Chemistry Adv S1", fromHac: true, reportedGrade: "83.00", rows: [], gradedCount: 4 },
    { course: "Chemistry Adv YR (Whitt, Austin)", fromHac: false, reportedGrade: "80.02", rows: [], gradedCount: 0 },
    { course: "Frisco ISD 1forAll Student Course 26-27", fromHac: false, reportedGrade: "100", rows: [], gradedCount: 0 },
  ];
  const kept = oneCardPerClass(courses).map((c) => c.course);

  ok("HAC's chemistry stays", kept.includes("SCI22200A - 6 Chemistry Adv S1"));
  ok("the Canvas duplicate goes", !kept.includes("Chemistry Adv YR (Whitt, Austin)"));
  ok("so does the district shell", !kept.includes("Frisco ISD 1forAll Student Course 26-27"));
  ok("exactly one card left", kept.length === 1);

  // Before any HAC sync, nothing is dropped, the failure this codebase keeps
  // repeating is a filter that empties the screen on first use.
  const noHac = oneCardPerClass([
    { course: "Chemistry Adv YR (Whitt, Austin)", fromHac: false, reportedGrade: "80.02", rows: [], gradedCount: 0 },
  ]);
  ok("nothing from HAC keeps everything", noHac.length === 1);
  ok("an empty list stays empty", oneCardPerClass([]).length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
