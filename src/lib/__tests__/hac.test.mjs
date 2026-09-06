import { columnIndex, parseHacDate, parseScore, readPage, readTable } from "../hac.ts";

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name); }
};

const HEADERS = ["Date Due", "Date Assigned", "Assignment", "Category", "Score", "Total Points"];

const table = (over) => ({
  course: "AP Biology",
  grade: "94.5",
  lastUpdated: "12/8/2026",
  headers: HEADERS,
  rows: [["9/8/2026", "9/2/2026", "Ch 5 Quiz", "Quizzes", "17", "20"]],
  names: ["Ch 5 Quiz"],
  ...over,
});

console.log("columns are found by label, not position");
{
  ok("finds score", columnIndex(HEADERS, "score") === 4);
  ok("finds due date", columnIndex(HEADERS, "dueOn") === 0);
  ok("finds total points", columnIndex(HEADERS, "pointsPossible") === 5);

  // The whole point: a campus turns on a column and everything still lands.
  const shifted = ["Assignment", "Category", "Date Due", "Date Assigned", "Score", "Total Points"];
  ok("survives a reordered table", columnIndex(shifted, "dueOn") === 2);
  const extra = ["Date Due", "Rubric", "Date Assigned", "Assignment", "Category", "Score", "Total Points"];
  ok("survives an inserted column", columnIndex(extra, "score") === 5);

  // "Score" must not be won by "Score Type" just because it came first.
  ok("prefers an exact label", columnIndex(["Score Type", "Score"], "score") === 1);

  ok("case and spacing don't matter", columnIndex(["  DATE   DUE "], "dueOn") === 0);
  // A table with no Category column should give no category, not a wrong one.
  ok("a missing column is -1", columnIndex(["Date Due", "Score"], "category") === -1);
}

console.log("\nscore cells carry meaning beyond the number");
{
  ok("a number is a number", parseScore("17").score === 17);
  ok("decimals survive", parseScore("4.5").score === 4.5);
  ok("percent signs are stripped", parseScore("85%").score === 85);
  ok("takes the earned half of 85 / 100", parseScore("85 / 100").score === 85);

  // Parsing these as zero would invent failures the student never had.
  ok("M is missing, not zero", parseScore("M").status === "MISSING" && parseScore("M").score === null);
  ok("Z is excused, not zero", parseScore("Z").status === "EXCUSED" && parseScore("Z").score === null);
  ok("blank is ungraded, not zero", parseScore("").status === "UNGRADED" && parseScore("").score === null);
  // Seen on a real Frisco gradebook, 2026-09-05. The danger is not that it
  // becomes UNGRADED — that is harmless — but that some later "strip the
  // letters and take the digits" change turns it into a score.
  ok("INS is incomplete, not zero", parseScore("INS").status === "INCOMPLETE" && parseScore("INS").score === null);
  ok("INS is not read as a number", parseScore("INS").score === null);
  ok("whitespace is still blank", parseScore("   ").status === "UNGRADED");
  ok("undefined is safe", parseScore(undefined).score === null);
  ok("nonsense is ungraded", parseScore("see teacher").status === "UNGRADED");
  ok("graded says so", parseScore("100").status === "GRADED");
}

console.log("\ndates stay calendar dates");
{
  ok("parses a HAC date", parseHacDate("9/8/2026") === "2026-09-08");
  ok("pads single digits", parseHacDate("1/2/2027") === "2027-01-02");
  ok("handles two-digit years", parseHacDate("9/8/26") === "2026-09-08");
  // HAC sometimes uses "+" where a space should be.
  ok("survives the plus-for-space quirk", parseHacDate("(as+of+9/8/2026)") === "2026-09-08");
  ok("blank is null", parseHacDate("") === null);
  ok("nonsense is null", parseHacDate("soon") === null);
  ok("rejects an impossible month", parseHacDate("13/40/2026") === null);
}

console.log("\nreading a course table");
{
  const { assignments, usedFallback } = readTable(table());
  ok("one assignment", assignments.length === 1);
  ok("keeps the course", assignments[0].course === "AP Biology");
  ok("name comes from the row's link", assignments[0].name === "Ch 5 Quiz");
  ok("score", assignments[0].score === 17);
  ok("points possible", assignments[0].pointsPossible === 20);
  ok("category", assignments[0].category === "Quizzes");
  ok("due date", assignments[0].dueOn === "2026-09-08");
  ok("assigned date", assignments[0].assignedOn === "2026-09-02");
  ok("headers were used", usedFallback === false);
}

console.log("\ntotals rows are not assignments");
{
  // In HAC these sit at the bottom of each category. Counting them would
  // double every grade in the course.
  const { assignments } = readTable(table({
    rows: [
      ["9/8/2026", "9/2/2026", "Ch 5 Quiz", "Quizzes", "17", "20"],
      ["", "", "", "Quizzes", "17", "20"],
    ],
    names: ["Ch 5 Quiz", null],
  }));
  ok("the totals row is dropped", assignments.length === 1);
}

console.log("\nno header row is a guess, and it says so");
{
  const { assignments, usedFallback } = readTable(table({ headers: [] }));
  ok("it still reads", assignments.length === 1 && assignments[0].score === 17);
  // A silent guess here is the exact failure this file exists to avoid.
  ok("and admits it guessed", usedFallback === true);
}

console.log("\nthe whole page");
{
  const { assignments, usedFallback } = readPage([
    table(),
    table({ course: "Algebra II H", headers: [], names: ["HW 3.4"],
            rows: [["9/10/2026", "9/9/2026", "HW 3.4", "Homework", "10", "10"]] }),
  ]);
  ok("collects every course", assignments.length === 2);
  ok("courses stay attached", assignments[1].course === "Algebra II H");
  // One guessed table taints the page: the caller has to know.
  ok("one fallback marks the page", usedFallback === true);

  ok("an empty page is safe", readPage([]).assignments.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
