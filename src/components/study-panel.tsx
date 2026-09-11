"use client";

import { WeekChart } from "@/components/week-chart";
import { InsightRow } from "@/components/insight-row";
import { QuickLog } from "@/components/quick-log";
import { SessionTimer } from "@/components/session-timer";
import { useStudyData } from "@/components/study-data";
import { formatDuration } from "@/lib/records";

/**
 * The pieces the study log is drawn as.
 *
 * These were one component. It rendered the timer, the quick-log form, a
 * four-up stat row, the weekly recap and chart, what the devices saw, the
 * wellbeing alerts, the phrased advice and the insight list, in that order,
 * in one column, on the dashboard. Which is how a dashboard becomes a page
 * you scroll past.
 *
 * Each is now its own export, reading from `StudyDataProvider`, so a page can
 * take the two or three that belong on it. `/study` gets the timer, `/logs`
 * gets the record, and the dashboard gets the trend and the findings.
 *
 * Every one of them returns null when it has nothing to say, so a page never
 * has to know whether there is data behind a section it mounted.
 */

/// Starting and logging a session. The only two controls a student touches.
export function SessionControls({
  running,
  isIOS = false,
}: {
  isIOS?: boolean;
  running: { id: string; startedAt: string; focusModeActive: boolean } | null;
}) {
  const { subjects } = useStudyData();
  return (
    <div className="space-y-6">
      <section>
        <SessionTimer
          running={running}
          recentSubjects={subjects}
          isIOS={isIOS}
        />
      </section>
      <section>
        <QuickLog recentSubjects={subjects} />
      </section>
    </div>
  );
}

/// The four headline numbers.
export function StudyStats() {
  const { stats } = useStudyData();
  if (!stats) return null;
  return (
    <>
      
        <section className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
          <Stat value={String(stats.sessionsThisWeek)} label="Sessions this week" />
          <Stat value={formatDuration(stats.minutesThisWeek)} label="Time logged" />
          <Stat
            value={stats.meanSleep ? `${stats.meanSleep.toFixed(1)} hrs` : "-"}
            label="Sleep, 7-day"
          />
          {stats.focusShareThisWeek !== null ? (
            <Stat
              value={`${Math.round(stats.focusShareThisWeek * 100)}%`}
              label="On-task time"
            />
          ) : (
            <Stat value={String(stats.outcomesLogged)} label="Scores logged" />
          )}
        </section>
    </>
  );
}

/// The week, as a sentence and a chart. This is the "current trends" the
/// dashboard shows.
export function WeekTrends() {
  const { recap, daily } = useStudyData();
  if (!recap || recap.sessions === 0) return null;
  return (
    <>
      
        <section className="enter panel p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="h3 text-[17px]">Your week</h2>
            <span className="label text-text-faint">Last 7 days</span>
          </div>
          <p className="mt-4 text-[17px] leading-relaxed">
            {recap.sessions} session{recap.sessions === 1 ? "" : "s"},{" "}
            {formatDuration(recap.minutes)} logged
            {recap.deltaSessions !== 0 && (
              <span className={recap.deltaSessions > 0 ? "text-up" : "text-down"}>
                {" "}
                ({recap.deltaSessions > 0 ? "+" : "\u2212"}
                {Math.abs(recap.deltaSessions)} vs. the week before)
              </span>
            )}
            .
            {recap.meanSleep !== null &&
              ` Averaging ${recap.meanSleep.toFixed(1)} hours of sleep.`}
            {recap.scores > 0 &&
              ` ${recap.scores} score${recap.scores === 1 ? "" : "s"} logged.`}
          </p>
          {daily && <WeekChart days={daily} />}
          {recap.distractedMinutes !== null && (
            <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
              {recap.distractedMinutes === 0
                ? "None of your measured time went to blocked sites."
                : `${formatDuration(recap.distractedMinutes)} of that went to sites you block.`}{" "}
              <span className="text-text-faint">
                Measured by the extension rather than typed in.
              </span>
            </p>
          )}
          {recap.headline && (
            <p className="mt-4 border-t border-line pt-4 text-[15px] leading-relaxed text-text-muted">
              {recap.headline.statement}
            </p>
          )}
        </section>
    </>
  );
}

