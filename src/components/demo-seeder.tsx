"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { seedDemoData, type DemoResult } from "@/app/actions/demo";
import { useCrypto } from "@/components/crypto-provider";
import { buildDemoData } from "@/lib/demo-data";

/**
 * Generate a term, encrypt it here, and store it.
 *
 * The generator runs in the browser because that is where the key is. A demo
 * seeder that could run on the server would mean the encryption wasn't real,
 * so this is a fair demonstration of the architecture as well as a shortcut
 * past an empty dashboard.
 */
export function DemoSeeder() {
  const router = useRouter();
  const { conceal, status } = useCrypto();
  const [result, setResult] = useState<DemoResult | null>(null);
  const [working, setWorking] = useState(false);

  async function run() {
    setWorking(true);
    setResult(null);

    try {
      const data = buildDemoData();

      const sessions = await Promise.all(
        data.sessions.map(async (s) => ({
          startedAt: s.startedAt.toISOString(),
          endedAt: s.endedAt.toISOString(),
          focusModeActive: s.focusModeActive,
          payload: await conceal({
            subject: s.subject,
            location: s.location,
            noise: s.noise,
            stress: s.stress,
            wasCram: s.wasCram,
            durationMinutes: s.durationMinutes,
            distractedMinutes: s.distractedMinutes,
          }),
        })),
      );

      const sleep = await Promise.all(
        data.sleep.map(async (s) => ({
          forDate: s.date,
          payload: await conceal({ hours: s.hours }),
        })),
      );

      const screenTime = await Promise.all(
        data.screenTime.map(async (s) => ({
          forDate: s.date,
          payload: await conceal({ minutes: s.minutes, editedByUser: true }),
        })),
      );

      const outcomes = await Promise.all(
        data.outcomes.map(async (o) => ({
          occurredOn: o.date,
          payload: await conceal({
            percentage: o.percentage,
            subject: o.subject,
            label: o.label,
          }),
        })),
      );

      const stored = await seedDemoData({ sessions, sleep, screenTime, outcomes });
      setResult(stored);
      if (stored.ok) router.refresh();
    } catch {
      setResult({ ok: false, error: "Couldn't encrypt that. Nothing was saved." });
    } finally {
      setWorking(false);
    }
  }

  if (status !== "unlocked") {
    return (
      <p className="mt-8 text-[15px] leading-relaxed text-text-muted">
        Unlock your data first — the sample records are encrypted on the way in,
        the same as real ones.
      </p>
    );
  }

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={() => void run()}
        disabled={working}
        className="rounded bg-sky px-4 py-2 text-[15px] text-on-light disabled:opacity-40"
      >
        {working ? "Making a term…" : "Fill this account with sample data"}
      </button>

      {result && !result.ok && (
        <p className="mt-4 text-[15px] leading-relaxed text-down">{result.error}</p>
      )}

      {result?.ok && (
        <p className="mt-4 text-[15px] leading-relaxed text-text-muted">
          Done — {result.sessions} sessions, {result.outcomes} scores,{" "}
          {result.sleep} nights.{" "}
          <a href="/dashboard" className="text-sky underline underline-offset-2">
            Open the dashboard
          </a>{" "}
          and the engine will have something to say.
        </p>
      )}
    </div>
  );
}
