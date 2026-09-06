/**
 * The nudge that asks for last night's sleep, and tonight's phone time.
 *
 * The dashboard already asks, but only if a student happens to open it — and
 * the two numbers this needs are the ones nothing can measure for us. Someone
 * who forgets for a week doesn't leave a smaller dataset, they leave a biased
 * one: the nights that go unlogged are not a random sample of nights.
 *
 * A push is the only thing that reaches a phone that isn't being looked at.
 *
 * **The server can decide who to ask without reading anything.** A sleep entry
 * for today either exists or it doesn't, and row existence is plaintext by
 * design. It never learns how long anyone slept — only that a row is missing.
 *
 * **The message carries no data**, because the server has none to put in it.
 * "How did you sleep?" is the whole payload, which also means a lock-screen
 * notification never shows a number to whoever picks the phone up.
 */

export type NudgeKind = "SLEEP" | "SCREEN_TIME" | "DUE_WORK";

export type NudgeAudience = {
  /// The device agreed to be asked at all.
  subscribed: boolean;
  /// And agreed to be asked about *this*. Either can be switched off without
  /// unsubscribing the device.
  enabled: boolean;
  /// Whether the entry this nudge is about already exists.
  alreadyLogged: boolean;
  /// Set when this endpoint has been rejected as gone. A browser that was
  /// uninstalled returns 404 or 410, and retrying forever is both useless and
  /// rude.
  failed: boolean;
};

export function shouldNudge(a: NudgeAudience): boolean {
  if (!a.subscribed || !a.enabled) return false;
  if (a.failed) return false;
  return !a.alreadyLogged;
}

/**
 * What the notification says.
 *
 * Short, because a lock screen truncates, and unhurried, because the point is
 * a number typed in — not guilt. The same rule as the dashboard card: it may
 * say how long it has been, and it may say why that matters, but it never
 * tells anyone off.
 */
export function nudgeMessage(
  kind: NudgeKind,
  missedDays: number,
): { title: string; body: string } {
  if (kind === "SLEEP") {
    return {
      title: "How did you sleep?",
      body:
        missedDays >= 2
          ? `${missedDays + 1} mornings unlogged. A rough number is plenty.`
          : "Last night, roughly — it takes five seconds.",
    };
  }

  return {
    title: "Phone time today?",
    body:
      missedDays >= 2
        ? `${missedDays + 1} nights unlogged. Settings → Screen Time has it.`
        : "Settings → Screen Time, or drop in a screenshot.",
  };
}

/**
 * What the "due tomorrow" reminder says.
 *
 * **The count is of assignments due, not of work outstanding, and the wording
 * has to keep that distinction.** Whether something has been handed in lives in
 * the encrypted payload, so the server genuinely cannot tell — it can only see
 * that a due date is tomorrow and that no grade has landed against it yet. For
 * work due tomorrow those are usually the same thing, but not always, and
 * "3 things you still need to do" would sometimes be a lie.
 *
 * "3 due tomorrow" is true either way. The app itself, which can decrypt, shows
 * the filtered list once opened — which is the point of the reminder.
 */
export function dueWorkMessage(
  dueTomorrow: number,
  overdue: number,
): { title: string; body: string } {
  if (overdue > 0 && dueTomorrow > 0) {
    return {
      title: `${dueTomorrow} due tomorrow`,
      body: `And ${overdue} past its date. Open Insight to see what's left.`,
    };
  }
  if (overdue > 0) {
    return {
      title: `${overdue} past its due date`,
      body: "Still worth handing in — have a look at what's outstanding.",
    };
  }
  return {
    title: `${dueTomorrow} due tomorrow`,
    body:
      dueTomorrow === 1
        ? "One thing on the list. Worth a look tonight."
        : "Worth a look tonight rather than in the morning.",
  };
}

/// Nothing due and nothing late is not worth a notification. A reminder that
/// fires every evening saying "0 due" trains people to swipe it away, and then
/// the one that mattered gets swiped too.
export function shouldSendDueWork(
  dueTomorrow: number,
  overdue: number,
): boolean {
  return dueTomorrow > 0 || overdue > 0;
}

/// Where tapping the notification should land.
export const NUDGE_URL = "/dashboard";
