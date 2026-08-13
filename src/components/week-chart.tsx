"use client";

import { useState } from "react";

import type { DayBar } from "@/lib/insights";

/**
 * Fourteen days of study time, as bars.
 *
 * One measure, one axis. Study minutes and test scores are the two things a
 * student most wants to see together, and putting them on one chart would need
 * two y-scales — which is the single most reliable way to make a chart lie.
 * Sleep and scores live in their own cards.
 *
 * Bars rather than a line: days are discrete, and a line drawn across a day
 * with nothing on it invents time that wasn't studied. A zero-height day is
 * still drawn as a faint tick, because "you didn't study" is a real reading and
 * a missing bar looks like missing data.
 *
 * The dark part of each bar is time the extension attributed to blocked sites.
 * It's stacked inside the same bar rather than shown alongside, because it is
 * a *part* of the time studied, not a separate quantity.
 */

const HEIGHT = 120;
const GAP = 2; // The 2px surface gap that keeps adjacent bars from merging.

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

export function WeekChart({ days }: { days: DayBar[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const peak = Math.max(...days.map((d) => d.minutes), 1);
  const total = days.reduce((n, d) => n + d.minutes, 0);

  // Nothing to draw is worth saying rather than showing an empty grid.
  if (total === 0) return null;

  const width = 100 / days.length;
  const active = hovered === null ? null : days[hovered];

  return (
    <figure className="mt-6">
      <figcaption className="flex items-baseline justify-between gap-4">
        <span className="label text-text-faint">Study time, last 14 days</span>
        <span className="text-[13px] text-text-muted" aria-live="polite">
          {active
            ? `${active.date.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })} — ${
                active.minutes === 0
                  ? "nothing logged"
                  : `${formatMinutes(active.minutes)}, ${active.sessions} session${
                      active.sessions === 1 ? "" : "s"
                    }`
              }${
                active.distractedMinutes
                  ? `, ${formatMinutes(active.distractedMinutes)} distracted`
                  : ""
              }`
            : `Peak ${formatMinutes(peak)}`}
        </span>
      </figcaption>

      <div
        className="relative mt-3"
        style={{ height: HEIGHT }}
        onMouseLeave={() => setHovered(null)}
      >
        <svg
          viewBox={`0 0 100 ${HEIGHT}`}
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
          role="img"
          aria-label={`Study time for the last ${days.length} days. Total ${formatMinutes(total)}, busiest day ${formatMinutes(peak)}.`}
        >
          {days.map((day, i) => {
            const x = i * width;
            const barWidth = width - GAP;
            const height = (day.minutes / peak) * (HEIGHT - 12);
            const distracted = day.distractedMinutes
              ? (day.distractedMinutes / peak) * (HEIGHT - 12)
              : 0;
            const isHovered = hovered === i;

            return (
              <g
                key={day.date.toISOString()}
                onMouseEnter={() => setHovered(i)}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered(null)}
                tabIndex={0}
                className="cursor-default focus:outline-none"
              >
                {/* A hit target the full height of the chart, so a 4-minute
                    day is as easy to hover as a three-hour one. */}
                <rect
                  x={x}
                  y={0}
                  width={width}
                  height={HEIGHT}
                  fill="transparent"
                />

                {day.minutes === 0 ? (
                  <rect
                    x={x}
                    y={HEIGHT - 1}
                    width={barWidth}
                    height={1}
                    fill="var(--line-hi)"
                  />
                ) : (
                  <>
                    <rect
                      x={x}
                      y={HEIGHT - height}
                      width={barWidth}
                      height={height}
                      rx={1.5}
                      fill="var(--sky)"
                      opacity={hovered === null || isHovered ? 1 : 0.45}
                    />
                    {distracted > 0 && (
                      <rect
                        x={x}
                        y={HEIGHT - distracted}
                        width={barWidth}
                        height={distracted}
                        rx={1.5}
                        fill="var(--sky-deep)"
                        opacity={hovered === null || isHovered ? 1 : 0.45}
                      />
                    )}
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Weekday initials, and a date only where the fortnight turns, so the
          axis stays readable at phone width. */}
      <div className="mt-2 flex text-[11px] text-text-faint">
        {days.map((day, i) => (
          <span
            key={day.date.toISOString()}
            className="text-center"
            style={{ width: `${width}%` }}
          >
            {i === 0 || i === days.length - 1 || day.date.getDate() === 1
              ? day.date.toLocaleDateString(undefined, { day: "numeric" })
              : WEEKDAY[day.date.getDay()]}
          </span>
        ))}
      </div>

      {days.some((d) => d.distractedMinutes) && (
        <p className="mt-3 text-[13px] leading-relaxed text-text-faint">
          <span
            className="mr-1.5 inline-block h-2 w-2 rounded-[1px] align-middle"
            style={{ background: "var(--sky-deep)" }}
          />
          The darker part is time the extension saw on sites you block.
        </p>
      )}
    </figure>
  );
}
