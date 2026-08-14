/**
 * When to pull Canvas again, without being asked.
 *
 * Syncing has to happen in a browser tab, and that is not a limitation to work
 * around — it is the encryption model. The server can call Canvas, but it has
 * no key, so assignment names make a round trip through the student's own
 * browser to be encrypted before they are stored. A server cron could fetch
 * and would have nowhere to put the result.
 *
 * So "every ten minutes" really means "every ten minutes that a tab is open,
 * unlocked, and in front of somebody". Which is fine: a student who isn't
 * looking doesn't need fresher homework.
 *
 * Four things this refuses to do, each of which it did in an earlier draft or
 * would have done without saying so:
 *
 *  - **Sync a hidden tab.** A dashboard left open in a background tab for a
 *    week would call Canvas a thousand times for nobody to read.
 *  - **Sync from every tab at once.** Two windows open means two pulls, and
 *    Canvas rate-limits per token. Tabs coordinate through one timestamp.
 *  - **Sync while locked.** No key, nothing to encrypt with, nothing to store.
 *  - **Retry a broken token on a loop.** A 90-day expiry that died overnight
 *    would otherwise generate a failed call every ten minutes forever.
 */

/// The interval. Ten minutes is short enough that a grade posted during a
/// free period shows up before the end of it, and long enough that a day at
/// the dashboard is well under any rate limit.
export const SYNC_EVERY_MS = 10 * 60 * 1000;

/// After a failure, back off. A dead token is the common case and it stays
/// dead until the student pastes a new one, so hammering it helps nobody.
export const RETRY_AFTER_FAILURE_MS = 60 * 60 * 1000;

export type SyncDecision =
  | { sync: false; because: string }
  | { sync: true; because: string };

export type SyncConditions = {
  now: number;
  connected: boolean;
  /// False when the token has already been rejected. Canvas expires them
  /// every 90 days and there is no recovering without a new one.
  tokenLive: boolean;
  unlocked: boolean;
  /// Whether this tab is the one the student is looking at.
  visible: boolean;
  /// Server-side truth: when the data was last stored.
  lastSyncedAt: number | null;
  /// Shared between tabs, so two windows don't both pull. Also set *before*
  /// a sync starts rather than after, which is what stops two tabs racing in
  /// the same tick.
  lastAttemptAt: number | null;
  /// When the last attempt failed, so failures back off further than
  /// successes do.
  lastFailureAt?: number | null;
};

export function shouldSync(c: SyncConditions): SyncDecision {
  if (!c.connected) return { sync: false, because: "Canvas isn't connected" };
  if (!c.tokenLive) return { sync: false, because: "the token needs replacing" };
  if (!c.unlocked) return { sync: false, because: "the data is locked" };
  if (!c.visible) return { sync: false, because: "this tab isn't in front" };

  if (c.lastFailureAt !== null && c.lastFailureAt !== undefined) {
    const sinceFailure = c.now - c.lastFailureAt;
    if (sinceFailure < RETRY_AFTER_FAILURE_MS) {
      return { sync: false, because: "the last attempt failed recently" };
    }
  }

  // Another tab may have gone first. This is checked before the server's own
  // timestamp because an attempt that is still in flight hasn't updated it.
  if (c.lastAttemptAt !== null && c.now - c.lastAttemptAt < SYNC_EVERY_MS) {
    return { sync: false, because: "another tab synced recently" };
  }

  if (c.lastSyncedAt === null) {
    return { sync: true, because: "nothing has been pulled yet" };
  }

  if (c.now - c.lastSyncedAt >= SYNC_EVERY_MS) {
    return { sync: true, because: "the last pull is over ten minutes old" };
  }

  return { sync: false, because: "the data is fresh" };
}

/// How long until it would be worth asking again — for a timer that shouldn't
/// fire more often than it needs to.
export function msUntilNextSync(c: SyncConditions): number {
  const newest = Math.max(c.lastSyncedAt ?? 0, c.lastAttemptAt ?? 0);
  if (newest === 0) return 0;
  return Math.max(0, SYNC_EVERY_MS - (c.now - newest));
}
