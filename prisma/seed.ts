import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DayType, SchoolType } from "../src/generated/prisma/enums";

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

// PLACEHOLDER BELL TIMES.
//
// These are structurally correct (period count, lunch position, instructional
// flags) but the actual clock times are not FISD's published times — nobody has
// entered those yet. They exist so the period-lookup and prompt logic have
// something real to run against in development. Replace them per campus through
// the admin schedule editor before any student uses this.
const HS_PERIODS = [
  { number: 1, label: null, start: hm(8, 55), end: hm(9, 45), instructional: true },
  { number: 2, label: null, start: hm(9, 51), end: hm(10, 41), instructional: true },
  { number: 3, label: null, start: hm(10, 47), end: hm(11, 37), instructional: true },
  { number: 4, label: "Lunch", start: hm(11, 37), end: hm(12, 17), instructional: false },
  { number: 5, label: null, start: hm(12, 23), end: hm(13, 13), instructional: true },
  { number: 6, label: null, start: hm(13, 19), end: hm(14, 9), instructional: true },
  { number: 7, label: null, start: hm(14, 15), end: hm(15, 5), instructional: true },
  { number: 8, label: null, start: hm(15, 11), end: hm(16, 5), instructional: true },
];

const MS_PERIODS = [
  { number: 1, label: null, start: hm(8, 25), end: hm(9, 12), instructional: true },
  { number: 2, label: null, start: hm(9, 16), end: hm(10, 3), instructional: true },
  { number: 3, label: null, start: hm(10, 7), end: hm(10, 54), instructional: true },
  { number: 4, label: null, start: hm(10, 58), end: hm(11, 45), instructional: true },
  { number: 5, label: "Lunch", start: hm(11, 45), end: hm(12, 20), instructional: false },
  { number: 6, label: null, start: hm(12, 24), end: hm(13, 11), instructional: true },
  { number: 7, label: null, start: hm(13, 15), end: hm(14, 2), instructional: true },
  { number: 8, label: null, start: hm(14, 6), end: hm(15, 35), instructional: true },
];

// PLACEHOLDER TERM DATES — same caveat as bell times. Confirm against the
// published FISD academic calendar before launch.
const TERMS = [
  { name: "2026–27 Fall", start: "2026-08-13", end: "2026-12-18" },
  { name: "2026–27 Spring", start: "2027-01-06", end: "2027-05-27" },
];

async function seedSchool(name: string, type: SchoolType) {
  const isHigh = type === SchoolType.HIGH;

  const school = await db.school.upsert({
    where: { name },
    update: {},
    create: {
      name,
      type,
      // High schools prompt once per period; middle schools every two.
      promptInterval: isHigh ? 1 : 2,
      usesBlockSchedule: false,
    },
  });

  const template = isHigh ? HS_PERIODS : MS_PERIODS;
  for (const p of template) {
    await db.period.upsert({
      where: {
        schoolId_dayType_number: {
          schoolId: school.id,
          dayType: DayType.REGULAR,
          number: p.number,
        },
      },
      update: {},
      create: {
        schoolId: school.id,
        dayType: DayType.REGULAR,
        number: p.number,
        label: p.label,
        startMinutes: p.start,
        endMinutes: p.end,
        isInstructional: p.instructional,
      },
    });
  }

  for (const t of TERMS) {
    await db.term.upsert({
      where: { schoolId_name: { schoolId: school.id, name: t.name } },
      update: {},
      create: {
        schoolId: school.id,
        name: t.name,
        startDate: new Date(`${t.start}T00:00:00Z`),
        endDate: new Date(`${t.end}T00:00:00Z`),
      },
    });
  }

  return school;
}

async function main() {
  for (const name of HIGH_SCHOOLS) await seedSchool(name, SchoolType.HIGH);
  for (const name of MIDDLE_SCHOOLS) await seedSchool(name, SchoolType.MIDDLE);

  const schools = await db.school.count();
  const periods = await db.period.count();
  const terms = await db.term.count();
  console.log(`Seeded ${schools} schools, ${periods} periods, ${terms} terms.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
