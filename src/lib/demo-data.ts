/**
 * A term of plausible study data, for a demo account.
 *
 * The insight engine has never met a human, which makes it impossible to show
 * anyone what the app is *for*, an empty dashboard demonstrates nothing. This
 * generates a student who studies the way students actually do, so the engine
 * can be pointed at something and the result looked at.
 *
 * **This is sample data and must never be presented as real usage.** Run it in
 * a separate account, never one holding real logs: the engine averages
 * outcomes, so mixing invented scores into a genuine term would produce
 * findings drawn half from fiction, and nothing on screen would say which.
 * Deleting the demo account afterwards is the whole cleanup.
 *
 * It runs in the browser, because everything it writes is encrypted with a key
 * only the browser has. That is not a workaround, it is the same constraint
 * every other write in this app is under, and a demo generator that could run
 * server-side would mean the encryption wasn't real.
 *
 * **The pattern is planted deliberately**, not random: this student scores
 * worse after late nights and short sleep. That is what makes the demo
 * meaningful, you can check whether the engine finds what was put there, and
 * whether it stays quiet about the factors that were left as noise.
 */

import type { Location, NoiseLevel } from "./records";

export type DemoSession = {
  startedAt: Date;
  endedAt: Date;
  durationMinutes: number;
  subject: string;
  location: Location;
  noise: NoiseLevel;
  stress: number;
  wasCram: boolean;
  focusModeActive: boolean;
  distractedMinutes: number;
};

export type DemoDay = { date: string; hours: number };
export type DemoScreenTime = { date: string; minutes: number };
export type DemoOutcome = {
  date: string;
  percentage: number;
  subject: string;
  label: string;
};

export type DemoData = {
  sessions: DemoSession[];
  sleep: DemoDay[];
  screenTime: DemoScreenTime[];
  outcomes: DemoOutcome[];
};

// Three, not four. The engine matches sessions to a test by subject, so
// spreading a term across more classes leaves two or three sessions behind
// each score, too thin for any comparison to clear its gates.
const SUBJECTS = ["AP Biology", "Algebra II", "World History"];
const LOCATIONS: Location[] = ["HOME", "LIBRARY", "CLASSROOM", "OTHER"];
const NOISES: NoiseLevel[] = ["SILENT", "QUIET", "SOME", "LOUD"];

/// Seeded, so the same demo account is reproducible. A demo that looks
/// different every time can't be discussed, screenshotted, or checked.
function generator(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

const dateKey = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Build a term.
 *
 * `weeks` back from `endingOn`. Twelve is enough for the engine's gates to
 * pass, it wants eight sessions behind a comparison and the pattern holding
 * across more than one week, without inventing a year of history.
 */
export function buildDemoData({
  endingOn = new Date(),
  weeks = 12,
  seed = 20260826,
}: {
  endingOn?: Date;
  weeks?: number;
  seed?: number;
} = {}): DemoData {
  const rand = generator(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];

  const days = weeks * 7;
  const start = new Date(endingOn);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days);

  const dayAt = (offset: number) => {
    const d = new Date(start);
    d.setDate(d.getDate() + offset);
    return d;
  };

  const sessions: DemoSession[] = [];
  const sleep: DemoDay[] = [];
  const screenTime: DemoScreenTime[] = [];
  const outcomes: DemoOutcome[] = [];

  // Sleep and phone time every day, with the usual weekend drift.
  const sleepByDay = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const date = dayAt(i);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    // Brackets matter here: `x + rand() * 1.8 * 10` rounds to a tenth of the
    // wrong number, and gave every student about ninety minutes a night.
    const hours = Math.round(((weekend ? 8.5 : 6.6) + rand() * 1.8) * 10) / 10;
    sleepByDay.set(dateKey(date), hours);
    sleep.push({ date: dateKey(date), hours });
    screenTime.push({
      date: dateKey(date),
      minutes: Math.round((weekend ? 260 : 165) + rand() * 120),
    });
  }

  const meanSleep =
    sleep.reduce((sum, s) => sum + s.hours, 0) / Math.max(sleep.length, 1);

  // Roughly four sessions a week, none at weekends for this student.
  for (let i = 0; i < days; i++) {
    const date = dayAt(i);
    const weekday = date.getDay();
    if (weekday === 0 || weekday === 6) continue;
    if (rand() > 0.9) continue;

    // A third of sessions run late. This is the planted pattern.
    const late = rand() < 0.33;
    const startedAt = new Date(date);
    startedAt.setHours(late ? 23 : 16 + Math.floor(rand() * 3), Math.floor(rand() * 60), 0, 0);

    const durationMinutes = 25 + Math.floor(rand() * 75);
    const endedAt = new Date(startedAt.getTime() + durationMinutes * 60_000);
    const focusModeActive = rand() < 0.6;

    sessions.push({
      startedAt,
      endedAt,
      durationMinutes,
      subject: pick(SUBJECTS),
      location: pick(LOCATIONS),
      noise: pick(NOISES),
      stress: 1 + Math.floor(rand() * 5),
      wasCram: late && rand() < 0.5,
      focusModeActive,
      // Focus Mode genuinely helps, so distraction is lower when it was on.
      distractedMinutes: focusModeActive
        ? Math.floor(rand() * 6)
        : Math.floor(rand() * 22),
    });
  }

  // A test every few days, rotating through the subjects. The engine needs at
  // least three outcomes either side of a comparison, so a term with only a
  // handful of scores can't surface anything however strong the pattern is.
  for (let i = 10; i < days; i += 3) {
    const date = dayAt(i);
    // Tests land on school days. Shifted rather than skipped, so the count
    // doesn't quietly drop by two sevenths.
    if (date.getDay() === 0) date.setDate(date.getDate() + 1);
    if (date.getDay() === 6) date.setDate(date.getDate() + 2);

    const subject = SUBJECTS[i % SUBJECTS.length];
    const windowStart = new Date(date);
    windowStart.setDate(windowStart.getDate() - 7);

    const prep = sessions.filter(
      (s) =>
        s.subject === subject &&
        s.startedAt >= windowStart &&
        s.startedAt <= date,
    );
    if (prep.length === 0) continue;

    const lateShare =
      prep.filter((s) => s.startedAt.getHours() >= 23).length / prep.length;
    const hours = sleepByDay.get(dateKey(date)) ?? meanSleep;

    // The two planted effects, plus real noise. Kept large enough to survive
    // the permutation test, a demo where nothing surfaces demonstrates
    // nothing.
    const percentage =
      88 +
      (rand() - 0.5) * 9 -
      lateShare * 24 -
      (hours < meanSleep ? 7 : 0);

    outcomes.push({
      date: dateKey(date),
      percentage: Math.round(Math.max(45, Math.min(100, percentage)) * 10) / 10,
      subject,
      label: `${subject} test`,
    });
  }

  return { sessions, sleep, screenTime, outcomes };
}
