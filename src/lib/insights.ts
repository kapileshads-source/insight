/**
 * The insight engine.
 *
 * Runs in the browser, over decrypted records, because the server can no
 * longer read the inputs. No model is involved in finding a pattern — this is
 * arithmetic. A model only ever phrases one that has already passed the gates
 * below, and it never sees a raw session.
 *
 * The method: an outcome (a test score) is explained by the sessions in the
 * days before it. Each outcome gets a context — how late they studied, how
 * long, where, how loud, how much they slept. Outcomes are then split into two
 * groups by one factor at a time, and the group means are compared.
 *
 * Every comparison is against the student's own other outcomes. There is no
 * universal threshold anywhere in this file: "less sleep than usual" means
 * less than *their* usual.
 */

import type { Location, NoiseLevel } from "@/lib/records";

// --- inputs -----------------------------------------------------------------

export type SessionRecord = {
  id: string;
  startedAt: Date;
  durationMinutes: number;
  subject?: string;
  location?: Location;
  noise?: NoiseLevel;
  stress?: number;
  wasCram?: boolean;
  /// Minutes on sites the student blocks, measured by the extension rather
  /// than reported. Undefined when no extension was running — which is not
  /// the same as zero, and must never be treated as it.
  distractedMinutes?: number;
};

export type OutcomeRecord = {
  id: string;
  occurredOn: Date;
  percentage: number;
  subject?: string;
  label?: string;
};

export type SleepRecord = { forDate: Date; hours: number };
export type ScreenTimeRecord = { forDate: Date; minutes: number };

export type InsightInputs = {
  sessions: SessionRecord[];
  outcomes: OutcomeRecord[];
  sleep: SleepRecord[];
  screenTime: ScreenTimeRecord[];
};

// --- gates ------------------------------------------------------------------

export const GATES = {
  /// Sessions feeding the comparison. The plan's floor is 8–10; below this a
  /// couple of unusual weeks can invent a pattern that isn't there.
  minSessions: 8,
  /// Both sides of a split need enough outcomes to have a meaningful mean.
  minPerGroup: 3,
  /// Percentage points. Smaller than this is noise in a set of test scores.
  minMagnitude: 5,
  /// A pattern that only holds half the time is not a pattern.
  minHoldRate: 0.6,
  /// How often a gap this large may appear by chance before we stop calling
  /// it a finding. Seven factors tested against twenty-odd scores will throw
  /// up a big-looking difference regularly; this is what separates the
  /// pattern from the coincidence.
  maxChance: 0.05,
  /// Shuffles behind that number. Enough to resolve 0.05 cleanly, cheap
  /// enough to run in a browser between renders.
  shuffles: 1000,
  /// Must survive across more than one subject or more than one week, so a
  /// single bad unit in one class can't become a permanent "insight".
  minSubjectsOrWeeks: 2,
  /// Days before an outcome whose sessions count as preparation for it.
  lookbackDays: 7,
} as const;

export type InsightCategory =
  | "SLEEP"
  | "STUDY_TIMING"
  | "SESSION_LENGTH"
  | "LOCATION"
  | "NOISE"
  | "PHONE_USAGE"
  | "DISTRACTION";

export type InsightDirection = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

export type ComputedInsight = {
  factor: string;
  category: InsightCategory;
  direction: InsightDirection;
  /// Percentage points between the two group means.
  magnitude: number;
  statement: string;
  suggestion?: string;
  sampleSize: number;
  heldIn: { held: number; of: number };
  subjectsHeld: number;
  weeksHeld: number;
  /// How often chance alone produced a gap this big, over 1000 shuffles.
  /// Nothing surfaces above `GATES.maxChance`.
  chance: number;
  /// False until every gate passes. Ungated insights are still returned so the
  /// UI can say "log more and this will firm up" rather than showing nothing.
  isSurfaced: boolean;
};

// --- small statistics -------------------------------------------------------

