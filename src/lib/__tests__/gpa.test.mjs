import {
  estimateGpa,
  cumulativeGpa,
  levelOfTranscriptCourse,
  onlyEnrolled,
  presentGpa,
  hasUsableGrade,
  levelOf,
  looksNonAcademic,
  unweightedPoints,
  weightedPoints,
} from "../gpa.ts";

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name); }
};

console.log("weighted points: a tenth per percent, from the level's maximum");
{
  ok("AP 100 is 6.0", weightedPoints(100, "AP") === 6);
  ok("AP 90 is 5.0", weightedPoints(90, "AP") === 5);
  ok("Advanced 100 is 5.5", weightedPoints(100, "ADVANCED") === 5.5);
  ok("Advanced 93 is 4.8", weightedPoints(93, "ADVANCED") === 4.8);
  ok("on-level 100 is 5.0", weightedPoints(100, "ON_LEVEL") === 5);
  ok("on-level 88 is 3.8", weightedPoints(88, "ON_LEVEL") === 3.8);
  // Otherwise a 40 in an on-level class scores −1.0 and drags the mean below
  // anything a transcript could print.
  ok("never negative", weightedPoints(20, "ON_LEVEL") === 0);
}

console.log("\nunweighted is letter-based, NOT per-percent");
{
  // The whole reason this is a separate function. Applying the weighted rule
  // with a 4.0 cap gave 3.2312 against a real transcript's 3.7780.
  ok("90 is an A", unweightedPoints(90) === 4);
  ok("89 is a B", unweightedPoints(89) === 3);
  ok("100 is still 4.0, not more", unweightedPoints(100) === 4);
  ok("a 98 and a 91 score the same", unweightedPoints(98) === unweightedPoints(91));
  ok("80 is a B", unweightedPoints(80) === 3);
  ok("70 is a C", unweightedPoints(70) === 2);
  ok("59 is nothing", unweightedPoints(59) === 0);
}

console.log("\nreproducing a real transcript");
{
  // Kapilesh's 2025-26, grade 9. The printed figures are 4.6940 weighted and
  // 3.7780 on the 4.0 scale. This pins how close the formulas get, so that if
  // anyone tunes them the drift is visible rather than silent.
  const courses = [
    { id: "1", title: "COMPMTN", level: "ADVANCED", grades: [98, 88] },
    { id: "2", title: "BIO", level: "ON_LEVEL", grades: [93, 83] },
    { id: "3", title: "APCSPRIN", level: "AP", grades: [91, 87] },
    { id: "4", title: "APHUMGEOW", level: "AP", grades: [92, 90] },
    { id: "5", title: "TA3DMA", level: "ADVANCED", grades: [94, 96] },
    { id: "6", title: "ENG 1", level: "ON_LEVEL", grades: [93, 91] },
    { id: "7", title: "GEOM", level: "ON_LEVEL", grades: [88, 94] },
    { id: "8", title: "SBLIFE", level: "ADVANCED", grades: [99, 100] },
  ];
  const out = estimateGpa(courses);

  ok("sixteen semester grades counted", out.counted === 16);
  // Within a twentieth of the printed 4.6940. The residual is which courses
  // are really Advanced, not the formula.
  ok("weighted lands near the real 4.6940", Math.abs(out.weighted - 4.694) < 0.05);
  // Within a twentieth of the printed 3.7780 — where the per-percent rule was
  // out by more than half a point.
  ok("unweighted lands near the real 3.7780", Math.abs(out.unweighted - 3.778) < 0.05);
  ok("and the two scales differ", out.weighted > out.unweighted);
}

console.log("\ncourse level from the title");
{
  ok("AP is AP", levelOf("AP Pre Calculus S1 - C Lunch") === "AP");
  ok("AP Seminar is AP", levelOf("AP Seminar S1") === "AP");
  ok("Adv is Advanced", levelOf("Computer Science 1 Adv S1 - A Lunch") === "ADVANCED");
  ok("Honors is Advanced", levelOf("Chemistry Honors") === "ADVANCED");
  ok("dual credit is Advanced", levelOf("US History Dual Credit") === "ADVANCED");
  ok("PLTW is Advanced", levelOf("PLTW Intro Engr Des S1@CTEC") === "ADVANCED");
  ok("plain is on-level", levelOf("Social Studies Research S1") === "ON_LEVEL");

  // Substrings betray you here. A course wrongly promoted to AP inflates a GPA
  // silently, and the student cannot see it happen.
  ok("Capstone is not AP", levelOf("Capstone Project") === "ON_LEVEL");
  ok("Graphic is not AP", levelOf("Graphic Design") === "ON_LEVEL");
  ok("Advisory is not Advanced", levelOf("Advisory") === "ON_LEVEL");
}

