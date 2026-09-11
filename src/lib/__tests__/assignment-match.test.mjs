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
  ok("what only HAC knows survives, the point of the exercise",
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

console.log("\na semester of two teachers typing the same things");
{
  // Precision was never the problem, the retake and Unit 3/Unit 4 traps were
  // always caught. Recall was: four of nine real assignments went unmatched,
  // and the course name was the culprit every time. "Alg II H" was vetoed
  // against "Algebra II Honors" because "h" and "honors" read as different
  // levels, and "World Hist" scored 0.33 against "World History".
  const d = (s) => new Date(`${s}T00:00:00Z`);
  const canvas = [
    { id: "c1", course: "AP Biology", title: "Chapter 5 Quiz", dueAt: d("2026-09-08"), points: 20, score: 17 },
    { id: "c2", course: "AP Biology", title: "Unit 2 Test", dueAt: d("2026-09-19"), points: 100, score: 82 },
    { id: "c3", course: "Algebra II Honors", title: "Homework 3.4", dueAt: d("2026-09-10"), points: 10, score: 10 },
    { id: "c4", course: "Algebra II Honors", title: "Quiz: Quadratics", dueAt: d("2026-09-17"), points: 25, score: 21 },
    { id: "c5", course: "World History", title: "Cold War Essay", dueAt: d("2026-09-22"), points: 50, score: 44 },
    { id: "c7", course: "Algebra II Honors", title: "Unit 3 Test", dueAt: d("2026-10-02"), points: 100, score: 71 },
    { id: "c8", course: "World History", title: "Chapter 4 Reading Check", dueAt: d("2026-09-11"), points: 15, score: 13 },
  ];
  const hac = [
    { id: "h1", course: "Biology AP 1-2", title: "Ch 5 Quiz", dueAt: d("2026-09-08"), points: 20, score: 17 },
    { id: "h2", course: "Biology AP 1-2", title: "Unit 2 Test", dueAt: d("2026-09-19"), points: 100, score: 82 },
    { id: "h3", course: "Biology AP 1-2", title: "Unit 2 Test Retake", dueAt: d("2026-09-26"), points: 100, score: 94 },
    { id: "h4", course: "Alg II H", title: "HW 3.4", dueAt: d("2026-09-10"), points: 10, score: 10 },
    { id: "h5", course: "Alg II H", title: "Quadratics Quiz", dueAt: d("2026-09-17"), points: 25, score: 21 },
    { id: "h6", course: "World Hist", title: "Cold War Essay", dueAt: d("2026-09-23"), points: 50, score: 44 },
    { id: "h8", course: "Alg II H", title: "Unit 4 Test", dueAt: d("2026-10-02"), points: 100, score: 71 },
    { id: "h9", course: "World Hist", title: "Ch 4 Reading Check", dueAt: d("2026-09-11"), points: 15, score: 13 },
  ];

  const result = matchAssignments(canvas, hac);
  const linked = new Set(result.linked.map((p) => `${p.canvasId}:${p.hacId}`));
  const any = new Set([...result.linked, ...result.review].map((p) => `${p.canvasId}:${p.hacId}`));

  ok("links across Ch / Chapter", linked.has("c1:h1"));
  ok("links Unit 2 Test to Unit 2 Test", linked.has("c2:h2"));
  ok("links HW 3.4 across Alg II H and Algebra II Honors", linked.has("c3:h4"));
  ok("links a quiz whose words are reversed", linked.has("c4:h5"));
  ok("links across World Hist and World History", linked.has("c5:h6"));
  ok("links a reading check across both", linked.has("c8:h9"));

  ok("still never merges a test with its retake", !any.has("c2:h3"));
  ok("still never merges Unit 3 with Unit 4", !any.has("c7:h8"));
  ok("leaves the retake standing alone", result.hacOnly.includes("h3"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
