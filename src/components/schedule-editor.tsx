"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCalendarDayAction, updatePeriodAction } from "@/app/admin/schedules/client-actions";

const FIELD =
  "rounded-md border border-line-hi bg-bg px-3 py-2 text-[15px] text-text focus:border-sky";

export type EditablePeriod = {
  id: string;
  dayType: string;
  sequence: number;
  number: number | null;
  label: string | null;
  startMinutes: number;
  endMinutes: number;
  isInstructional: boolean;
};

/// Times are stored as minutes from midnight, which is right for lookups and
/// unusable in a form. These convert at the boundary rather than changing the
/// storage format to suit the UI.
const toTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export function PeriodEditor({ periods }: { periods: EditablePeriod[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  function save(p: EditablePeriod, startTime: string, endTime: string) {
    setError(null);
    start(async () => {
      const res = await updatePeriodAction({
        id: p.id,
        startMinutes: fromTime(startTime),
        endMinutes: fromTime(endTime),
        label: p.label,
        isInstructional: p.isInstructional,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(p.id);
      router.refresh();
    });
  }

  const byDayType = periods.reduce<Record<string, EditablePeriod[]>>((acc, p) => {
    (acc[p.dayType] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      {Object.entries(byDayType).map(([dayType, list]) => (
        <div key={dayType}>
          <h3 className="h3 text-[15px] text-text-muted">
            {dayType === "ALL" ? "Every day" : `${dayType} day`}
          </h3>
          <div className="mt-3 space-y-2">
            {list
              .sort((a, b) => a.sequence - b.sequence)
              .map((p) => (
                <PeriodRow
                  key={p.id}
                  period={p}
                  pending={pending}
                  saved={saved === p.id}
                  onSave={save}
                />
              ))}
          </div>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-[15px] text-down">
          {error}
        </p>
      )}
    </div>
  );
}

function PeriodRow({
  period,
  pending,
  saved,
  onSave,
}: {
  period: EditablePeriod;
  pending: boolean;
  saved: boolean;
  onSave: (p: EditablePeriod, s: string, e: string) => void;
}) {
  const [startTime, setStartTime] = useState(toTime(period.startMinutes));
  const [endTime, setEndTime] = useState(toTime(period.endMinutes));
  const dirty =
    startTime !== toTime(period.startMinutes) ||
    endTime !== toTime(period.endMinutes);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-4 py-3">
      <span className="w-40 shrink-0 text-[15px]">
        {period.label ?? `${period.number}${period.number === 1 ? "st" : period.number === 2 ? "nd" : period.number === 3 ? "rd" : "th"} period`}
      </span>
      <input
        type="time"
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
        className={FIELD}
        aria-label="Start time"
      />
      <span className="text-text-faint">to</span>
      <input
        type="time"
        value={endTime}
        onChange={(e) => setEndTime(e.target.value)}
        className={FIELD}
        aria-label="End time"
      />
      {dirty && (
        <button
          onClick={() => onSave(period, startTime, endTime)}
          disabled={pending}
          className="btn-primary px-4 py-2 text-[14px] disabled:opacity-60"
        >
          Save
        </button>
      )}
      {saved && !dirty && <span className="text-[14px] text-up">Saved</span>}
    </div>
  );
}

export function CalendarDayEditor() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState("");
  const [dayType, setDayType] = useState<"ALL" | "A" | "B" | "NONE">("A");
  const [variant, setVariant] = useState<
    "REGULAR" | "LATE_ARRIVAL" | "EARLY_RELEASE"
  >("REGULAR");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    start(async () => {
      const res = await updateCalendarDayAction({
        date,
        dayType: dayType === "NONE" ? null : dayType,
        variant,
        note: note || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMsg(`${date} saved.`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div>
          <label htmlFor="cal-date" className="label text-text-muted">
            Date
          </label>
          <input
            id="cal-date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`${FIELD} mt-2 block`}
          />
        </div>
        <div>
          <label htmlFor="cal-type" className="label text-text-muted">
            Day type
          </label>
          <select
            id="cal-type"
            value={dayType}
            onChange={(e) =>
              setDayType(e.target.value as "ALL" | "A" | "B" | "NONE")
            }
            className={`${FIELD} mt-2 block`}
          >
            <option value="A">A day</option>
            <option value="B">B day</option>
            <option value="ALL">All classes</option>
            <option value="NONE">No school</option>
          </select>
        </div>
        <div>
          <label htmlFor="cal-variant" className="label text-text-muted">
            Schedule
          </label>
          <select
            id="cal-variant"
            value={variant}
            onChange={(e) =>
              setVariant(
                e.target.value as "REGULAR" | "LATE_ARRIVAL" | "EARLY_RELEASE",
              )
            }
            className={`${FIELD} mt-2 block`}
          >
            <option value="REGULAR">Regular</option>
            <option value="LATE_ARRIVAL">Late arrival</option>
            <option value="EARLY_RELEASE">Early release</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="cal-note" className="label text-text-muted">
          Note
        </label>
        <input
          id="cal-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Exam schedule"
          className={`${FIELD} mt-2 block w-full`}
        />
      </div>

      <button
        type="submit"
        disabled={pending || !date}
        className="btn-primary px-6 py-3 text-[15px] disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save this date"}
      </button>

      {msg && <p className="text-[15px] text-up">{msg}</p>}
      {error && (
        <p role="alert" className="text-[15px] text-down">
          {error}
        </p>
      )}
    </form>
  );
}
