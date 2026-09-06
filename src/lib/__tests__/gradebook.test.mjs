import {
  buildGradebook,
  showsPercent,
  gradedSince,
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

console.log("classes with marks come first");
{
  const out = buildGradebook([
    row({ course: "Zoology", status: "UNGRADED", score: null }),
    row({ course: "AP Biology" }),
  ]);
  ok("a class with a mark leads", out[0].course === "AP Biology");
  ok("the empty class still appears", out.length === 2 && out[1].course === "Zoology");
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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