/// What the extension and desktop apps actually measured.
export function DeviceReadout() {
  const { lastDevice } = useStudyData();
  if (!lastDevice || lastDevice.entries.length === 0) return null;
  return (
    <>
      
        <section className="panel p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="h3 text-[17px]">What your devices saw</h2>
            <span className="label text-text-faint">
              {lastDevice.startedAt.toLocaleDateString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </span>
          </div>
          <p className="mt-2 text-[15px] leading-relaxed text-text-muted">
            Your last measured session, {formatDuration(
              Math.round(lastDevice.totalSeconds / 60),
            )}{" "}
            in total. Sites come from the extension, apps from the Windows or
            Mac app.
          </p>

          <div className="mt-5">
            {lastDevice.entries.slice(0, 12).map((e, i) => (
              <div
                key={e.name}
                className={`flex items-baseline justify-between gap-4 py-2.5 ${
                  i > 0 ? "border-t border-line" : ""
                }`}
              >
                <span className="min-w-0 truncate text-[15px]">
                  {e.name}
                  {e.distracted && (
                    <span className="ml-2 text-[13px] text-alert">
                      on your blocklist
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[15px] text-text-muted tabular-nums">
                  {e.seconds < 60
                    ? "under a minute"
                    : formatDuration(Math.round(e.seconds / 60))}
                </span>
              </div>
            ))}
          </div>

          {lastDevice.entries.length > 12 && (
            <p className="mt-3 text-[14px] text-text-faint">
              and {lastDevice.entries.length - 12} more, each under the top
              twelve.
            </p>
          )}

          <p className="mt-4 border-t border-line pt-4 text-[13px] leading-relaxed text-text-faint">
            Only what was in front while a session was running, and only the
            name, never a page title or a document name. Encrypted here in your
            browser, the same as everything else.
          </p>
        </section>
    </>
  );
}

/// Sleep and stress warnings, which are about the student rather than the grade.
export function WellbeingNotes() {
  const { alerts } = useStudyData();
  if (alerts.length === 0) return null;
  return (
    <>
      
        <section className="rounded-lg border border-alert/30 bg-alert/8 p-6">
          <h2 className="h3 text-[17px]">Worth noticing</h2>
          <div className="mt-4 space-y-4">
            {alerts.map((a) => (
              <div key={a.id}>
                <p className="text-[16px] leading-relaxed">{a.message}</p>
                {a.suggestion && (
                  <p className="mt-1 text-[15px] leading-relaxed text-text-muted">
                    {a.suggestion}
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="mt-5 text-[13px] leading-relaxed text-text-faint">
            These are about you rather than your grades, and nothing here is
            shared with anyone.
          </p>
        </section>
    </>
  );
}

/// The one phrased suggestion, only ever built from a validated pattern.
export function SuggestedThisWeek() {
  const { advice } = useStudyData();
  if (!advice) return null;
  return (
    <>
      
        <section className="rounded-lg border border-accent/30 bg-accent-soft p-6">
          <h2 className="label text-accent">Suggested this week</h2>
          <p className="mt-3 text-[17px] leading-relaxed">{advice}</p>
          <p className="mt-4 text-[13px] leading-relaxed text-text-faint">
            Written from the patterns above, which were worked out here on your
            device. Only the finished pattern was sent to phrase it, never your
            sessions or grades.
          </p>
        </section>
    </>
  );
}

/// The findings themselves, the reason the app exists.
export function WhatWeAreSeeing() {
  const { insights, failed, derivedCount, minorExcluded } = useStudyData();
  const surfaced = insights?.filter((i) => i.isSurfaced) ?? [];
  const pending = insights?.filter((i) => !i.isSurfaced) ?? [];
  return (
      <section className="pt-6">
        <h2 className="h2 text-[clamp(1.6rem,4vw,2.125rem)]">
          What we&rsquo;re seeing
        </h2>

        {failed && (
          <p role="alert" className="mt-4 text-[17px] text-down">
            Couldn&rsquo;t read your data just now. Nothing is lost, reload and
            it should come back.
          </p>
        )}

        {!failed && insights === null && (
          <p className="mt-4 text-[17px] text-text-muted">Reading your log…</p>
        )}

        {!failed && insights !== null && insights.length === 0 && (
          <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-text-muted">
            {derivedCount > 0
              ? `Your gradebook has given us ${derivedCount} score${derivedCount === 1 ? "" : "s"} to work with. What's missing is study sessions, patterns come from comparing the two, so log a few and this fills in.`
              : "Nothing yet. Log a few sessions and a test score, and patterns start appearing once there's enough of them to mean something."}
          </p>
        )}

        {/* Where the scores came from. Left unsaid, "based on 11 scores"
            against a gradebook showing 40 rows reads as a bug. */}
        {!failed && derivedCount > 0 && (
          <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-text-faint">
            {derivedCount} score{derivedCount === 1 ? "" : "s"} read straight
            from your gradebook.
            {minorExcluded > 0 &&
              ` ${minorExcluded} smaller ${minorExcluded === 1 ? "grade was" : "grades were"} left out, a 2/2 warm-up counts as a 100% and would drown out your real assessments.`}
          </p>
        )}

        {surfaced.length > 0 && (
          <>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-text-muted">
              Patterns in your own data, compared against your own averages.
              These describe what happened together, not what caused what.
            </p>
            <div className="mt-8">
              {surfaced.map((i) => (
                <InsightRow
                  key={i.factor}
                  direction={i.direction}
                  magnitude={i.magnitude}
                  statement={i.statement}
                  suggestion={i.suggestion}
                  sampleSize={i.sampleSize}
                  heldIn={i.heldIn}
                  isSurfaced
                />
              ))}
            </div>
          </>
        )}

        {pending.length > 0 && (
          <>
            <h3 className="h3 mt-12 text-[17px] text-text-muted">
              Still gathering
            </h3>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-text-faint">
              These aren&rsquo;t solid enough to show yet. They need about{" "}
              {8} sessions behind them, holding across more than one week.
            </p>
            <div className="mt-4">
              {pending.map((i) => (
                <InsightRow
                  key={i.factor}
                  direction={i.direction}
                  magnitude={i.magnitude}
                  statement={i.statement}
                  sampleSize={i.sampleSize}
                  isSurfaced={false}
                />
              ))}
            </div>
          </>
        )}
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="figure text-[2.25rem]">{value}</div>
      <div className="label mt-2.5 text-text-muted">{label}</div>
    </div>
  );
}