console.log("\nwhat should not count toward a GPA");
{
  ok("compliance courses do not", looksNonAcademic("CHS Flashing Lights"));
  ok("advisory does not", looksNonAcademic("Advisory"));
  ok("a tech waiver does not", looksNonAcademic("Tech Waiver"));

  // The bug this caught in its own first draft: Frisco writes the lunch wave
  // into real course titles, so matching "lunch" excluded an AP class and
  // quietly lowered the GPA.
  ok("a class with a lunch wave still counts", !looksNonAcademic("AP Pre Calculus S1 - C Lunch"));
  ok("so does the other one", !looksNonAcademic("Computer Science 1 Adv S1 - A Lunch"));
  ok("a normal class counts", !looksNonAcademic("AP Biology"));
}

console.log("\nHAC is the roll of what you actually take");
{
  const courses = [
    { title: "SCI22200A - 6 Chemistry Adv S1", fromHac: true },
    // Same class, from Canvas, at a slightly different figure because the two
    // were fetched at different moments. A student saw Chemistry twice.
    { title: "Chemistry Adv YR (Whitt, Austin)", fromHac: false },
    { title: "Frisco ISD 1forAll Student Course 26-27", fromHac: false },
  ];
  const kept = onlyEnrolled(courses).map((c) => c.title);

  ok("the HAC class stays", kept.includes("SCI22200A - 6 Chemistry Adv S1"));
  ok("its Canvas twin goes", !kept.includes("Chemistry Adv YR (Whitt, Austin)"));
  ok("the district shell goes", !kept.includes("Frisco ISD 1forAll Student Course 26-27"));
  ok("exactly one left", kept.length === 1);

  // A class HAC matched onto an existing Canvas row is still on the roll — the
  // sync marks it when it writes the grade. PLTW is this case, and reading it
  // wrong made a whole class vanish from a GPA.
  const matched = onlyEnrolled([
    { title: "PLTW Intro Engr Des (EZZEDINE)", fromHac: true },
    { title: "Cen10 Titans Info", fromHac: false },
  ]);
  ok("a matched Canvas row survives", matched.length === 1);
  ok("and it is the right one", matched[0].title === "PLTW Intro Engr Des (EZZEDINE)");

  // The failure this codebase keeps repeating: a filter correct in steady
  // state and wrong on first use.
  ok("nothing from HAC keeps everything", onlyEnrolled([{ title: "x", fromHac: false }]).length === 1);
  ok("an empty list stays empty", onlyEnrolled([]).length === 0);
}

console.log("\ndistrict shells are not classes");
{
  ok("1forAll is not a class", looksNonAcademic("Frisco ISD 1forAll Student Course 26-27"));
  ok("Titans Info is not a class", looksNonAcademic("Cen10 Titans Info"));
  ok("advisory is not a class", looksNonAcademic("10th Grade Advisory (Graham, Justin)"));
  ok("chemistry is", !looksNonAcademic("Chemistry Adv YR (Whitt, Austin)"));
  ok("AP Seminar is", !looksNonAcademic("AP Seminar YR (Saunders, Arthur)"));
}

console.log("\na course reading 0% has not been graded, it has failed nothing");
{
  // Frisco prints 0.00% for a class whose assessment category is empty, while
  // it holds a page of marked progress checks. Counting it turned a real
  // student's estimate into 3.000 when the truth was 4.700.
  ok("zero is not usable", hasUsableGrade(0) === false);
  ok("a real grade is", hasUsableGrade(86) === true);
  ok("null is not", hasUsableGrade(null) === false);
  ok("negative is not", hasUsableGrade(-5) === false);
  ok("NaN is not", hasUsableGrade(NaN) === false);
  ok("a genuine 1% still counts", hasUsableGrade(1) === true);
}

