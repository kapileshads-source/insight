"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCrypto } from "@/components/crypto-provider";
import { saveProfile, type SealedProfile } from "@/app/actions/profile";
import {
  LOCATIONS,
  LOCATION_LABELS,
  NOISE_LABELS,
  NOISE_LEVELS,
  formatDuration,
  minutesToTimeValue,
  nightLength,
  parseTimeToMinutes,
  type Location,
  type NoiseLevel,
  type ProfilePayload,
} from "@/lib/records";

const FIELD =
  "w-full rounded-md border border-line-hi bg-bg px-4 py-3 text-[16px] text-text focus:border-accent";

/**
 * The baseline every later comparison is made against.
 *
 * The insight engine never uses a general target, "eight hours" appears
 * nowhere in it. Every statement it makes is against the student's own usual,
 * and until that usual is written down it has to infer one from whatever has
 * been logged so far, which takes weeks and is wrong early on.
 *
 * Saved in one go rather than field by field. The server can't see which parts
 * are filled in, so a half-saved baseline would show as done on the dashboard
 * and quietly skew everything measured against it.
 */
export function BaselineForm({ profile }: { profile: SealedProfile }) {
  const router = useRouter();
  const { reveal, conceal, status } = useCrypto();
  const [pending, start] = useTransition();

  const [sleepAt, setSleepAt] = useState("");
  const [wakeAt, setWakeAt] = useState("");
  const [location, setLocation] = useState<Location | "">("");
  const [noise, setNoise] = useState<NoiseLevel | "">("");

  // Nothing saved means nothing to decrypt, so the form is ready immediately
  // rather than after an effect that only ever sets a flag.
  const [loaded, setLoaded] = useState(profile === null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (status !== "unlocked" || !profile) return;

    try {
      const p = await reveal<ProfilePayload>(profile);
      if (typeof p.usualSleepMinutes === "number") {
        setSleepAt(minutesToTimeValue(p.usualSleepMinutes));
      }
      if (typeof p.usualWakeMinutes === "number") {
        setWakeAt(minutesToTimeValue(p.usualWakeMinutes));
      }
      if (p.usualLocation) setLocation(p.usualLocation);
      if (p.usualNoise) setNoise(p.usualNoise);
    } catch {
      // Never leave the form blank *and* silent, on an app that can't reset
      // passwords, an empty box where your answers were reads as data loss.
      setError("Couldn't read what you saved before. Filling this in again replaces it.");
    } finally {
      setLoaded(true);
    }
  }, [profile, reveal, status]);

  useEffect(() => {
    // Same exception as study-panel, for the same reason: every setState in
    // `load` happens after an await, so there is no cascading render to
    // avoid, and this has to be an effect, because what's saved arrives as
    // ciphertext and can only be decrypted here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const sleepMinutes = parseTimeToMinutes(sleepAt);
  const wakeMinutes = parseTimeToMinutes(wakeAt);
  const night =
    sleepMinutes !== null && wakeMinutes !== null
      ? nightLength(sleepMinutes, wakeMinutes)
      : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNote(null);

    if (sleepMinutes === null || wakeMinutes === null) {
      setError("Both times are needed.");
      return;
    }
    if (!location || !noise) {
      setError("Pick where you usually study, and how noisy it usually is.");
      return;
    }

    const payload: ProfilePayload = {
      usualSleepMinutes: sleepMinutes,
      usualWakeMinutes: wakeMinutes,
      usualLocation: location,
      usualNoise: noise,
    };

    start(async () => {
      try {
        const res = await saveProfile(await conceal(payload));
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setNote("Saved.");
        router.refresh();
      } catch {
        setError("Couldn't save that. Try again.");
      }
    });
  }

  if (!loaded) {
    return <p className="text-[15px] text-text-muted">Reading what you saved…</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="rounded-lg border border-line bg-surface p-6">
        <h2 className="h3 text-[17px]">A usual night</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-text-muted">
          Not last night, the time you normally go to sleep and normally wake
          up on a school day. Insight compares each night against this rather
          than against any general idea of enough sleep.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="sleep-at" className="label text-text-muted">
              Usually asleep by
            </label>
            <input
              id="sleep-at"
              type="time"
              value={sleepAt}
              onChange={(e) => setSleepAt(e.target.value)}
              className={`${FIELD} mt-2`}
            />
          </div>
          <div>
            <label htmlFor="wake-at" className="label text-text-muted">
              Usually awake at
            </label>
            <input
              id="wake-at"
              type="time"
              value={wakeAt}
              onChange={(e) => setWakeAt(e.target.value)}
              className={`${FIELD} mt-2`}
            />
          </div>
        </div>

        {night !== null && (
          <p className="mt-4 text-[15px] text-text-muted">
            That&rsquo;s about{" "}
            <span className="text-text">{formatDuration(night)}</span> a night.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-line bg-surface p-6">
        <h2 className="h3 text-[17px]">Where you usually study</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-text-muted">
          Your default, so a session somewhere different stands out as
          different. You still pick per session when you start one.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="usual-location" className="label text-text-muted">
              Usual place
            </label>
            <select
              id="usual-location"
              value={location}
              onChange={(e) => setLocation(e.target.value as Location)}
              className={`${FIELD} mt-2`}
            >
              <option value="">Pick one</option>
              {LOCATIONS.map((l) => (
                <option key={l} value={l}>
                  {LOCATION_LABELS[l]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="usual-noise" className="label text-text-muted">
              Usually as noisy as
            </label>
            <select
              id="usual-noise"
              value={noise}
              onChange={(e) => setNoise(e.target.value as NoiseLevel)}
              className={`${FIELD} mt-2`}
            >
              <option value="">Pick one</option>
              {NOISE_LEVELS.map((n) => (
                <option key={n} value={n}>
                  {NOISE_LABELS[n]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {error && (
        <p role="alert" className="text-[15px] text-down">
          {error}
        </p>
      )}
      {note && <p className="text-[15px] text-up">{note}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary px-6 py-3 text-[15px] disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>

      <p className="text-[13px] leading-relaxed text-text-faint">
        Encrypted in your browser like everything else, so the server knows a
        baseline exists and nothing about what it says. You can change it
        whenever your routine does.
      </p>
    </form>
  );
}
