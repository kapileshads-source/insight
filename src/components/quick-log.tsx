"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCrypto } from "@/components/crypto-provider";
import { ScreenshotReader } from "@/components/screenshot-reader";
import { saveOutcome, saveScreenTime, saveSleep } from "@/app/actions/logs";
import type {
  OutcomePayload,
  ScreenTimePayload,
  SleepPayload,
} from "@/lib/records";

const FIELD =
  "w-full rounded-md border border-line-hi bg-bg px-4 py-3 text-[16px] text-text focus:border-accent";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Tab = "sleep" | "screen" | "score";

export function QuickLog({ recentSubjects }: { recentSubjects: string[] }) {
  const router = useRouter();
  const { conceal } = useCrypto();
  const [tab, setTab] = useState<Tab>("sleep");
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sleepHours, setSleepHours] = useState("");
  const [sleepDate, setSleepDate] = useState(today());
  const [screenMinutes, setScreenMinutes] = useState("");
  // Kept so a misread can be diagnosed later without keeping the image.
  const [ocrRaw, setOcrRaw] = useState<string | undefined>(undefined);
  const [screenDate, setScreenDate] = useState(today());
  const [label, setLabel] = useState("");
  const [subject, setSubject] = useState("");
  const [earned, setEarned] = useState("");
  const [possible, setPossible] = useState("100");
  const [scoreDate, setScoreDate] = useState(today());

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    setError(null);
    setNote(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (!res.ok) {
          setError(res.error ?? "Couldn't save that.");
          return;
        }
        setNote(msg);
        router.refresh();
      } catch {
        setError("Couldn't save that. Try again.");
      }
    });
  }

  function submitSleep(e: React.FormEvent) {
    e.preventDefault();
    const hours = Number(sleepHours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      setError("Hours should be somewhere between 0 and 24.");
      return;
    }
    const payload: SleepPayload = { hours };
    run(async () => saveSleep(sleepDate, await conceal(payload)), "Sleep saved.");
  }

  function submitScreen(e: React.FormEvent) {
    e.preventDefault();
    const minutes = Number(screenMinutes);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) {
      setError("Minutes should be between 0 and 1440.");
      return;
    }
    const payload: ScreenTimePayload = {
      minutes,
      editedByUser: true,
      ...(ocrRaw ? { ocrRawValue: ocrRaw } : {}),
    };
    run(
      async () => saveScreenTime(screenDate, "MANUAL", await conceal(payload)),
      "Screen time saved.",
    );
  }

  function submitScore(e: React.FormEvent) {
    e.preventDefault();
    const a = Number(earned);
    const b = Number(possible);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0 || a < 0) {
      setError("Check those numbers.");
      return;
    }
    const payload: OutcomePayload = {
      pointsEarned: a,
      pointsPossible: b,
      percentage: Math.round((a / b) * 1000) / 10,
      ...(label.trim() ? { label: label.trim() } : {}),
      ...(subject.trim() ? { subject: subject.trim() } : {}),
    };
    run(async () => saveOutcome(scoreDate, await conceal(payload)), "Score saved.");
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "sleep", label: "Sleep" },
    { id: "screen", label: "Screen time" },
    { id: "score", label: "Test score" },
  ];

  return (
    <section className="rounded-lg border border-line bg-surface p-6">
      <h2 className="h3 text-[17px]">Log something</h2>

      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setNote(null);
              setError(null);
            }}
            className={`rounded-md border px-4 py-2 text-[15px] ${
              tab === t.id
                ? "border-accent bg-accent text-on-light"
                : "border-line-hi text-text-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "sleep" && (
          <form onSubmit={submitSleep} className="space-y-4">
            <div>
              <label htmlFor="sleep-hours" className="label text-text-muted">
                Hours slept last night
              </label>
              <input
                id="sleep-hours"
                inputMode="decimal"
                value={sleepHours}
                onChange={(e) => setSleepHours(e.target.value)}
                placeholder="6.5"
                className={`${FIELD} mt-2`}
              />
            </div>
            <div>
              <label htmlFor="sleep-date" className="label text-text-muted">
                Morning of
              </label>
              <input
                id="sleep-date"
                type="date"
                value={sleepDate}
                onChange={(e) => setSleepDate(e.target.value)}
                className={`${FIELD} mt-2`}
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="btn-primary px-6 py-3 text-[15px] disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </form>
        )}

        {tab === "screen" && (
          <form onSubmit={submitScreen} className="space-y-4">
            <div>
              <label htmlFor="screen-minutes" className="label text-text-muted">
                Total phone minutes
              </label>
              <input
                id="screen-minutes"
                inputMode="numeric"
                value={screenMinutes}
                onChange={(e) => setScreenMinutes(e.target.value)}
                placeholder="240"
                className={`${FIELD} mt-2`}
              />
              <p className="mt-2 text-[14px] leading-relaxed text-text-faint">
                From Screen Time on iPhone or Digital Wellbeing on Android.
              </p>
            </div>
            <ScreenshotReader
              onPick={(minutes, raw) => {
                setScreenMinutes(String(minutes));
                setOcrRaw(raw);
                setError(null);
              }}
            />

            <div>
              <label htmlFor="screen-date" className="label text-text-muted">
                For
              </label>
              <input
                id="screen-date"
                type="date"
                value={screenDate}
                onChange={(e) => setScreenDate(e.target.value)}
                className={`${FIELD} mt-2`}
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="btn-primary px-6 py-3 text-[15px] disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </form>
        )}

        {tab === "score" && (
          <form onSubmit={submitScore} className="space-y-4">
            <div>
              <label htmlFor="score-label" className="label text-text-muted">
                What was it?
              </label>
              <input
                id="score-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Unit 6 test"
                className={`${FIELD} mt-2`}
              />
            </div>
            <div>
              <label htmlFor="score-subject" className="label text-text-muted">
                Subject
              </label>
              <input
                id="score-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                list="log-subjects"
                placeholder="Chemistry"
                className={`${FIELD} mt-2`}
              />
              <datalist id="log-subjects">
                {recentSubjects.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <p className="mt-2 text-[14px] leading-relaxed text-text-faint">
                Matching this to the subject you logged sessions under is what
                lets the two be compared.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label htmlFor="earned" className="label text-text-muted">
                  Score
                </label>
                <input
                  id="earned"
                  inputMode="decimal"
                  value={earned}
                  onChange={(e) => setEarned(e.target.value)}
                  placeholder="88"
                  className={`${FIELD} mt-2`}
                />
              </div>
              <div className="flex-1">
                <label htmlFor="possible" className="label text-text-muted">
                  Out of
                </label>
                <input
                  id="possible"
                  inputMode="decimal"
                  value={possible}
                  onChange={(e) => setPossible(e.target.value)}
                  className={`${FIELD} mt-2`}
                />
              </div>
            </div>
            <div>
              <label htmlFor="score-date" className="label text-text-muted">
                Date
              </label>
              <input
                id="score-date"
                type="date"
                value={scoreDate}
                onChange={(e) => setScoreDate(e.target.value)}
                className={`${FIELD} mt-2`}
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="btn-primary px-6 py-3 text-[15px] disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </form>
        )}
      </div>

      {note && <p className="mt-4 text-[15px] text-up">{note}</p>}
      {error && (
        <p role="alert" className="mt-4 text-[15px] text-down">
          {error}
        </p>
      )}
    </section>
  );
}
