import type { DayType, ScheduleVariant } from "@/generated/prisma/enums";

/// The subset of a Period row this module needs. Kept structural so the pure
/// functions below can be tested without a database.
export type PeriodSlot = {
  /// Chronological position within the day. The prompt interval arithmetic
  /// uses this, never `number` — on a B day the numbers run 5, 6, 7, 8 and
  /// Advisory has none at all, so subtracting numbers gives nonsense.
  sequence: number;
  /// What the student calls it. Null for Advisory and similar.
  number: number | null;
  label: string | null;
  startMinutes: number;
  endMinutes: number;
  isInstructional: boolean;
};

export type PeriodMatch = {
  period: PeriodSlot;
  /// EXACT when the clock falls inside the period. NEAREST_UPCOMING when the
  /// student opened the app during a passing period and we rounded forward.
  how: "EXACT" | "NEAREST_UPCOMING";
};

/// What kind of school day a given date is.
export type ResolvedDay = {
  dayType: DayType;
  variant: ScheduleVariant;
} | null; // null means no school

/// Minutes elapsed since midnight for `at`, read in `timezone` rather than the
/// server's zone. Vercel runs UTC; a student in Frisco opening the app at
/// 8:05 AM must resolve to 485, not 785.
export function minutesSinceMidnight(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");

  // Intl renders midnight as "24" under hour12: false in some ICU versions.
  return (hour % 24) * 60 + minute;
}

/// Calendar date in the school's timezone, as YYYY-MM-DD. Used as the key for
/// "have we already prompted today", which must roll over at local midnight.
export function localDateKey(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/// Resolve which day-type a date is, preferring a campus override over the
/// district calendar. A date absent from both is not a school day — we never
/// guess by alternating, because one irregular day would desynchronize the
/// rest of the year without anything visibly breaking.
export function resolveDay(
  dateKey: string,
  district: Map<string, ResolvedDay>,
  campusOverrides?: Map<string, ResolvedDay>,
): ResolvedDay {
  if (campusOverrides?.has(dateKey)) return campusOverrides.get(dateKey) ?? null;
  return district.get(dateKey) ?? null;
}

/// Resolve the current period.
///
/// During passing periods we round forward to the next period rather than
/// returning null, so the prompt doesn't go silent during transitions. Before
/// the first bell and after the last we return null — the student isn't in the
/// school day at all, and prompting then would just be noise.
export function lookupPeriod(
  minutes: number,
  periods: PeriodSlot[],
): PeriodMatch | null {
  const ordered = [...periods].sort((a, b) => a.startMinutes - b.startMinutes);
  if (ordered.length === 0) return null;

  const exact = ordered.find(
    (p) => minutes >= p.startMinutes && minutes < p.endMinutes,
  );
  if (exact) return { period: exact, how: "EXACT" };

  const first = ordered[0];
  const last = ordered[ordered.length - 1];

  // Outside the school day entirely.
  if (minutes < first.startMinutes || minutes >= last.endMinutes) return null;

  // In a gap between periods — round forward to the one about to start.
  const upcoming = ordered.find((p) => p.startMinutes > minutes);
  return upcoming ? { period: upcoming, how: "NEAREST_UPCOMING" } : null;
}

export type PromptDecision =
  | { shouldPrompt: false; reason: string }
  | { shouldPrompt: true; kind: "PERIODIC"; sequence: number }
  | { shouldPrompt: true; kind: "POST_TERM" };

export type PromptContext = {
  now: Date;
  timezone: string;
  /// Periods for today's resolved day-type and schedule variant.
  periods: PeriodSlot[];
  promptInterval: number;
  termEndDate: Date;
  state: {
    lastPromptedOn: Date | null;
    lastPromptedSequence: number | null;
    postTermPromptShown: boolean;
  } | null;
};

/// Decide whether to show the "anything else not in Canvas?" prompt.
///
/// Follows the pseudocode in the build plan, with two changes. The counter
/// resets each local calendar day, so a student prompted in 7th period
/// yesterday still gets prompted in 1st period today. And it counts in
/// chronological sequence rather than period number, which is what makes it
/// work on a B day.
export function decidePrompt(ctx: PromptContext): PromptDecision {
  const today = localDateKey(ctx.now, ctx.timezone);
  const termEnd = localDateKey(ctx.termEndDate, ctx.timezone);

  if (today > termEnd) {
    if (ctx.state?.postTermPromptShown) {
      return { shouldPrompt: false, reason: "post-term prompt already shown" };
    }
    return { shouldPrompt: true, kind: "POST_TERM" };
  }

  const minutes = minutesSinceMidnight(ctx.now, ctx.timezone);
  const match = lookupPeriod(minutes, ctx.periods);
  if (!match) {
    return { shouldPrompt: false, reason: "outside the school day" };
  }
  if (!match.period.isInstructional) {
    return { shouldPrompt: false, reason: "not an instructional block" };
  }

  const lastPromptedToday =
    ctx.state?.lastPromptedOn != null &&
    localDateKey(ctx.state.lastPromptedOn, ctx.timezone) === today;

  if (!lastPromptedToday) {
    return {
      shouldPrompt: true,
      kind: "PERIODIC",
      sequence: match.period.sequence,
    };
  }

  const elapsed = match.period.sequence - (ctx.state?.lastPromptedSequence ?? 0);
  if (elapsed >= ctx.promptInterval) {
    return {
      shouldPrompt: true,
      kind: "PERIODIC",
      sequence: match.period.sequence,
    };
  }

  return {
    shouldPrompt: false,
    reason: `only ${elapsed} period(s) since last prompt, interval is ${ctx.promptInterval}`,
  };
}

/// How a period should be described to a student. Advisory has no number, and
/// "3rd period" is what they'd say regardless of it being the 4th block of the
/// day on a B-day schedule.
export function describePeriod(p: PeriodSlot): string {
  if (p.label) return p.label;
  if (p.number == null) return `Block ${p.sequence}`;
  const suffix =
    p.number % 10 === 1 && p.number !== 11
      ? "st"
      : p.number % 10 === 2 && p.number !== 12
        ? "nd"
        : p.number % 10 === 3 && p.number !== 13
          ? "rd"
          : "th";
  return `${p.number}${suffix} period`;
}
