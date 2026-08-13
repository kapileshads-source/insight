/**
 * Asking for last night's sleep in the morning, and today's phone time at night.
 *
 * These two numbers are the whole basis of four of the seven insight factors,
 * and both have to be typed in by hand — nothing measures them for us. A
 * student who logs them for a fortnight and then stops leaves the engine with
 * a dataset that quietly stops meaning anything, because the days that are
 * missing are not the same kind of day as the days that are there. Someone who
 * forgets to log sleep after a four-hour night is not forgetting at random.
 *
 * So this asks, and keeps asking. The design is *slightly* forced, and the word
 * slightly is doing real work:
 *
 *  - It appears at the top of the dashboard when due and does not go away on
 *    its own. Nothing is blocked; a student can start a session, log a score,
 *    and use the whole app around it.
 *  - It counts the days it has been missed out loud. "Three mornings" is a
 *    fact about the data, not a scold, and it is the honest reason the
 *    insights below it are getting worse.
 *  - Skipping is always available and always writes a gap, so a skipped night
 *    is visible to the engine rather than being read as a night of zero.
 *
 * The escalation stops there deliberately. A tracker that locks a student out
 * of their own study timer until they answer a question is a tracker that gets
 * uninstalled in a bad week — and then it measures nothing at all, which is
 * worse than a few missing nights.
 *
 * Everything here is pure and takes `now` explicitly, because "is it morning?"
 * is the entire question and a function that reads the clock itself can't be
 * tested against 6 AM.
 */

export type RoutineKind = "SLEEP" | "SCREEN_TIME";

export type RoutineTask = {
  kind: RoutineKind;
  /// The date the entry belongs to — last night for sleep, today for phone
  /// time. Not the date it's being asked on.
  forDate: string;
  /// How many earlier days are also missing. Zero means this is the first ask.
  missedDays: number;
  /// True once it has been outstanding long enough to be worth a firmer word.
  overdue: boolean;
};

/// Sleep is asked for from waking until early afternoon. After that a student
/// is guessing, and a guessed number is worse than a gap because the engine
/// can't tell it apart from a measured one.
export const SLEEP_WINDOW = { fromHour: 4, toHour: 14 } as const;

/// Phone time is asked for in the evening. Before this the day isn't over and
/// the number would be wrong; after 3 AM it belongs to the next day.
export const SCREEN_TIME_WINDOW = { fromHour: 19, toHour: 27 } as const;

/// Missing this many days before the wording firms up.
export const OVERDUE_AFTER = 2;

/// How far back to look for missed days. A fortnight is enough to notice a
/// habit slipping without presenting a student with a month of failure.
const LOOKBACK_DAYS = 14;

/**
 * The date key in the student's own timezone.
 *
 * Shared with the schedule code's convention: `en-CA` formats as YYYY-MM-DD,
 * which sorts and compares as a string.
 */
export function dateKey(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/// The hour, 0–23, in the student's own timezone.
export function hourIn(at: Date, timezone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
    }).format(at),
  );
}

function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/// True when `hour` falls inside a window that may run past midnight.
export function inWindow(
  hour: number,
  window: { fromHour: number; toHour: number },
): boolean {
  if (window.toHour <= 24) return hour >= window.fromHour && hour < window.toHour;
  // A window like 19:00–03:00 is expressed as 19→27 so it stays one comparison.
  return hour >= window.fromHour || hour < window.toHour - 24;
}

function countMissed(
  logged: Set<string>,
  latestKey: string,
  limit = LOOKBACK_DAYS,
): number {
  let missed = 0;
  // Start one day before the one being asked about: that one is the ask, not
  // a miss, and counting it would say "1 missed" the very first time.
  for (let back = 1; back <= limit; back++) {
    if (logged.has(shiftKey(latestKey, -back))) break;
    missed++;
  }
  return missed;
}

export type RoutineInputs = {
  now: Date;
  timezone: string;
  /// Date keys (YYYY-MM-DD) that already have a sleep entry.
  sleepLogged: string[];
  /// Date keys that already have a phone screen-time entry.
  screenTimeLogged: string[];
};

/**
 * What to ask for right now — nothing, or one thing.
 *
 * Never both: the two windows don't overlap, and that is deliberate rather
 * than incidental. Two questions at once is a form to fill in, and a form gets
 * dismissed as a unit. One question, twice a day, at the moment the answer is
 * actually known.
 *
 * 1 AM asks about phone time and not about sleep, because the night hasn't
 * happened yet — the sleep window opens at 4 AM for exactly that reason.
 */
export function routineDue(inputs: RoutineInputs): RoutineTask[] {
  const { now, timezone } = inputs;
  const today = dateKey(now, timezone);
  const hour = hourIn(now, timezone);
  const sleep = new Set(inputs.sleepLogged);
  const screen = new Set(inputs.screenTimeLogged);

  const tasks: RoutineTask[] = [];

  // Sleep belongs to the night just past, which we file under today's date —
  // the same convention the sleep log itself uses.
  if (inWindow(hour, SLEEP_WINDOW) && !sleep.has(today)) {
    const missedDays = countMissed(sleep, today);
    tasks.push({
      kind: "SLEEP",
      forDate: today,
      missedDays,
      overdue: missedDays >= OVERDUE_AFTER,
    });
  }

  if (inWindow(hour, SCREEN_TIME_WINDOW)) {
    // After midnight the evening being asked about is yesterday's.
    const forDate = hour < SCREEN_TIME_WINDOW.fromHour ? shiftKey(today, -1) : today;
    if (!screen.has(forDate)) {
      const missedDays = countMissed(screen, forDate);
      tasks.push({
        kind: "SCREEN_TIME",
        forDate,
        missedDays,
        overdue: missedDays >= OVERDUE_AFTER,
      });
    }
  }

  return tasks;
}

/**
 * What the card says.
 *
 * Kept here rather than in the component so the escalation is testable — the
 * whole point of "slightly forced" is that the wording firms up without ever
 * becoming a telling-off, and that is a rule worth pinning down in tests
 * rather than leaving to whoever edits the JSX next.
 */
export function routineWording(task: RoutineTask): {
  title: string;
  detail: string;
} {
  if (task.kind === "SLEEP") {
    if (task.missedDays === 0) {
      return {
        title: "How did you sleep?",
        detail: "Last night, roughly. A guess is fine — it's the pattern that matters.",
      };
    }
    return {
      title: "How did you sleep?",
      detail:
        `${task.missedDays + 1} mornings unlogged now. Sleep feeds four of the ` +
        "seven things Insight looks at, and the missing nights aren't a random sample.",
    };
  }

  if (task.missedDays === 0) {
    return {
      title: "Phone time today?",
      detail: "Settings → Screen Time, or drop in a screenshot and we'll read it.",
    };
  }
  return {
    title: "Phone time today?",
    detail:
      `${task.missedDays + 1} nights unlogged now. Without it, phone use just ` +
      "drops out of your insights rather than showing up as zero.",
  };
}
