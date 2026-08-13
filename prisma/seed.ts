import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  DayType,
  SchoolType,
  ScheduleVariant,
} from "../src/generated/prisma/enums";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const HIGH_SCHOOLS = [
  "Centennial High School",
  "Emerson High School",
  "Frisco High School",
  "Heritage High School",
  "Independence High School",
  "Lebanon Trail High School",
  "Liberty High School",
  "Lone Star High School",
  "Memorial High School",
  "Panther Creek High School",
  "Reedy High School",
  "Wakeland High School",
];

const MIDDLE_SCHOOLS = [
  "Clark Middle School",
  "Cobb Middle School",
  "Fowler Middle School",
  "Griffin Middle School",
  "Hunt Middle School",
  "Lawler Middle School",
  "Maus Middle School",
  "Nelson Middle School",
  "Pearson Middle School",
  "Pioneer Heritage Middle School",
  "Roach Middle School",
  "Scoggins Middle School",
  "Stafford Middle School",
  "Staley Middle School",
  "Trent Middle School",
  "Vandeventer Middle School",
  "Wester Middle School",
  "Wilkinson Middle School",
];

const hm = (h: number, m: number) => h * 60 + m;

type Slot = {
  sequence: number;
  number: number | null;
  label: string | null;
  start: number;
  end: number;
  instructional: boolean;
};

// High school: A/B block. Four blocks a day plus Advisory, which sits between
// the 2nd and 3rd. Confirmed against a real student's bell schedule on
// 2026-08-12; the earlier times here were reconstructed and four of the five
// rows were wrong by five to fifteen minutes.
//
// **The numbering is interleaved, and this is the part worth reading twice.**
// The school calls the blocks 1A 2A 3A 4A on an A day and 1B 2B 3B 4B on a B
// day — but HAC lists them 1A 1B 2A 2B 3A 3B 4A 4B and shows the student a
// plain number 1-8 in that order. So an odd number is an A day and an even one
// is a B day, and the block is the number rounded up over two.
//
// The first version numbered A days 1-4 and B days 5-8, which looks reasonable
// and is wrong in the worst way: "5" meant B-day first block at 9:00 here and
// A-day third block at 12:50 to the student. Nearly every course would have
// been filed against a time it never met at, and nothing would have looked
// broken — the periods all exist, they're just the wrong ones.
const HS_A: Slot[] = [
  { sequence: 1, number: 1, label: null, start: hm(9, 0), end: hm(10, 30), instructional: true },
  { sequence: 2, number: 3, label: null, start: hm(10, 35), end: hm(12, 10), instructional: true },
  { sequence: 3, number: null, label: "Advisory", start: hm(12, 15), end: hm(12, 45), instructional: false },
  // Lunch waves A-C happen inside this block rather than beside it, and which
  // wave a student gets differs per campus and per course — so the whole span
  // is one period as far as period lookup is concerned.
  { sequence: 4, number: 5, label: null, start: hm(12, 50), end: hm(14, 52), instructional: true },
  { sequence: 5, number: 7, label: null, start: hm(14, 57), end: hm(16, 30), instructional: true },
];

/// The same times, one number up: HAC's 2 is the B-day partner of its 1.
const HS_B: Slot[] = HS_A.map((s) => ({
  ...s,
  number: s.number === null ? null : s.number + 1,
}));

// Middle school: every class meets every day. District calendar lists middle
// school hours as 8:25-3:50, which these match. 4th period absorbs the
// grade-level lunch waves.
const MS: Slot[] = [
  { sequence: 1, number: 1, label: null, start: hm(8, 25), end: hm(9, 12), instructional: true },
  { sequence: 2, number: 2, label: null, start: hm(9, 16), end: hm(10, 3), instructional: true },
  { sequence: 3, number: 3, label: null, start: hm(10, 7), end: hm(10, 54), instructional: true },
  { sequence: 4, number: 4, label: "4th period and lunch", start: hm(10, 58), end: hm(12, 58), instructional: true },
  { sequence: 5, number: 5, label: null, start: hm(13, 2), end: hm(13, 49), instructional: true },
  { sequence: 6, number: 6, label: null, start: hm(13, 53), end: hm(14, 40), instructional: true },
  { sequence: 7, number: 7, label: null, start: hm(14, 44), end: hm(15, 31), instructional: true },
  { sequence: 8, number: null, label: "Advisory", start: hm(15, 35), end: hm(15, 50), instructional: false },
];

// From the published FISD 2026-2027 student calendar.
const TERMS = [
  { name: "2026-27 Fall", start: "2026-08-12", end: "2026-12-18" },
  { name: "2026-27 Spring", start: "2027-01-05", end: "2027-05-14" },
];

