"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getCanvasStatus,
  pullCanvas,
  storeCanvasData,
} from "@/app/actions/canvas";
import { useCrypto } from "@/components/crypto-provider";
import {
  msUntilNextSync,
  shouldSync,
  SYNC_EVERY_MS,
  type SyncConditions,
} from "@/lib/canvas-sync";

/**
 * Pull Canvas again while the dashboard is open.
 *
 * The round trip is the interesting part: the server calls Canvas, hands back
 * plaintext, and this encrypts it here before storing it. That is why sync
 * can't be a cron — the server has no key, so it would have nowhere to put
 * what it fetched.
 *
 * Renders nothing. A student who has to watch a spinner to get fresh homework
 * is a student doing the computer's job; the assignments card simply updates.
 * Failures are silent here too, because the Canvas page already reports a dead
 * token in the one place it can be fixed, and a dashboard that shouts about a
 * background task nobody asked for is worse than one that quietly retries in
 * an hour.
 */

/// Shared across tabs so two open windows don't both pull. Written *before*
/// the request goes out, which is what stops two tabs racing in one tick.
const ATTEMPT_KEY = "insight.canvas.lastAttempt";
const FAILURE_KEY = "insight.canvas.lastFailure";

function readStamp(key: string): number | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    // Private browsing. Losing the cross-tab lock costs an extra pull, which
    // is a much smaller problem than not syncing at all.
    return null;
  }
}

function clearStamp(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Harmless: a stale failure stamp only delays the next pull by an hour.
  }
}

function writeStamp(key: string, at: number) {
  try {
    window.localStorage.setItem(key, String(at));
  } catch {
    // As above — the sync still works, it just can't coordinate.
  }
}

export function CanvasAutoSync() {
  const { conceal, status } = useCrypto();
  const [conditions, setConditions] = useState<{
    connected: boolean;
    tokenLive: boolean;
    lastSyncedAt: number | null;
  } | null>(null);

  // A ref rather than state: a sync in flight must block the next tick, and
  // going through a render to say so would let two fire in between.
  const running = useRef(false);

  const refreshStatus = useCallback(async () => {
    const canvas = await getCanvasStatus();
    setConditions({
      connected: canvas.connected,
      tokenLive: !canvas.disconnected,
      lastSyncedAt: canvas.lastSyncedAt
        ? new Date(canvas.lastSyncedAt).getTime()
        : null,
    });
  }, []);

  const attempt = useCallback(async () => {
    if (running.current || !conditions) return;

    const decision = shouldSync({
      now: Date.now(),
      connected: conditions.connected,
      tokenLive: conditions.tokenLive,
      unlocked: status === "unlocked",
      visible: document.visibilityState === "visible",
      lastSyncedAt: conditions.lastSyncedAt,
      lastAttemptAt: readStamp(ATTEMPT_KEY),
      lastFailureAt: readStamp(FAILURE_KEY),
    } satisfies SyncConditions);

    if (!decision.sync) return;

    running.current = true;
    writeStamp(ATTEMPT_KEY, Date.now());

    try {
      const pulled = await pullCanvas();
      if (!pulled.ok) {
        writeStamp(FAILURE_KEY, Date.now());
        // Refresh anyway: a dead token needs to show as disconnected on the
        // Canvas page, and that state comes from the server.
        await refreshStatus();
        return;
      }

      const courses = await Promise.all(
        pulled.data.courses.map(async (c) => ({
          canvasId: c.canvasId,
          payload: await conceal({ name: c.name, shortName: c.shortName }),
        })),
      );

      const assignments = await Promise.all(
        pulled.data.assignments.map(async (a) => ({
          canvasId: a.canvasId,
          courseCanvasId: a.courseCanvasId,
          dueAt: a.dueAt,
          payload: await conceal({
            name: a.name,
            pointsPossible: a.pointsPossible,
            state: a.state,
            score: a.score,
          }),
        })),
      );

      const stored = await storeCanvasData({ courses, assignments });
      if (!stored.ok) {
        writeStamp(FAILURE_KEY, Date.now());
        return;
      }

      clearStamp(FAILURE_KEY);
      await refreshStatus();
    } catch {
      // Encryption failed, or the network went. Either way it is not worth
      // interrupting a student over — the next tick will try again.
      writeStamp(FAILURE_KEY, Date.now());
    } finally {
      running.current = false;
    }
  }, [conditions, conceal, status, refreshStatus]);

  useEffect(() => {
    if (status !== "unlocked") return;
    void refreshStatus();
  }, [status, refreshStatus]);

  useEffect(() => {
    if (status !== "unlocked" || !conditions?.connected) return;

    void attempt();

    // Checked more often than the interval so that coming back to a tab left
    // open overnight syncs promptly rather than up to ten minutes later.
    const timer = window.setInterval(() => void attempt(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void attempt();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status, conditions?.connected, attempt]);

  return null;
}

export { SYNC_EVERY_MS, msUntilNextSync };