console.log("\nexclusions and empty states");
{
  const out = estimateGpa([
    { id: "1", title: "AP Biology", level: "AP", grades: [95] },
    { id: "2", title: "Flashing Lights", level: "ON_LEVEL", grades: [100], excluded: true },
  ]);
  ok("excluded courses do not count", out.counted === 1);
  ok("and are reported", out.excluded === 1);
  ok("the AP grade stands alone", out.weighted === 5.5);

  // No GPA is not a GPA of zero. Rendering absence as 0.00 reads as
  // catastrophe.
  const none = estimateGpa([]);
  ok("nothing counted is null, not zero", none.weighted === null && none.unweighted === null);
  ok("and says so", none.counted === 0);

  const allOut = estimateGpa([
    { id: "1", title: "X", level: "AP", grades: [90], excluded: true },
  ]);
  ok("everything excluded is also null", allOut.weighted === null);
}

console.log("\nthe transcript abbreviates, so levels need their own reading");
{
  // levelOf matches whole words, so "ap" is never found inside "APCSPRIN" —
  // every AP course on a transcript would score as on-level and deflate a GPA.
  ok("APCSPRIN is AP", levelOfTranscriptCourse("A3580300 - 1", "APCSPRIN") === "AP");
  ok("APHUMGEOW is AP", levelOfTranscriptCourse("A3360100 - 1", "APHUMGEOW") === "AP");
  ok("BIO is not", levelOfTranscriptCourse("03010200 - 1", "BIO") === "ON_LEVEL");
  ok("ALG 1 is not", levelOfTranscriptCourse("03100500 - 1", "ALG 1") === "ON_LEVEL");
  // A word beginning with the same two letters must not be swept in.
  ok("APPLIED is not AP", levelOfTranscriptCourse("03000000 - 1", "APPLIED MATH") === "ON_LEVEL");
  // A full title still works through the ordinary rule.
  ok("a written-out title still works", levelOfTranscriptCourse("1 - 1", "Chemistry Adv") === "ADVANCED");
}

console.log("\na present GPA anchored to the school's own figure");
{
  const official = { weighted: 4.694, unweighted: 3.778 };

  // The property that makes this trustworthy: with nothing in progress it is
  // the school's number, not an approximation of it.
  const idle = presentGpa(official, 19, []);
  ok("nothing in progress returns the school's weighted exactly", idle.weighted === 4.694);
  ok("and its unweighted exactly", idle.unweighted === 3.778);
  ok("counting the grades behind it", idle.counted === 19);
  ok("with none in progress", idle.inProgress === 0);

  // A strong current term pulls it up; the movement is confined to the part
  // that is genuinely unknown.
  const strong = presentGpa(official, 19, [
    { level: "AP", grade: 100 },
    { level: "AP", grade: 100 },
  ]);
  ok("a strong term raises it", strong.weighted > 4.694);
  ok("and it is counted", strong.counted === 21 && strong.inProgress === 2);

  const weak = presentGpa(official, 19, [{ level: "ON_LEVEL", grade: 70 }]);
  ok("a weak term lowers it", weak.weighted < 4.694);

  // No transcript yet: fall back to the current term rather than inventing a
  // past, and never return zero for "unknown".
  const noPast = presentGpa({ weighted: null, unweighted: null }, 0, [
    { level: "AP", grade: 90 },
  ]);
  ok("without a transcript it uses this term", noPast.weighted === 5);
  ok("nothing at all is null, not zero", presentGpa({ weighted: null, unweighted: null }, 0, []).weighted === null);
}

console.log("\nadding the transcript up directly, which is why we do not");
{
  // Kept as a check on the decision rather than on the code: recomputing the
  // finished semesters lands 0.27 off the school's weighted figure, because a
  // transcript's abbreviations do not say which courses are Advanced.
  const finished = [
    { level: "ON_LEVEL", grade: 85 },
    { level: "ON_LEVEL", grade: 93 },
    { level: "AP", grade: 91 },
  ];
  const out = cumulativeGpa(finished, []);
  ok("it computes something", out.weighted !== null);
  ok("over the right count", out.counted === 3);
  ok("and an empty one is null", cumulativeGpa([], []).weighted === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
