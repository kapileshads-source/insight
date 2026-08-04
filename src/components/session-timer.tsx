"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCrypto } from "@/components/crypto-provider";
import {
  LOCATIONS,
  LOCATION_LABELS,
  NOISE_LABELS,
  NOISE_LEVELS,
  formatDuration,
  type Location,
  type NoiseLevel,
  type SessionPayload,
} from "@/lib/records";
import {
  discardSession,
  startSession,
  stopSession,
} from "@/app/actions/sessions";

function elapsedSeconds(from: Date): number {
  return Math.max(0, Math.floor((Date.now() - from.getTime()) / 1000));
}

function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const CHIP =
  "rounded-md border border-line-hi px-4 py-2 text-[15px] transition-colors";
const CHIP_ON = "border-sky bg-sky text-on-light";

export function SessionTimer({
  running,
  recentSubjects,
}: {
  running: { id: string; startedAt: string } | null;
  recentSubjects: string[];
}) {
  const router = useRouter();
  const { conceal } = useCrypto();
  const [pending, startTransition] = useTransition();

  const [sessionId, setSessionId] = useState(running?.id ?? null);
  const [startedAt, setStartedAt] = useState<Date | null>(
    running ? new Date(running.startedAt) : null,
  );
  const [seconds, setSeconds] = useState(
    running ? elapsedSeconds(new Date(running.startedAt)) : 0,
  );
  const [error, setError] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [location, setLocation] = useState<Location | null>(null);
  const [noise, setNoise] = useState<NoiseLevel | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [wasCram, setWasCram] = useState(false);

  // Ticks off wall-clock time rather than counting intervals, so a backgrounded
  // tab or a sleeping laptop doesn't quietly lose minutes from the total.
  //
  // The first value is set when the timer starts rather than here — writing
  // state synchronously inside an effect causes a second render before paint
  // for no benefit, since the interval corrects it a tick later anyway.
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setSeconds(elapsedSeconds(startedAt)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  function begin() {
    setError(null);
    startTransition(async () => {
      const res = await startSession();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const now = new Date();
      setSessionId(res.id);
      setStartedAt(now);
      setSeconds(elapsedSeconds(now));
    });
  }

  function finish() {
    if (!sessionId || !startedAt) return;
    setError(null);

    startTransition(async () => {
      try {
        const payload: SessionPayload = {
          durationMinutes: Math.max(1, Math.round(seconds / 60)),
          ...(subject.trim() ? { subject: subject.trim() } : {}),
          ...(location ? { location } : {}),
          ...(noise ? { noise } : {}),
          ...(stress ? { stress } : {}),
          ...(wasCram ? { wasCram } : {}),
        };

        // Encrypted here. The server receives ciphertext and stores it without
        // ever knowing what subject this was or where they were sitting.
        const sealed = await conceal(payload);
        const res = await stopSession(sessionId, sealed);
        if (!res.ok) {
          setError(res.error);
          return;
        }

        setSessionId(null);
        setStartedAt(null);
        setSeconds(0);
        setSubject("");
        setLocation(null);
        setNoise(null);
        setStress(null);
        setWasCram(false);
        router.refresh();
      } catch {
        setError("Couldn't save that session. Your timer is still running.");
      }
    });
  }

  function discard() {
    if (!sessionId) return;
    startTransition(async () => {
      await discardSession(sessionId);
      setSessionId(null);
      setStartedAt(null);
      setSeconds(0);
      router.refresh();
    });
  }

  if (!startedAt) {
    return (
      <div>
        <button
          onClick={begin}
          disabled={pending}
          className="btn-primary-inverted px-7 py-3.5 text-[16px] disabled:opacity-60"
        >
          {pending ? "Starting…" : "Start studying"}
        </button>
        {error && (
          <p role="alert" className="mt-3 text-[15px] text-down">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="label text-text-faint">Studying</div>
          <div className="figure mt-2 text-[2.75rem] tabular-nums">
            {clock(seconds)}
          </div>
        </div>
        <button
          onClick={discard}
          disabled={pending}
          className="text-[14px] text-text-faint underline underline-offset-2"
        >
          Discard
        </button>
      </div>

      <div className="mt-7 space-y-6">
        <div>
          <label htmlFor="subject" className="label text-text-muted">
            What are you working on?
          </label>
          <input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            list="recent-subjects"
            placeholder="Chemistry"
            className="mt-2 w-full rounded-md border border-line-hi bg-bg px-4 py-3 text-[16px] text-text focus:border-sky"
          />
          <datalist id="recent-subjects">
            {recentSubjects.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        <fieldset>
          <legend className="label text-text-muted">Where?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {LOCATIONS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLocation(location === l ? null : l)}
                className={`${CHIP} ${location === l ? CHIP_ON : "text-text-muted"}`}
              >
                {LOCATION_LABELS[l]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="label text-text-muted">How loud is it?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {NOISE_LEVELS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNoise(noise === n ? null : n)}
                className={`${CHIP} ${noise === n ? CHIP_ON : "text-text-muted"}`}
              >
                {NOISE_LABELS[n]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="label text-text-muted">
            Stress right now, if you want to say
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setStress(stress === n ? null : n)}
                className={`${CHIP} ${stress === n ? CHIP_ON : "text-text-muted"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex cursor-pointer items-center gap-2.5 text-[15px]">
          <input
            type="checkbox"
            checked={wasCram}
            onChange={(e) => setWasCram(e.target.checked)}
            className="h-4 w-4 accent-[color:var(--sky)]"
          />
          This is a cram session
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-5 text-[15px] text-down">
          {error}
        </p>
      )}

      <button
        onClick={finish}
        disabled={pending}
        className="btn-primary mt-7 px-7 py-3.5 text-[16px] disabled:opacity-60"
      >
        {pending ? "Saving…" : `Stop and save ${formatDuration(Math.max(1, Math.round(seconds / 60)))}`}
      </button>

      <p className="mt-4 text-[14px] leading-relaxed text-text-faint">
        Everything above is encrypted on this device before it&rsquo;s saved.
        Leave anything blank you&rsquo;d rather not answer — a session with
        fewer details still counts.
      </p>
    </div>
  );
}