const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${week}`;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

function mode<T extends string>(xs: T[]): T | undefined {
  if (!xs.length) return undefined;
  const counts = new Map<T, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// --- context ----------------------------------------------------------------

/// What the run-up to one outcome looked like.
type Context = {
  outcome: OutcomeRecord;
  sessions: SessionRecord[];
  latestStartHour?: number;
  /// The share of this outcome's preparation that began after 11 PM.
  lateShare?: number;
  meanDuration?: number;
  location?: Location;
  noise?: NoiseLevel;
  meanSleep?: number;
  meanScreenTime?: number;
  /// Share of measured session time spent on blocked sites, 0 to 1. Only
  /// defined when at least one session in the window was measured.
  distractedShare?: number;
};

export function buildContexts(inputs: InsightInputs): Context[] {
  const { sessions, outcomes, sleep, screenTime } = inputs;

  return outcomes.map((outcome) => {
    const windowStart = new Date(outcome.occurredOn);
    windowStart.setDate(windowStart.getDate() - GATES.lookbackDays);

    // Sessions count toward an outcome if they fall in the window and, when
    // both name a subject, name the same one. Matching loosely on subject
    // matters: revising History all week says nothing about a Chemistry test.
    const related = sessions.filter((s) => {
      if (s.startedAt < windowStart || s.startedAt > outcome.occurredOn)
        return false;
      if (outcome.subject && s.subject) {
        return s.subject.trim().toLowerCase() === outcome.subject.trim().toLowerCase();
      }
      return true;
    });

    const nights = sleep.filter(
      (n) => n.forDate >= windowStart && n.forDate <= outcome.occurredOn,
    );
    const screens = screenTime.filter(
      (n) => n.forDate >= windowStart && n.forDate <= outcome.occurredOn,
    );

    const startHours = related.map((s) => s.startedAt.getHours());

    return {
      outcome,
      sessions: related,
      // Hours after midnight read as very late, not very early: a session at
      // 1am is the tail of the previous evening, and treating it as hour 1
      // would make it look like the earliest study of the week.
      latestStartHour: startHours.length
        ? Math.max(...startHours.map((h) => (h < 5 ? h + 24 : h)))
        : undefined,
      // How much of the week's preparation was late, not whether any of it
      // was. The comparison used to run on the latest session in the window,
      // so one 11 PM session marked the whole week late — and since most
      // students have one of those, every outcome landed in the same group,
      // the control group was empty, and the factor silently never fired.
      lateShare: startHours.length
        ? startHours.filter((h) => h >= 23 || h < 5).length / startHours.length
        : undefined,
      meanDuration: related.length
        ? mean(related.map((s) => s.durationMinutes))
        : undefined,
      location: mode(related.map((s) => s.location).filter(Boolean) as Location[]),
      noise: mode(related.map((s) => s.noise).filter(Boolean) as NoiseLevel[]),
      meanSleep: nights.length ? mean(nights.map((n) => n.hours)) : undefined,
      meanScreenTime: screens.length
        ? mean(screens.map((n) => n.minutes))
        : undefined,
      // Only sessions the extension actually measured count toward this.
      // Averaging an unmeasured session in as zero would quietly reward
      // studying with the extension switched off.
      distractedShare: (() => {
        const measured = related.filter(
          (s) => s.distractedMinutes !== undefined,
        );
        if (measured.length === 0) return undefined;
        const total = measured.reduce((n, s) => n + s.durationMinutes, 0);
        if (total <= 0) return undefined;
        const distracted = measured.reduce(
          (n, s) => n + (s.distractedMinutes ?? 0),
          0,
        );
        return distracted / total;
      })(),
    };
  });
}

/**
 * How often chance alone produces a gap this big.
 *
 * The gates above control sample size, not luck. Driving the engine with
 * generated students showed the cost: with seven factors compared against
 * twenty-odd scores, about half of what surfaced was noise — factors with no
 * effect built into the data at all, and on one run a finding with the wrong
 * sign entirely. All of it passed every gate, and all of it would have been
 * shown to a student in the same confident sentence as a real pattern.
 *
 * So: keep the two group sizes, shuffle which scores land in which group, and
 * count how often the shuffle beats what actually happened. If a third of
 * random shuffles produce this gap, it is not a finding.
 *
 * The shuffle is seeded deliberately. An insight that appears on one page load
 * and vanishes on the next is worse than one that never appears — a student
 * has no way to tell that apart from their own data changing.
 */
export function chanceOf(
  values: number[],
  focusCount: number,
  observed: number,
  shuffles: number = GATES.shuffles,
): number {
  if (focusCount <= 0 || focusCount >= values.length) return 1;

  const pool = [...values];
  const target = Math.abs(observed);
  let seed = 0x5eed;
  const next = () => {
    // Mulberry32: small, fast, and stable across engines — which matters more
    // here than the quality of the randomness.
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };

  let atLeastAsBig = 0;

  for (let run = 0; run < shuffles; run++) {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    let focusSum = 0;
    for (let i = 0; i < focusCount; i++) focusSum += pool[i];
    let restSum = 0;
    for (let i = focusCount; i < pool.length; i++) restSum += pool[i];

    const gap =
      focusSum / focusCount - restSum / (pool.length - focusCount);
    if (Math.abs(gap) >= target) atLeastAsBig++;
  }

  return atLeastAsBig / shuffles;
}

// --- the comparison ---------------------------------------------------------

type Split = {
  factor: string;
  category: InsightCategory;
  /// True when the outcome belongs to the group being described. Undefined
  /// means this outcome can't be classified and sits out of the comparison.
  classify: (c: Context) => boolean | undefined;
  /// How the group is described, e.g. "started after 11 PM".
  phrase: (magnitude: number) => { statement: string; suggestion?: string };
};

function compare(contexts: Context[], split: Split): ComputedInsight | null {
  const focus: Context[] = [];
  const rest: Context[] = [];

  for (const c of contexts) {
    const side = split.classify(c);
    if (side === undefined) continue;
    (side ? focus : rest).push(c);
  }

  if (focus.length === 0 || rest.length === 0) return null;

  const focusMean = mean(focus.map((c) => c.outcome.percentage));
  const restMean = mean(rest.map((c) => c.outcome.percentage));
  const magnitude = focusMean - restMean;

  // How often the pattern actually held, counted against the other group's
  // mean. Shown alongside every claim so a student can see the exceptions.
  const held = focus.filter((c) =>
    magnitude < 0
      ? c.outcome.percentage < restMean
      : c.outcome.percentage > restMean,
  ).length;
  const holdRate = held / focus.length;

  const sampleSize = focus.reduce((n, c) => n + c.sessions.length, 0);
  const subjects = new Set(
    focus.map((c) => c.outcome.subject?.trim().toLowerCase()).filter(Boolean),
  ).size;
  const weeks = new Set(focus.map((c) => isoWeek(c.outcome.occurredOn))).size;

  const direction: InsightDirection =
    Math.abs(magnitude) < GATES.minMagnitude
      ? "NEUTRAL"
      : magnitude < 0
        ? "NEGATIVE"
        : "POSITIVE";

  const chance = chanceOf(
    [...focus, ...rest].map((c) => c.outcome.percentage),
    focus.length,
    magnitude,
  );

  const isSurfaced =
    chance <= GATES.maxChance &&
    sampleSize >= GATES.minSessions &&
    focus.length >= GATES.minPerGroup &&
    rest.length >= GATES.minPerGroup &&
    Math.abs(magnitude) >= GATES.minMagnitude &&
    holdRate >= GATES.minHoldRate &&
    Math.max(subjects, weeks) >= GATES.minSubjectsOrWeeks;

  const { statement, suggestion } = split.phrase(magnitude);

  return {
    factor: split.factor,
    category: split.category,
    direction,
    magnitude: Math.round(magnitude),
    statement,
    // A negative-leaning finding never appears without something constructive
    // attached. Telling a fifteen-year-old their scores drop and stopping
    // there is not information, it's just discouraging.
    suggestion: direction === "NEGATIVE" ? suggestion : undefined,
    sampleSize,
    chance,
    heldIn: { held, of: focus.length },
    subjectsHeld: subjects,
    weeksHeld: weeks,
    isSurfaced,
  };
}

// --- the factors ------------------------------------------------------------

function splits(contexts: Context[]): Split[] {
  const sleepValues = contexts
    .map((c) => c.meanSleep)
    .filter((v): v is number => v !== undefined);
  const sleepBaseline = mean(sleepValues);

  const screenValues = contexts
    .map((c) => c.meanScreenTime)
    .filter((v): v is number => v !== undefined);
  const screenBaseline = mean(screenValues);

  return [
    {
      factor: "study_start_time",
      category: "STUDY_TIMING",
      // Half, so the group means "this was a late week" rather than "one late
      // night happened". Both sides stay populated for a real student.
      classify: (c) => (c.lateShare === undefined ? undefined : c.lateShare >= 0.5),
      phrase: () => ({
        statement:
          "Weeks where most of your studying started after 11 PM came before lower scores than your earlier ones.",
        suggestion:
          "Your stronger results followed earlier starts. If a late night is unavoidable, a shorter one the evening before tends to fit your pattern better.",
      }),
    },
    {
      factor: "session_length",
      category: "SESSION_LENGTH",
      classify: (c) =>
        c.meanDuration === undefined ? undefined : c.meanDuration >= 90,
      phrase: () => ({
        statement:
          "Long sessions, over an hour and a half, came before lower scores than your shorter ones.",
        suggestion:
          "Two shorter sittings have lined up with your better results more often than one long one.",
      }),
    },
    {
      factor: "location_home",
      category: "LOCATION",
      classify: (c) => (c.location === undefined ? undefined : c.location === "HOME"),
      phrase: () => ({
        statement:
          "Studying at home came before lower scores than studying somewhere else.",
        suggestion:
          "Sessions away from home have lined up with your better results. Worth trying the library for the next one.",
      }),
    },
    {
      factor: "noise_level",
      category: "NOISE",
      classify: (c) =>
        c.noise === undefined ? undefined : c.noise === "SOME" || c.noise === "LOUD",
      phrase: () => ({
        statement:
          "Noisier sessions came before lower scores than quiet ones.",
        suggestion:
          "Your quieter sessions have lined up with better results. Somewhere silent, or headphones, may be worth a try.",
      }),
    },
    {
      factor: "sleep_below_baseline",
      category: "SLEEP",
      classify: (c) =>
        c.meanSleep === undefined ? undefined : c.meanSleep < sleepBaseline,
      phrase: () => ({
        // Compared to their own average, never to a general recommendation.
        statement:
          "Weeks where you slept less than your own average came before lower scores.",
        suggestion:
          "Your better results followed weeks nearer your usual amount of sleep. Nothing dramatic — just closer to your own normal.",
      }),
    },
    {
      factor: "distraction_share",
      category: "DISTRACTION",
      // A fifth of a session is the threshold: below that is a glance at a
      // message, above it is a second activity running alongside the studying.
      classify: (c) =>
        c.distractedShare === undefined ? undefined : c.distractedShare >= 0.2,
      phrase: () => ({
        statement:
          "Sessions where more than a fifth of your time went to blocked sites came before lower scores than your focused ones.",
        suggestion:
          "This one is measured rather than typed in, so it's the most reliable number here. Focus Mode already blocks these — leaving it on is the whole fix.",
      }),
    },
    {
      factor: "screen_time_above_baseline",
      category: "PHONE_USAGE",
      classify: (c) =>
        c.meanScreenTime === undefined
          ? undefined
          : c.meanScreenTime > screenBaseline,
      phrase: () => ({
        statement:
          "Weeks with more phone time than your own average came before lower scores.",
        suggestion:
          "The difference showed up around your own typical amount rather than any particular number of hours.",
      }),
    },
  ];
}

/// Compute every insight, gated and ungated.
///
/// Ungated ones are returned deliberately: the dashboard shows them dimmed
/// with a count, which is more honest than an empty screen and tells a student
/// what logging more would actually buy them.
export function computeInsights(inputs: InsightInputs): ComputedInsight[] {
  const contexts = buildContexts(inputs);
  if (contexts.length === 0) return [];

  const results: ComputedInsight[] = [];
  for (const split of splits(contexts)) {
    const insight = compare(contexts, split);
    if (insight) results.push(insight);
  }

  // Surfaced first, then by how large the effect is.
  return results.sort((a, b) => {
    if (a.isSurfaced !== b.isSurfaced) return a.isSurfaced ? -1 : 1;
    return Math.abs(b.magnitude) - Math.abs(a.magnitude);
  });
}

/// Interim numbers for a student who has nothing gated yet, so the dashboard
/// is never blank.
export function basicStats(inputs: InsightInputs, now: Date = new Date()) {
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const thisWeek = inputs.sessions.filter((s) => s.startedAt >= weekAgo);
  const minutes = thisWeek.reduce((n, s) => n + s.durationMinutes, 0);
  const recentSleep = inputs.sleep.filter((s) => s.forDate >= weekAgo);

  // Only measured sessions contribute. Shown as null rather than zero when
  // nothing was measured, so "no extension" reads differently from "no
  // distractions" — they are very different facts.
  const measured = thisWeek.filter((s) => s.distractedMinutes !== undefined);
  const measuredMinutes = measured.reduce((n, s) => n + s.durationMinutes, 0);
  const distractedMinutes = measured.reduce(
    (n, s) => n + (s.distractedMinutes ?? 0),
    0,
  );

  return {
    sessionsThisWeek: thisWeek.length,
    minutesThisWeek: minutes,
    measuredSessions: measured.length,
    distractedMinutesThisWeek: measured.length ? distractedMinutes : null,
    focusShareThisWeek:
      measured.length && measuredMinutes > 0
        ? 1 - distractedMinutes / measuredMinutes
        : null,
    meanSleep: recentSleep.length
      ? mean(recentSleep.map((s) => s.hours))
      : null,
    outcomesLogged: inputs.outcomes.length,
    daysLoggedOfLast7: [...Array(7)].map((_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      return {
        date: d,
        logged: inputs.sessions.some((s) => sameDay(s.startedAt, d)),
      };
    }),
  };
}

// --- weekly recap -----------------------------------------------------------

export type DayBar = {
  date: Date;
  minutes: number;
  /// Minutes the extension attributed to blocked sites. Undefined when nothing
  /// measured that day, which is not the same as a focused day and must never
  /// be drawn as one.
  distractedMinutes?: number;
  sessions: number;
};

/**
 * Study minutes per day, for the chart.
 *
 * Fourteen days rather than seven: one week alone has no shape to it, and the
 * comparison a student actually makes — "am I doing more than I was?" — needs
 * the week before to sit next to.
 *
 * Days with nothing are returned as zeroes rather than omitted. A gap in a bar
 * chart reads as a day that doesn't exist; a zero reads as a day you didn't
 * study, which is the true and more useful statement.
 */
export function dailyStudyMinutes(
  inputs: InsightInputs,
  now: Date = new Date(),
  days = 14,
): DayBar[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const bars: DayBar[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    const next = new Date(date);
    next.setDate(next.getDate() + 1);

    const onDay = inputs.sessions.filter(
      (s) => s.startedAt >= date && s.startedAt < next,
    );
    const measured = onDay.filter((s) => s.distractedMinutes !== undefined);

    bars.push({
      date,
      minutes: onDay.reduce((n, s) => n + s.durationMinutes, 0),
      distractedMinutes: measured.length
        ? measured.reduce((n, s) => n + (s.distractedMinutes ?? 0), 0)
        : undefined,
      sessions: onDay.length,
    });
  }

  return bars;
}

export type WeeklyRecap = {
  weekStart: Date;
  sessions: number;
  minutes: number;
  scores: number;
  meanScore: number | null;
  meanSleep: number | null;
  /// Change against the seven days before, in the same units.
  deltaSessions: number;
  deltaMinutes: number;
  /// Null when no session that week was measured by a device.
  distractedMinutes: number | null;
  /// Surfaced insights at the time of the recap, so the email and the
  /// dashboard say the same thing rather than being computed twice.
  headline: ComputedInsight | null;
};

/// The same numbers the periodic recap will send by email.
///
/// One function feeding both surfaces, per the plan: a recap that disagreed
/// with the dashboard would be worse than having no recap.
export function weeklyRecap(
  inputs: InsightInputs,
  now: Date = new Date(),
): WeeklyRecap {
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  const priorStart = new Date(now);
  priorStart.setDate(priorStart.getDate() - 14);

  const thisWeek = inputs.sessions.filter((s) => s.startedAt >= weekStart);
  const priorWeek = inputs.sessions.filter(
    (s) => s.startedAt >= priorStart && s.startedAt < weekStart,
  );

  const minutes = thisWeek.reduce((n, s) => n + s.durationMinutes, 0);
  const priorMinutes = priorWeek.reduce((n, s) => n + s.durationMinutes, 0);

  const scores = inputs.outcomes.filter((o) => o.occurredOn >= weekStart);
  const nights = inputs.sleep.filter((s) => s.forDate >= weekStart);

  const surfaced = computeInsights(inputs).filter((i) => i.isSurfaced);

  return {
    weekStart,
    sessions: thisWeek.length,
    minutes,
    scores: scores.length,
    meanScore: scores.length ? mean(scores.map((s) => s.percentage)) : null,
    meanSleep: nights.length ? mean(nights.map((s) => s.hours)) : null,
    deltaSessions: thisWeek.length - priorWeek.length,
    deltaMinutes: minutes - priorMinutes,
    distractedMinutes: (() => {
      const measured = thisWeek.filter((s) => s.distractedMinutes !== undefined);
      if (measured.length === 0) return null;
      return measured.reduce((n, s) => n + (s.distractedMinutes ?? 0), 0);
    })(),
    headline: surfaced[0] ?? null,
  };
}

// --- wellbeing --------------------------------------------------------------

export type WellbeingAlert = {
  id: string;
  message: string;
  /// What to do about it, if anything. Some of these are worth naming without
  /// prescribing a fix.
  suggestion?: string;
};

/// Patterns that suggest a student is running down rather than studying well.
///
/// Free to include — every input is already collected for other reasons. The
/// wording is the hard part: these are noticed, not diagnosed, and none of
/// them mention grades. Telling a tired fifteen-year-old that their exhaustion
/// is also costing them marks is the opposite of help.
export function wellbeingAlerts(
  inputs: InsightInputs,
  now: Date = new Date(),
): WellbeingAlert[] {
  const alerts: WellbeingAlert[] = [];

  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const recentSleep = inputs.sleep
    .filter((s) => s.forDate >= weekAgo)
    .sort((a, b) => b.forDate.getTime() - a.forDate.getTime());

  // Compared against their own usual, not a general target.
  const allSleep = inputs.sleep.map((s) => s.hours);
  const baseline = allSleep.length >= 5 ? mean(allSleep) : null;

  if (baseline !== null && recentSleep.length >= 4) {
    const weekMean = mean(recentSleep.map((s) => s.hours));
    if (weekMean < baseline - 1) {
      alerts.push({
        id: "sleep_below_usual",
        message: `You've been sleeping about ${(baseline - weekMean).toFixed(1)} hours less than your usual this week.`,
        suggestion:
          "Worth knowing, not worth worrying about on its own. It tends to catch up over a fortnight.",
      });
    }
  }

  // Three or more consecutive nights under five hours. An absolute floor is
  // justified here in a way it isn't for grades — this is about a person, not
  // a comparison.
  const shortRun = recentSleep.slice(0, 3);
  if (shortRun.length === 3 && shortRun.every((s) => s.hours < 5)) {
    alerts.push({
      id: "short_sleep_streak",
      message: "That's three nights in a row under five hours.",
      suggestion:
        "If something is keeping you up that isn't schoolwork, that's worth telling someone about.",
    });
  }

  const recentSessions = inputs.sessions.filter((s) => s.startedAt >= weekAgo);

  const lateNights = recentSessions.filter((s) => {
    const h = s.startedAt.getHours();
    return h >= 23 || h < 4;
  });
  if (lateNights.length >= 4) {
    alerts.push({
      id: "late_night_run",
      message: `${lateNights.length} of your sessions this week started after 11 PM.`,
    });
  }

  const cramming = recentSessions.filter((s) => s.wasCram);
  if (cramming.length >= 3) {
    alerts.push({
      id: "cram_run",
      message: `You've marked ${cramming.length} sessions as cramming this week.`,
      suggestion:
        "Sometimes that's just how a week lands. If it's every week, the timetable may be the problem rather than you.",
    });
  }

  const stressed = recentSessions.filter((s) => (s.stress ?? 0) >= 4);
  if (stressed.length >= 4) {
    alerts.push({
      id: "sustained_stress",
      message: "Most of your sessions this week were logged as high stress.",
      suggestion:
        "Insight can't tell you why, and it isn't trying to. But a counsellor or a parent might be worth talking to.",
    });
  }

  const marathon = recentSessions.filter((s) => s.durationMinutes >= 240);
  if (marathon.length >= 2) {
    alerts.push({
      id: "very_long_sessions",
      message: `You had ${marathon.length} sessions over four hours this week.`,
    });
  }

  return alerts;
}
