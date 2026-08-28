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

export type NudgeKind = "SLEEP" | "SCREEN_TIME";

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

/// Where tapping the notification should land.
export const NUDGE_URL = "/dashboard";
