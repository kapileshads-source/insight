import "server-only";
import { db } from "@/lib/db";
import {
  describePeriod,
  localDateKey,
  lookupPeriod,
  minutesSinceMidnight,
  type PeriodSlot,
} from "@/lib/schedule";

export type SchoolDayState =
  | { kind: "NO_SCHOOL"; nextSchoolDay: Date | null; timezone: string }
  | {
      kind: "BEFORE_OR_AFTER";
      dayLabel: string;
      timezone: string;
      firstPeriod: PeriodSlot | null;
    }
  | {
      kind: "IN_PERIOD";
      dayLabel: string;
      timezone: string;
      period: PeriodSlot;
      description: string;
      minutesRemaining: number;
      rounded: boolean;
    };

/// Where the student is in their school day, right now.
///
/// Answers three questions the dashboard needs: is there school today, which
/// classes are meeting (A or B), and which block is running. The A/B answer
/// comes from the stored district calendar rather than from alternating
/// arithmetic, because one irregular day would desynchronize the rest of the
/// year without anything visibly breaking.
export async function getSchoolDayState(
  schoolId: string,
  now: Date = new Date(),
): Promise<SchoolDayState | null> {
  const school = await db.school.findUnique({ where: { id: schoolId } });
  if (!school) return null;

  const tz = school.timezone;
  const todayKey = localDateKey(now, tz);
  const today = new Date(`${todayKey}T00:00:00Z`);

  // A campus override wins over the district calendar.
  const [override, districtDay] = await Promise.all([
    db.scheduleOverride.findUnique({
      where: { schoolId_date: { schoolId, date: today } },
    }),
    db.districtCalendarDay.findUnique({ where: { date: today } }),
  ]);

  const resolved = override ?? districtDay;

  if (!resolved || resolved.dayType == null) {
    const next = await db.districtCalendarDay.findFirst({
      where: { date: { gt: today }, dayType: { not: null } },
      orderBy: { date: "asc" },
    });
    return { kind: "NO_SCHOOL", nextSchoolDay: next?.date ?? null, timezone: tz };
  }

  // The district calendar's A/B marking only means something at block
  // campuses. Middle schools meet every class daily, so their periods are
  // seeded as ALL — querying them for an "A day" finds nothing and the student
  // is told there is no class running, on a normal Wednesday morning.
  const dayTypeForSchool = school.type === "MIDDLE" ? "ALL" : resolved.dayType;

  const periods = await db.period.findMany({
    where: {
      schoolId,
      dayType: dayTypeForSchool,
      variant: resolved.variant,
    },
    orderBy: { sequence: "asc" },
  });

  const slots: PeriodSlot[] = periods.map((p) => ({
    sequence: p.sequence,
    number: p.number,
    label: p.label,
    startMinutes: p.startMinutes,
    endMinutes: p.endMinutes,
    isInstructional: p.isInstructional,
  }));

  // Middle schools meet everything daily, so an "A day" label would be
  // meaningless there — only block campuses get one.
  const dayLabel =
    dayTypeForSchool === "ALL" ? "" : `${dayTypeForSchool} day`;

  const minutes = minutesSinceMidnight(now, tz);
  const match = lookupPeriod(minutes, slots);

  if (!match) {
    return {
      kind: "BEFORE_OR_AFTER",
      dayLabel,
      timezone: tz,
      firstPeriod: slots[0] ?? null,
    };
  }

  return {
    kind: "IN_PERIOD",
    dayLabel,
    timezone: tz,
    period: match.period,
    description: describePeriod(match.period),
    minutesRemaining: Math.max(0, match.period.endMinutes - minutes),
    rounded: match.how === "NEAREST_UPCOMING",
  };
}
