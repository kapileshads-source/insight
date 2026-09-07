import {
  buildTranscript,
  countsTowardGpa,
  officialGpa,
  creditOf,
  looksLikeCourseRow,
  semesterGrade,
  semesterGrades,
} from "../transcript.ts";

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name); }
};

console.log("semester grades, where a letter is not a number");
{
  ok("a number is a number", semesterGrade("93") === 93);
  ok("decimals survive", semesterGrade("88.5") === 88.5);
  // P, W and CNS are real outcomes. Turning one into a zero invents a failure
  // the student never had — the same mistake parseScore exists to prevent.
  ok("P is not zero", semesterGrade("P") === null);
  ok("W is not zero", semesterGrade("W") === null);
  ok("CNS is not zero", semesterGrade("CNS") === null);
  ok("blank is null", semesterGrade("") === null);
  ok("undefined is null", semesterGrade(undefined) === null);
  ok("a wild number is rejected", semesterGrade("9999") === null);
}

console.log("\ntelling a course row from a totals row");
{
  // The transcript has no header row to bind to, so the shape of the first
  // cell is what separates a course from a running total.
  ok("a real course row", looksLikeCourseRow(["03100500 - 1", "ALG 1", "93", "95", "", "1.0000"]));
  ok("a lettered code still counts", looksLikeCourseRow(["A3580300 - 1", "APCSPRIN", "91", "87", "", "1.0000"]));
  ok("a waiver row still counts", looksLikeCourseRow(["waivertech - 1", "Tech Waiver", "W", "", "", "0.0000"]));
  ok("a totals row does not", !looksLikeCourseRow(["Total Credit: 4.0000", "", "", "", "", ""]));
  ok("a short row does not", !looksLikeCourseRow(["03100500 - 1", "ALG 1"]));
  ok("an empty description does not", !looksLikeCourseRow(["03100500 - 1", "", "93", "95", "", "1"]));
}

console.log("\ncredit is the district's own answer to 'is this a course'");
{
  ok("one credit", creditOf("1.0000") === 1);
  ok("no credit", creditOf("0.0000") === 0);
  ok("blank is unknown, not zero", creditOf("") === null);
  ok("a letter is unknown", creditOf("W") === null);
}

console.log("\nwhat counts toward a GPA");
{
  const real = { code: "03100500 - 1", description: "ALG 1", sem1: 93, sem2: 95, credit: 1 };
  ok("a graded course counts", countsTowardGpa(real));

  // Printed on the page by the district, which beats any inference from a
  // title — this is what marks the tech waivers.
  ok("zero credit does not", !countsTowardGpa({ ...real, credit: 0 }));
  ok("no grades at all does not", !countsTowardGpa({ ...real, sem1: null, sem2: null }));
  ok("one semester is enough", countsTowardGpa({ ...real, sem2: null }));
  ok("unknown credit is not disqualifying", countsTowardGpa({ ...real, credit: null }));
}

console.log("\nflattening a transcript into semester grades");
{
  const transcript = {
    years: [
      {
        year: "2025-2026",
        gradeLevel: "09",
        building: "Centennial High School",
        courses: [
          { code: "03010200 - 1", description: "BIO", sem1: 93, sem2: 83, credit: 1 },
          { code: "waivertech - 1", description: "Tech Waiver", sem1: null, sem2: null, credit: 0 },
          { code: "PES00056 - 1", description: "SBLIFE", sem1: 99, sem2: 100, credit: 1 },
        ],
      },
    ],
    gpa: [],
  };
  const flat = semesterGrades(transcript);

  ok("two semesters per course", flat.length === 4);
  ok("the waiver is not in there", !flat.some((g) => g.description === "Tech Waiver"));
  ok("grades come through intact", flat.map((g) => g.grade).join(",") === "93,83,99,100");
  ok("an empty transcript is empty", semesterGrades({ years: [], gpa: [] }).length === 0);
}

console.log("\nbuilding a transcript, dropping rows that are not courses");
{
  const t = buildTranscript({
    years: [
      {
        year: "2025-2026",
        gradeLevel: "09",
        building: "Centennial High School",
        rows: [
          ["03010200 - 1", "BIO", "93", "83", "", "1.0000"],
          ["waivertech - 1", "Tech Waiver", "W", "", "", "0.0000"],
          // A totals row read at course offsets would invent a course called
          // "" with a grade of nothing. Dropped instead.
          ["Total Credit: 8.0000", "", "", "", "", ""],
        ],
      },
    ],
    gpa: [
      { label: "Weighted GPA", value: "4.6940", rank: "12" },
      { label: "4.0 College GPA", value: "3.7780", rank: null },
    ],
  });

  ok("one year", t.years.length === 1);
  ok("the totals row is dropped", t.years[0].courses.length === 2);
  ok("grades come through", t.years[0].courses[0].sem1 === 93);
  ok("a W stays null", t.years[0].courses[1].sem1 === null);
  ok("zero credit is recorded", t.years[0].courses[1].credit === 0);
}

console.log("\nthe district's own GPA, which outranks ours");
{
  const t = buildTranscript({
    years: [],
    gpa: [
      { label: "Weighted GPA", value: "4.6940", rank: "12" },
      { label: "4.0 College GPA", value: "3.7780", rank: null },
    ],
  });
  const official = officialGpa(t);

  ok("finds the weighted one", official.weighted.value === 4.694);
  ok("keeps the rank with it", official.weighted.rank === "12");
  // "4.0" is how the unweighted one is labelled today, and neither label is
  // promised, so both are matched by keyword.
  ok("finds the unweighted one", official.unweighted.value === 3.778);

  // A label carrying both words must not land in the weighted slot.
  const tricky = buildTranscript({ years: [], gpa: [{ label: "Unweighted GPA", value: "3.5", rank: null }] });
  ok("unweighted is not read as weighted", officialGpa(tricky).weighted === null);
  ok("and lands in its own slot", officialGpa(tricky).unweighted.value === 3.5);

  ok("no GPA table is null, not zero", officialGpa({ years: [], gpa: [] }).weighted === null);
  // A non-numeric value must never become 0.0 on a student's screen.
  const bad = buildTranscript({ years: [], gpa: [{ label: "Weighted GPA", value: "N/A", rank: null }] });
  ok("a non-numeric GPA is dropped", bad.gpa.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
