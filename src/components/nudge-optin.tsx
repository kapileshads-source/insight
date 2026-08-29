"use client";

import { useCallback, useEffect, useState } from "react";

import {
  getNudgePreferences,
  pushSubscribed,
  removePushSubscription,
  savePushSubscription,
  setNudgePreferences,
} from "@/app/actions/push";

/**
 * Turning the daily nudges on.
 *
 * The two numbers Insight can't measure have to be typed in, and the dashboard
 * can only ask someone who opens it. This is the part that reaches a phone
 * nobody is looking at — one question in the morning, one in the evening, and
 * only on days something is actually missing.
 *
 * Asking for notification permission unprompted is the fastest way to get it
 * denied forever, so this explains itself first and only calls
 * `Notification.requestPermission()` from a click. A denial is final in most
 * browsers — there is no second chance — which is why the button never appears
 * on its own.
 */

/// The push service wants the key as bytes, and it arrives as base64url.
function decodeKey(base64: string): Uint8Array {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

type State =
  | { kind: "unsupported" }
  | { kind: "blocked" }
  | { kind: "off" }
  | { kind: "on"; endpoint: string }
  | { kind: "working" };

export function NudgeOptIn() {
  const [state, setState] = useState<State | null>(null);
  const [prefs, setPrefs] = useState({ sleepNudge: true, screenTimeNudge: true });

  const look = useCallback(async () => {
    // iOS only allows this in an installed Home Screen app, so on a Safari tab
    // the whole feature genuinely isn't there.
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setState({ kind: "unsupported" });
      return;
    }

    if (Notification.permission === "denied") {
      setState({ kind: "blocked" });
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();

    if (existing && (await pushSubscribed(existing.endpoint))) {
      const saved = await getNudgePreferences(existing.endpoint);
      if (saved) setPrefs(saved);
      setState({ kind: "on", endpoint: existing.endpoint });
      return;
    }

    setState({ kind: "off" });
  }, []);

  useEffect(() => {
    void look();
  }, [look]);

  async function turnOn() {
    setState({ kind: "working" });

    // Must be called from the click, not after an await, or the browser treats
    // it as unprompted and refuses.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setState(permission === "denied" ? { kind: "blocked" } : { kind: "off" });
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        setState({ kind: "unsupported" });
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        // Required to be true by every browser: a push must always show
        // something, and may not be used to wake the app silently.
        userVisibleOnly: true,
        // Same cast the crypto module uses: a Uint8Array is a BufferSource,
        // but the DOM types don't line up across the generic.
        applicationServerKey: decodeKey(key) as unknown as BufferSource,
      });

      const raw = subscription.toJSON();
      const saved = await savePushSubscription({
        endpoint: subscription.endpoint,
        p256dh: raw.keys?.p256dh ?? "",
        auth: raw.keys?.auth ?? "",
      });

      setState(
        saved.ok
          ? { kind: "on", endpoint: subscription.endpoint }
          : { kind: "off" },
      );
    } catch {
      setState({ kind: "off" });
    }
  }

  async function turnOff() {
    setState({ kind: "working" });
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
    } catch {
      // Losing the local subscription while the row remains is harmless: the
      // next push comes back as gone and the row is retired.
    }
    setState({ kind: "off" });
  }

  if (!state || state.kind === "unsupported") return null;

  async function toggle(which: "sleepNudge" | "screenTimeNudge") {
    if (state?.kind !== "on") return;
    const next = { ...prefs, [which]: !prefs[which] };
    setPrefs(next);
    await setNudgePreferences({ endpoint: state.endpoint, ...next });
  }

  return (
    <NudgeCard
      state={state}
      prefs={prefs}
      onToggle={(which) => void toggle(which)}
      onTurnOn={() => void turnOn()}
      onTurnOff={() => void turnOff()}
    />
  );
}

/**
 * The card, with no browser APIs in it, so it can be rendered and read.
 *
 * What matters here is that a student can tell what they are agreeing to
 * before they agree — a denied notification permission is permanent in most
 * browsers, and there is no asking again.
 */
export function NudgeCard({
  state,
  prefs = { sleepNudge: true, screenTimeNudge: true },
  onToggle,
  onTurnOn,
  onTurnOff,
}: {
  state: State;
  prefs?: { sleepNudge: boolean; screenTimeNudge: boolean };
  onToggle?: (which: "sleepNudge" | "screenTimeNudge") => void;
  onTurnOn: () => void;
  onTurnOff: () => void;
}) {
  if (state.kind === "blocked") {
    return (
      <section className="mt-10 rounded-lg border border-line bg-surface p-6">
        <h2 className="h3 text-[17px]">Daily reminders are blocked</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
          Your browser is set to refuse notifications from Insight, and it
          won&rsquo;t ask again. You can change it in your browser&rsquo;s site
          settings — everything else works without it.
        </p>
      </section>
    );
  }

  if (state.kind === "on") {
    return (
      <section className="mt-10 rounded-lg border border-line bg-surface p-6">
        <h2 className="h3 text-[17px]">Daily reminders are on</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
          Only on days you haven&rsquo;t already logged.
        </p>

        {/* Two switches rather than one, because "stop asking about my phone
            but keep asking about sleep" is a reasonable thing to want — and
            all-or-nothing is how someone turns off the one they'd have
            answered. */}
        <div className="mt-4 space-y-2">
          <label className="flex items-center gap-3 text-[15px] text-text-muted">
            <input
              type="checkbox"
              checked={prefs.sleepNudge}
              onChange={() => onToggle?.("sleepNudge")}
              className="h-4 w-4 accent-sky"
            />
            Mornings — how did you sleep?
          </label>
          <label className="flex items-center gap-3 text-[15px] text-text-muted">
            <input
              type="checkbox"
              checked={prefs.screenTimeNudge}
              onChange={() => onToggle?.("screenTimeNudge")}
              className="h-4 w-4 accent-sky"
            />
            Evenings — phone time today?
          </label>
        </div>

        <button
          type="button"
          onClick={onTurnOff}
          className="mt-4 text-[14px] text-text-faint hover:text-text-muted"
        >
          Turn them off
        </button>
      </section>
    );
  }

  return (
    <section className="mt-10 rounded-lg border border-line bg-surface p-6">
      <h2 className="h3 text-[17px]">Get reminded</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
        Sleep and phone time are the only two things Insight can&rsquo;t measure
        for itself, and they feed four of the seven patterns it looks for.
        Two reminders a day — morning and evening — and nothing on the days
        you&rsquo;ve already logged.
      </p>
      <button
        type="button"
        onClick={onTurnOn}
        disabled={state.kind === "working"}
        className="mt-4 rounded bg-sky px-4 py-2 text-[15px] text-on-light disabled:opacity-40"
      >
        {state.kind === "working" ? "Just a second…" : "Turn on reminders"}
      </button>
      <p className="mt-4 text-[13px] leading-relaxed text-text-faint">
        The reminder itself says nothing about you — just the question. Insight
        can see that a night is unlogged, never what you would have written.
      </p>
    </section>
  );
}
