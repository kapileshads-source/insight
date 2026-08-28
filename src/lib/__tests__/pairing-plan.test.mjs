import { planPairings } from "../pairing-plan.ts";

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name); }
};

const d = (s) => new Date(`${s}T00:00:00Z`);
const canvas = [
  { id: "c1", course: "AP Biology", title: "Unit 2 Test", dueAt: d("2026-09-19"), points: 100, score: 82 },
  { id: "c2", course: "AP Biology", title: "Chapter 5 Quiz", dueAt: d("2026-09-08"), points: 20, score: 17 },
];
const hac = [
  { id: "h1", course: "Biology AP 1-2", title: "Unit 2 Test", dueAt: d("2026-09-19"), points: 100, score: 82 },
  { id: "h2", course: "Biology AP 1-2", title: "Ch 5 Quiz", dueAt: d("2026-09-08"), points: 20, score: 17 },
  { id: "h3", course: "Biology AP 1-2", title: "Unit 2 Test Retake", dueAt: d("2026-09-26"), points: 100, score: 94 },
];

console.log("confident pairings are made without asking");
{
  const plan = planPairings(canvas, hac, [], []);
  const pairs = plan.autoLink.map((p) => `${p.canvasId}:${p.hacId}`);
  ok("Unit 2 Test pairs itself", pairs.includes("c1:h1"));
  ok("the quiz pairs across spellings", pairs.includes("c2:h2"));
  // A queue of obvious yes/no questions is a queue nobody finishes.
  ok("nothing obvious is sent for review", plan.review.length === 0);
  // The trap the matcher exists for.
  ok("the retake is never paired", !pairs.includes("c1:h3"));
}

console.log("\nwhat is already settled stays settled");
{
  const linked = planPairings(canvas, hac, [{ canvasAssignmentId: "c1", hacAssignmentId: "h1" }], []);
  const pairs = linked.autoLink.map((p) => `${p.canvasId}:${p.hacId}`);
  ok("an existing link is not offered again", !pairs.includes("c1:h1"));
  ok("the rest still pairs", pairs.includes("c2:h2"));
}

console.log("\na refusal is about the combination, not the rows");
{
  // "Unit 2 Test is not Unit 2 Test Retake" must not stop Unit 2 Test finding
  // the row it really matches.
  const plan = planPairings(canvas, hac, [], [{ canvasAssignmentId: "c1", hacAssignmentId: "h3" }]);
  const pairs = plan.autoLink.map((p) => `${p.canvasId}:${p.hacId}`);
  ok("the refused pair is gone", !pairs.includes("c1:h3"));
  ok("the row is still free to pair correctly", pairs.includes("c1:h1"));

  const refusedReal = planPairings(canvas, hac, [], [{ canvasAssignmentId: "c1", hacAssignmentId: "h1" }]);
  ok("refusing a real match removes it",
     !refusedReal.autoLink.concat(refusedReal.review).some((p) => p.canvasId === "c1" && p.hacId === "h1"));
}

console.log("\nnothing to do");
{
  const empty = planPairings([], [], [], []);
  ok("empty is safe", empty.autoLink.length === 0 && empty.review.length === 0);
  ok("no HAC rows means no pairings", planPairings(canvas, [], [], []).autoLink.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