const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

async function seedPeriods(schoolId: string, dayType: DayType, slots: Slot[]) {
  for (const s of slots) {
    await db.period.upsert({
      where: {
        schoolId_dayType_variant_sequence: {
          schoolId,
          dayType,
          variant: ScheduleVariant.REGULAR,
          sequence: s.sequence,
        },
      },
      // Bell times are corrected here rather than only created. `update: {}`
      // meant a fixed schedule stayed wrong forever in any database that had
      // already been seeded — which is every deployed one, so the correction
      // that matters most was the one that could never land.
      //
      // Safe to re-run: a period is identified by campus, day type and
      // sequence, none of which this touches. Nothing else references a
      // period by its times.
      update: {
        number: s.number,
        label: s.label,
        startMinutes: s.start,
        endMinutes: s.end,
        isInstructional: s.instructional,
      },
      create: {
        schoolId,
        dayType,
        variant: ScheduleVariant.REGULAR,
        sequence: s.sequence,
        number: s.number,
        label: s.label,
        startMinutes: s.start,
        endMinutes: s.end,
        isInstructional: s.instructional,
      },
    });
  }
}

async function seedSchool(name: string, type: SchoolType) {
  const isHigh = type === SchoolType.HIGH;

  const school = await db.school.upsert({
    where: { name },
    update: { type, promptInterval: isHigh ? 1 : 2 },
    create: {
      name,
      type,
      // High schools prompt once per block; middle schools every two periods.
      // The intervals land close together in practice: a 90-minute block
      // against two 47-minute periods.
      promptInterval: isHigh ? 1 : 2,
    },
  });

  if (isHigh) {
    await seedPeriods(school.id, DayType.A, HS_A);
    await seedPeriods(school.id, DayType.B, HS_B);
  } else {
    await seedPeriods(school.id, DayType.ALL, MS);
  }

  for (const t of TERMS) {
    await db.term.upsert({
      where: { schoolId_name: { schoolId: school.id, name: t.name } },
      update: { startDate: date(t.start), endDate: date(t.end) },
      create: {
        schoolId: school.id,
        name: t.name,
        startDate: date(t.start),
        endDate: date(t.end),
      },
    });
  }
}

/// The district calendar, extracted from FISD's published A/B PDF by sampling
/// each cell's fill color rather than transcribing it by eye. Gold is an A day,
/// white a B day, blue no school. See prisma/data for the extracted table.
async function seedCalendar() {
  const file = path.join(__dirname, "data", "fisd-2026-27-calendar.json");
  const rows: { date: string; type: string }[] = JSON.parse(
    fs.readFileSync(file, "utf8"),
  );

  const MAP: Record<string, { dayType: DayType | null; variant: ScheduleVariant }> =
    {
      A_DAY: { dayType: DayType.A, variant: ScheduleVariant.REGULAR },
      B_DAY: { dayType: DayType.B, variant: ScheduleVariant.REGULAR },
      LATE_B: { dayType: DayType.B, variant: ScheduleVariant.LATE_ARRIVAL },
      NO_SCHOOL: { dayType: null, variant: ScheduleVariant.REGULAR },
      // Bad-weather make-up days are only school days if they get used, so
      // they are seeded as non-school and flipped by hand if invoked.
      MAKEUP: { dayType: null, variant: ScheduleVariant.REGULAR },
    };

  let n = 0;
  for (const r of rows) {
    const m = MAP[r.type];
    if (!m) continue;
    await db.districtCalendarDay.upsert({
      where: { date: date(r.date) },
      update: { dayType: m.dayType, variant: m.variant },
      create: {
        date: date(r.date),
        dayType: m.dayType,
        variant: m.variant,
        note: r.type === "MAKEUP" ? "Bad weather make-up day, unused" : null,
      },
    });
    n++;
  }
  return n;
}

async function main() {
  for (const name of HIGH_SCHOOLS) await seedSchool(name, SchoolType.HIGH);
  for (const name of MIDDLE_SCHOOLS) await seedSchool(name, SchoolType.MIDDLE);
  const calendarDays = await seedCalendar();

  const [schools, periods, terms] = await Promise.all([
    db.school.count(),
    db.period.count(),
    db.term.count(),
  ]);
  const aDays = await db.districtCalendarDay.count({ where: { dayType: "A" } });
  const bDays = await db.districtCalendarDay.count({ where: { dayType: "B" } });

  console.log(
    `Seeded ${schools} schools, ${periods} periods, ${terms} terms, ` +
      `${calendarDays} calendar days (${aDays} A / ${bDays} B).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
