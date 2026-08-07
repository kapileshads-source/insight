import {
  coursesMatch,
  matchAssignments,
  scorePair,
  titleSimilarity,
} from "../assignment-match.ts";

/**
 * The stakes here are lopsided, and the tests are written to match.
 *
 * A missed match shows a student two rows where they expected one, and they
 * can see that. A wrong match silently averages two different tests into one
 * grade, which nobody notices and which corrupts every correlation drawn on
 * top of it. So most of what follows is about refusing to match.
 */

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

const day = (iso) => new Date(iso);

const make = (id, course, title, extra = {}) => ({
  id,
  course,
  title,
  ...extra,
});

console.log("titles reduce to the same words teachers meant");
ok("abbreviated chapter matches spelled out",
  titleSimilarity("Ch 5 Quiz", "Chapter 5 Quiz") === 1);
ok("punctuation and case are irrelevant",
  titleSimilarity("Unit 3: Test!", "unit 3 test") === 1);
ok("homework abbreviations expand",
  titleSimilarity("HW 4", "Homework 4") === 1);
ok("unrelated titles score low",
  titleSimilarity("Lab Report", "Vocabulary Quiz") === 0);

console.log("\ncourses have to line up first");
ok("same course, different spelling", coursesMatch("AP Biology", "Biology AP"));
ok("honors is not the on-level course",
  !coursesMatch("Algebra 2 Honors", "Algebra 2"));
ok("AP is not the on-level course", !coursesMatch("AP Biology", "Biology"));
ok("different subjects never match", !coursesMatch("Biology", "Chemistry"));
ok("a different course number does not match",
  !coursesMatch("Spanish 2", "Spanish 3"));

console.log("\nthe things that must never be merged");
{
  const base = { dueAt: day("2026-09-10"), points: 100 };

  ok("a retake is not the original", scorePair(
    make("c", "Biology", "Unit 2 Test", base),
    make("h", "Biology", "Unit 2 Test Retake", base),
  ) === null);

  ok("corrections are not the original", scorePair(
    make("c", "Biology", "Unit 2 Test", base),
    make("h", "Biology", "Unit 2 Test Corrections", base),
  ) === null);

  ok("unit 2 is not unit 3", scorePair(
    make("c", "Biology", "Unit 2 Test", base),
    make("h", "Biology", "Unit 3 Test", base),
  ) === null);

  ok("a 20-point quiz is not a 100-point test", scorePair(
    make("c", "Biology", "Chapter 5 Quiz", { dueAt: day("2026-09-10"), points: 20 }),
    make("h", "Biology", "Chapter 5 Quiz", { dueAt: day("2026-09-10"), points: 100 }),
  ) === null);

  ok("a fortnight apart is not the same assignment", scorePair(
    make("c", "Biology", "Chapter 5 Quiz", { dueAt: day("2026-09-10") }),
    make("h", "Biology", "Chapter 5 Quiz", { dueAt: day("2026-10-01") }),
  ) === null);

  ok("the same title in a different class is not a match", scorePair(
    make("c", "Biology", "Quiz 3", base),
    make("h", "Chemistry", "Quiz 3", base),
  ) === null);
}

console.log("\nwhat is confidently the same thing");
{
  const strong = scorePair(
    make("c", "Biology", "Ch 5 Quiz", {
      dueAt: day("2026-09-10"),
      points: 20,
      score: 18,
    }),
    make("h", "Biology", "Chapter 5 Quiz", {
      dueAt: day("2026-09-10"),
      points: 20,
      score: 18,
    }),
  );
  ok("everything agrees", strong !== null && strong.confidence >= 0.75);
  ok("it can say why", strong.reasons.length >= 3);

  const dated = scorePair(
    make("c", "Biology", "Chapter 5 Quiz", { dueAt: day("2026-09-10") }),
    make("h", "Biology", "Ch 5 Quiz", { dueAt: day("2026-09-10") }),
  );
  ok("same name, same day, no numbers known", dated.confidence >= 0.75);
}

console.log("\nwhat gets asked about rather than assumed");
{
  const bare = scorePair(
    make("c", "Biology", "Lab Report"),
    make("h", "Biology", "Lab Report"),
  );
  ok("an identical title alone is never enough to link",
    bare !== null && bare.confidence < 0.75);
  ok("but it is worth asking about", bare.confidence >= 0.45);

  const partial = scorePair(
    make("c", "Biology", "Lab Report", { dueAt: day("2026-09-10") }),
    make("h", "Biology", "Lab Report Rough Draft", { dueAt: day("2026-09-10") }),
  );
  ok("a partial name overlap lands in review",
    partial.confidence >= 0.45 && partial.confidence < 0.75);
}

console.log("\npairing up two whole gradebooks");
{
  const canvas = [
    make("c1", "Biology", "Ch 5 Quiz", { dueAt: day("2026-09-10"), points: 20 }),
    make("c2", "Biology", "Unit 2 Test", { dueAt: day("2026-09-18"), points: 100 }),
    make("c3", "Biology", "Reading Notes", { dueAt: day("2026-09-22") }),
  ];
  const hac = [
    make("h1", "Biology", "Chapter 5 Quiz", { dueAt: day("2026-09-10"), points: 20 }),
    make("h2", "Biology", "Unit 2 Test", { dueAt: day("2026-09-18"), points: 100 }),
    make("h3", "Biology", "Warm Up 9/8", { dueAt: day("2026-09-08"), points: 5 }),
  ];

  const result = matchAssignments(canvas, hac);

  ok("the two obvious pairs link", result.linked.length === 2);
  ok("the quiz pairs correctly",
    result.linked.some((p) => p.canvasId === "c1" && p.hacId === "h1"));
  ok("what only Canvas knows survives", result.canvasOnly.includes("c3"));
  ok("what only HAC knows survives — the point of the exercise",
    result.hacOnly.includes("h3"));
  ok("nothing is both matched and left over",
    !result.canvasOnly.includes("c1") && !result.hacOnly.includes("h1"));
}

console.log("\none assignment is never spent twice");
{
  const canvas = [
    make("c1", "Biology", "Quiz", { dueAt: day("2026-09-10"), points: 20 }),
  ];
  const hac = [
    make("h1", "Biology", "Quiz", { dueAt: day("2026-09-10"), points: 20 }),
    make("h2", "Biology", "Quiz", { dueAt: day("2026-09-11"), points: 20 }),
  ];

  const result = matchAssignments(canvas, hac);
  const claimed = [...result.linked, ...result.review];

  ok("only one pairing is offered", claimed.length === 1);
  ok("it is the closer of the two", claimed[0].hacId === "h1");
  ok("the loser stands on its own", result.hacOnly.includes("h2"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
