import {
  estimateGpa,
  keepEnrolled,
  sameClass,
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
    { title: "Chemistry Adv YR (Whitt, Austin)", fromHac: false },
    // Canvas shells the district pushes to everyone. One of these was sitting
    // at 100% and lifting a real student's GPA.
    { title: "Frisco ISD 1forAll Student Course 26-27", fromHac: false },
    { title: "Cen10 Titans Info", fromHac: false },
  ];
  const kept = keepEnrolled(courses).map((c) => c.title);

  ok("the HAC course stays", kept.includes("SCI22200A - 6 Chemistry Adv S1"));
  ok("its Canvas twin stays", kept.includes("Chemistry Adv YR (Whitt, Austin)"));
  ok("a district shell is dropped", !kept.includes("Frisco ISD 1forAll Student Course 26-27"));
  ok("so is the other one", !kept.includes("Cen10 Titans Info"));

  // The failure this codebase keeps repeating: a filter that is right in
  // steady state and wrong on first use. Before any HAC sync, dropping every
  // Canvas course would blank the GPA entirely.
  const noHac = keepEnrolled([
    { title: "Chemistry Adv YR (Whitt, Austin)", fromHac: false },
    { title: "Frisco ISD 1forAll Student Course 26-27", fromHac: false },
  ]);
  ok("nothing from HAC keeps everything", noHac.length === 2);
  ok("an empty list stays empty", keepEnrolled([]).length === 0);
}

console.log("\nthe two systems name one class nothing alike");
{
  ok("HAC and Canvas chemistry are the same class", sameClass("SCI22200A - 6 Chemistry Adv S1", "Chemistry Adv YR (Whitt, Austin)"));
  ok("so are the pre-calculus ones", sameClass("MTH34300A - 8 AP Pre Calculus S1 - C Lunch", "AP Pre Calculus YR (SCHMIDT, AMANDA)"));
  // An advanced class and an on-level one are different courses, and
  // conflating them would move a GPA.
  ok("advanced is not on-level", !sameClass("Chemistry Adv YR", "Chemistry YR"));
  ok("different subjects do not match", !sameClass("SCI22200A - 6 Chemistry Adv S1", "English 2 Adv YR (BECKMAN, HILLARY)"));
  ok("a district shell matches nothing", !sameClass("SCI22200A - 6 Chemistry Adv S1", "Frisco ISD 1forAll Student Course 26-27"));
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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
