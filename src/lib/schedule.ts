import type { DayType } from "@/generated/prisma/enums";

/// The subset of a Period row this module needs. Kept structural so the pure
/// functions below can be tested without a database.
export type PeriodSlot = {
  number: number;
  label: string | null;
  startMinutes: number;
  endMinutes: number;
  isInstructional: boolean;
  dayType: DayType;
};

export type PeriodMatch = {
  period: PeriodSlot;
  /// EXACT when the clock falls inside the period. NEAREST_UPCOMING when the
  /// student opened the app during a passing period and we rounded forward.
  how: "EXACT" | "NEAREST_UPCOMING";
};

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

  // Intl renders midnight as "24" in some ICU versions under hour12: false.
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

/// Resolve the current period.
///
/// During passing periods and lunch we round forward to the next period rather
/// than returning null, so the prompt doesn't go silent during transitions.
/// Before the first bell and after the last, we return null — the student isn't
/// in the school day at all, and prompting then would be noise.
export function lookupPeriod(
  minutes: number,
  periods: PeriodSlot[],
): PeriodMatch | null {
  const instructional = periods
    .filter((p) => p.isInstructional)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  if (instructional.length === 0) return null;

  const exact = instructional.find(
    (p) => minutes >= p.startMinutes && minutes < p.endMinutes,
  );
  if (exact) return { period: exact, how: "EXACT" };

  const first = instructional[0];
  const last = instructional[instructional.length - 1];

  // Outside the school day entirely.
  if (minutes < first.startMinutes || minutes >= last.endMinutes) return null;

  // In a gap between periods — round forward to the one about to start.
  const upcoming = instructional.find((p) => p.startMinutes > minutes);
  return upcoming ? { period: upcoming, how: "NEAREST_UPCOMING" } : null;
}

export type PromptDecision =
  | { shouldPrompt: false; reason: string }
  | { shouldPrompt: true; kind: "PERIODIC"; period: number }
  | { shouldPrompt: true; kind: "POST_TERM" };

export type PromptContext = {
  now: Date;
  timezone: string;
  /// Periods for today's resolved day-type.
  periods: PeriodSlot[];
  promptInterval: number;
  termEndDate: Date;
  /// Existing PromptState for this student and term, if any.
  state: {
    lastPromptedOn: Date | null;
    lastPromptedPeriod: number | null;
    postTermPromptShown: boolean;
  } | null;
};

/// Decide whether to show the "anything else not in Canvas?" prompt.
///
/// Mirrors the pseudocode in the build plan, with one addition: the period
/// counter resets each local calendar day, so a student whose last prompt was
/// 7th period yesterday still gets prompted 1st period today.
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

  const lastPromptedToday =
    ctx.state?.lastPromptedOn != null &&
    localDateKey(ctx.state.lastPromptedOn, ctx.timezone) === today;

  if (!lastPromptedToday) {
    return { shouldPrompt: true, kind: "PERIODIC", period: match.period.number };
  }

  const elapsed = match.period.number - (ctx.state?.lastPromptedPeriod ?? 0);
  if (elapsed >= ctx.promptInterval) {
    return { shouldPrompt: true, kind: "PERIODIC", period: match.period.number };
  }

  return {
    shouldPrompt: false,
    reason: `only ${elapsed} period(s) since last prompt, interval is ${ctx.promptInterval}`,
  };
}
