"use client";

import { useCallback, useEffect, useState } from "react";

import { routineStatus, saveSleep, saveScreenTime } from "@/app/actions/logs";
import { useCrypto } from "@/components/crypto-provider";
import { routineDue, routineWording, type RoutineTask } from "@/lib/routine";

/**
 * The morning and evening ask.
 *
 * Sleep and phone time are the only two numbers nothing can measure for us,
 * and four of the seven insight factors rest on them. A student who stops
 * logging doesn't leave a smaller dataset — they leave a biased one, because
 * the nights that go unlogged are not a random sample of nights.
 *
 * So it sits at the top and it comes back. What it never does is block:
 * the timer, the session, the whole app stays usable around it. "Not tonight"
 * is one tap, and tomorrow it asks again with the count gone up. That is the
 * whole of the force, and it stops there on purpose — a tracker that holds a
 * student's own study timer hostage is one that gets deleted in a bad week,
 * and then it measures nothing at all.
 */

/// Skipping is remembered on the device rather than the server: it is a "not
/// now", not a fact about the student worth storing. The date is in the key,
/// so tomorrow's ask arrives regardless.
const skipKey = (task: RoutineTask) => `insight.skip.${task.kind}.${task.forDate}`;

function wasSkipped(task: RoutineTask): boolean {
  try {
    return window.localStorage.getItem(skipKey(task)) === "1";
  } catch {
    // Private browsing, or storage full. Asking twice is the safe failure.
    return false;
  }
}

export function RoutinePrompt() {
  const { conceal, status } = useCrypto();
  const [task, setTask] = useState<RoutineTask | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const state = await routineStatus();
    if (!state) return;

    const due = routineDue({ now: new Date(), ...state });
    setTask(due.find((t) => !wasSkipped(t)) ?? null);
  }, []);

  useEffect(() => {
    // `refresh` awaits a round trip before it touches state, so there is no
    // cascading render for the rule to see — and the data arrives as
    // ciphertext, so this cannot happen anywhere but the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "unlocked") void refresh();
  }, [status, refresh]);

  if (status !== "unlocked" || !task) return null;

  const isSleep = task.kind === "SLEEP";

  async function save() {
    if (!task) return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("A number, roughly.");
      return;
    }
    // Nobody sleeps 30 hours or spends 40 hours on a phone in a day. Catching
    // it here saves an outlier that would distort a whole term's averages.
    if (isSleep && parsed > 24) {
      setError("Hours, not minutes.");
      return;
    }
    if (!isSleep && parsed > 1440) {
      setError("Minutes in a day, at most.");
      return;
    }

    setSaving(true);
    setError(null);

    const sealed = await conceal(
      isSleep ? { hours: parsed } : { minutes: Math.round(parsed), editedByUser: true },
    );

    const result = isSleep
      ? await saveSleep(task.forDate, sealed)
      : await saveScreenTime(task.forDate, "MANUAL", sealed);

    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setValue("");
    await refresh();
  }

  function skip() {
    if (!task) return;
    try {
      window.localStorage.setItem(skipKey(task), "1");
    } catch {
      // Nothing to do — it'll ask again on the next load, which is the
      // behaviour we'd have chosen anyway.
    }
    setTask(null);
  }

  return (
    <RoutineCard
      task={task}
      value={value}
      onChange={setValue}
      onSave={() => void save()}
      onSkip={skip}
      saving={saving}
      error={error}
    />
  );
}

/**
 * The card, with no crypto and no fetching.
 *
 * Split out so it can be rendered against a made-up task and looked at. The
 * panel above needs an unlocked key and the right hour of the day, which makes
 * the one thing worth checking — how firm does this actually read? — the one
 * thing hardest to see.
 */
export function RoutineCard({
  task,
  value,
  onChange,
  onSave,
  onSkip,
  saving = false,
  error = null,
}: {
  task: RoutineTask;
  value: string;
  onChange: (next: string) => void;
  onSave: () => void;
  onSkip: () => void;
  saving?: boolean;
  error?: string | null;
}) {
  const { title, detail } = routineWording(task);
  const isSleep = task.kind === "SLEEP";

  return (
    <section
      className={`rounded-lg border p-6 ${
        task.overdue ? "border-alert/40 bg-surface" : "border-line bg-surface"
      }`}
    >
      <h2 className="h3 text-[17px]">{title}</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-text-muted">{detail}</p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            step={isSleep ? "0.5" : "1"}
            min="0"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
            }}
            // Autofocused because this is the only thing being asked for, and
            // a student who opened the app to start a session shouldn't have
            // to aim at a small box first.
            autoFocus
            placeholder={isSleep ? "7.5" : "180"}
            aria-label={isSleep ? "Hours slept" : "Minutes on your phone"}
            className="w-24 rounded border border-line bg-bg px-3 py-2 text-[15px] text-text"
          />
          <span className="text-[15px] text-text-muted">
            {isSleep ? "hours" : "minutes"}
          </span>
        </label>

        <button
          type="button"
          onClick={onSave}
          disabled={saving || value.trim() === ""}
          className="rounded bg-accent px-4 py-2 text-[15px] text-on-light disabled:opacity-40"
        >
          {saving ? "Saving…" : "Log it"}
        </button>

        <button
          type="button"
          onClick={onSkip}
          className="text-[14px] text-text-faint hover:text-text-muted"
        >
          {/* The sleep ask happens at breakfast; "not tonight" reads as a
              different question entirely. */}
          {isSleep ? "Not this morning" : "Not tonight"}
        </button>
      </div>

      {error && <p className="mt-3 text-[14px] text-down">{error}</p>}

      {!isSleep && (
        <p className="mt-4 text-[13px] leading-relaxed text-text-faint">
          Settings → Screen Time on your phone. A screenshot works too — the
          dashboard reads it without the image leaving your device.
        </p>
      )}
    </section>
  );
}
