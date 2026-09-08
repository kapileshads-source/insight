"use client";

import { useCallback, useEffect, useState } from "react";
import { useCrypto } from "@/components/crypto-provider";
import { WeekChart } from "@/components/week-chart";
import { InsightRow } from "@/components/insight-row";
import { QuickLog } from "@/components/quick-log";
import { SessionTimer } from "@/components/session-timer";
import { fetchEncryptedRecords } from "@/app/actions/logs";
import { fetchGradebook } from "@/app/actions/grades";
import {
  mergeOutcomes,
  outcomesFromMarkedWork,
  type MarkedWork,
} from "@/lib/graded-work";
import { getBlocklistPrefs } from "@/app/actions/settings";
import { buildBlocklist, matchesBlocklist, splitActivity } from "@/lib/blocklist";
import { requestRecommendation } from "@/app/actions/recommendations";
import {
  commitPendingDeviceData,
  fetchPendingDeviceData,
} from "@/app/actions/devices";
import {
  basicStats,
  dailyStudyMinutes,
  computeInsights,
  weeklyRecap,
  wellbeingAlerts,
  type ComputedInsight,
  type InsightInputs,
  type OutcomeRecord,
  type WeeklyRecap,
  type WellbeingAlert,
} from "@/lib/insights";
import { formatDuration, type SessionPayload } from "@/lib/records";
import type { Sealed } from "@/lib/crypto";
import type {
  OutcomePayload,
  ScreenTimePayload,
  SleepPayload,
} from "@/lib/records";

type Stats = ReturnType<typeof basicStats>;

/// What one session's devices actually saw, app by app.
///
/// The numbers this feeds already existed — a single distracted total, folded
/// into the weekly recap and a sample-size-gated insight. That meant a student
/// who paired a laptop and studied for an hour saw no evidence whatsoever that
/// it had worked, which is indistinguishable from broken and was reported as
/// broken. The detail was decrypted and thrown away; this keeps it.
type DeviceReadout = {
  startedAt: Date;
  entries: { name: string; seconds: number; distracted: boolean }[];
  totalSeconds: number;
};

/// Fetches ciphertext, decrypts it here, and does the analysis in the browser.
///
/// This component is the whole reason the architecture looks the way it does:
/// the server sends rows it cannot read, and everything meaningful happens
/// after they arrive.
export function StudyPanel({
  running,
  isIOS = false,
}: {
  isIOS?: boolean;
  running: {
    id: string;
    startedAt: string;
    focusModeActive: boolean;
  } | null;
}) {
  const { reveal, conceal, status } = useCrypto();
  const [insights, setInsights] = useState<ComputedInsight[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [daily, setDaily] = useState<ReturnType<typeof dailyStudyMinutes> | null>(
    null,
  );
  const [recap, setRecap] = useState<WeeklyRecap | null>(null);
  const [alerts, setAlerts] = useState<WellbeingAlert[]>([]);
  const [advice, setAdvice] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [lastDevice, setLastDevice] = useState<DeviceReadout | null>(null);
  const [failed, setFailed] = useState(false);
  /// How many scores came from the gradebook rather than being typed in, and
  /// how much small work was left out. Shown, because "based on 11 scores"
  /// when the gradebook shows 40 rows is a question a student will ask.
  const [derivedCount, setDerivedCount] = useState(0);
  const [minorExcluded, setMinorExcluded] = useState(0);

  const collectPendingDeviceData = useCallback(async () => {
    const pending = await fetchPendingDeviceData();
    if (pending.length === 0) return;

    // Grouped by session, because each commit is scoped to one and the
    // extension may have staged across a session boundary.
    const bySession = new Map<string, { id: string; payload: Sealed }[]>();

    for (const row of pending) {
      const payload = row.payload as {
        sessionId?: string;
        domains?: { domain: string; seconds: number }[];
        blocked?: { site: string; overrideUsed: boolean }[];
      };
      if (!payload?.sessionId) continue;

      const sealed = await conceal({
        domains: payload.domains ?? [],
        blocked: payload.blocked ?? [],
      });

      const list = bySession.get(payload.sessionId) ?? [];
      list.push({ id: row.id, payload: sealed });
      bySession.set(payload.sessionId, list);
    }

    for (const [sessionId, entries] of bySession) {
      await commitPendingDeviceData({ sessionId, entries });
    }
  }, [conceal]);

  const load = useCallback(async () => {
    if (status !== "unlocked") return;

    try {
      // Collect anything the extension staged before reading records, so a
      // session that just ended includes its laptop activity rather than
      // showing it a page-load late.
      //
      // The extension has no key, so its data waits on the server in readable
      // form until this runs. Encrypting and clearing it here is what keeps
      // that window measured in minutes.
      await collectPendingDeviceData();

      const raw = await fetchEncryptedRecords();
      setFailed(false);
      if (!raw) return;

      // The student's own blocklist defines what counts as a distraction, so
      // the number matches what Focus Mode actually blocks for them.
      const prefs = await getBlocklistPrefs();
      const blocklist = buildBlocklist(prefs);

      // Extension records arrive per session, several per session, so they're
      // summed before being attached.
      const distractedBySession = new Map<string, number>();
      // Kept per app rather than summed away, so the student can be shown what
      // their laptop actually saw rather than a single number they have no way
      // to check.
      const appsBySession = new Map<string, Map<string, number>>();

      for (const row of raw.activity) {
        try {
          const p = await reveal<{
            domains?: { domain: string; seconds: number }[];
          }>({ cipher: row.payloadCipher, iv: row.payloadIv });
          const { distractedSeconds } = splitActivity(
            p.domains ?? [],
            blocklist,
          );
          distractedBySession.set(
            row.sessionId,
            (distractedBySession.get(row.sessionId) ?? 0) + distractedSeconds,
          );

          const apps = appsBySession.get(row.sessionId) ?? new Map<string, number>();
          for (const d of p.domains ?? []) {
            apps.set(d.domain, (apps.get(d.domain) ?? 0) + d.seconds);
          }
          appsBySession.set(row.sessionId, apps);
        } catch {
          // One unreadable row shouldn't cost the whole dashboard.
        }
      }

      const sessions = await Promise.all(
        raw.sessions
          .filter((s) => s.payloadCipher && s.payloadIv)
          .map(async (s) => {
            const p = await reveal<SessionPayload>({
              cipher: s.payloadCipher!,
              iv: s.payloadIv!,
            });
            return {
              id: s.id,
              startedAt: new Date(s.startedAt),
              durationMinutes: p.durationMinutes,
              subject: p.subject,
              location: p.location,
              noise: p.noise,
              stress: p.stress,
              wasCram: p.wasCram,
              // Undefined rather than zero when nothing was measured — a
              // session studied without the extension is unknown, not focused.
              distractedMinutes: distractedBySession.has(s.id)
                ? Math.round((distractedBySession.get(s.id) ?? 0) / 60)
                : undefined,
            };
          }),
      );

      // The most recent session a device reported on — which is usually the one
      // that just ended, and is the only one a student wants to check.
      const withDevice = sessions
        .filter((s) => appsBySession.has(s.id))
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];

      if (withDevice) {
        const apps = appsBySession.get(withDevice.id)!;
        const entries = [...apps.entries()]
          .map(([name, seconds]) => ({
            name,
            seconds,
            distracted: matchesBlocklist(name, blocklist),
          }))
          .sort((a, b) => b.seconds - a.seconds);

        setLastDevice({
          startedAt: withDevice.startedAt,
          entries,
          totalSeconds: entries.reduce((n, e) => n + e.seconds, 0),
        });
      } else {
        setLastDevice(null);
      }

      const sleep = await Promise.all(
        raw.sleep.map(async (s) => ({
          forDate: new Date(s.forDate),
          hours: (await reveal<SleepPayload>({
            cipher: s.payloadCipher,
            iv: s.payloadIv,
          })).hours,
        })),
      );

      const screenTime = await Promise.all(
        raw.screenTime.map(async (s) => ({
          forDate: new Date(s.forDate),
          minutes: (await reveal<ScreenTimePayload>({
            cipher: s.payloadCipher,
            iv: s.payloadIv,
          })).minutes,
        })),
      );

      const outcomes = await Promise.all(
        raw.outcomes.map(async (o) => {
          const p = await reveal<OutcomePayload>({
            cipher: o.payloadCipher,
            iv: o.payloadIv,
          });
          return {
            id: o.id,
            occurredOn: new Date(o.occurredOn),
            percentage: p.percentage,
            subject: p.subject,
            label: p.label,
          };
        }),
      );

      // Real marked work, which is what the engine was always meant to
      // compare against and had never once been given. Everything here has
      // been syncing from Canvas and HAC for weeks with no consumer; see
      // `graded-work.ts` for why the date has to be `dueAt` and why the
      // two-point homework is left out.
      const gradebook = await fetchGradebook();
      let fromGrades: OutcomeRecord[] = [];
      let minorCount = 0;
      if (gradebook) {
        const courseNames = new Map<string, string>();
        await Promise.all(
          gradebook.courses.map(async (c) => {
            const p = await reveal<{ name?: string; shortName?: string }>({
              cipher: c.payloadCipher,
              iv: c.payloadIv,
            });
            courseNames.set(c.id, p.shortName || p.name || "Course");
          }),
        );

        const marked: MarkedWork[] = await Promise.all(
          gradebook.assignments.map(async (a) => {
            const p = await reveal<{
              name?: string;
              category?: string | null;
              score?: number | null;
              pointsPossible?: number | null;
            }>({ cipher: a.payloadCipher, iv: a.payloadIv });
            return {
              id: a.id,
              course: courseNames.get(a.courseId) ?? "Course",
              name: p.name ?? "Untitled",
              category: p.category ?? null,
              score: p.score ?? null,
              pointsPossible: p.pointsPossible ?? null,
              dueAt: a.dueAt ? new Date(a.dueAt) : null,
              updatedAt: new Date(a.updatedAt),
            };
          }),
        );

        const summary = outcomesFromMarkedWork(marked);
        fromGrades = summary.outcomes;
        minorCount = summary.excludedAsMinor;
      }

      setMinorExcluded(minorCount);
      setDerivedCount(fromGrades.length);

      const inputs: InsightInputs = {
        sessions,
        sleep,
        screenTime,
        // Typed-in scores win on a collision, so a test entered by hand and
        // later posted to the gradebook is not counted twice.
        outcomes: mergeOutcomes(outcomes, fromGrades),
      };
      setInsights(computeInsights(inputs));
      setStats(basicStats(inputs));
      setRecap(weeklyRecap(inputs));
      setDaily(dailyStudyMinutes(inputs));
      setAlerts(wellbeingAlerts(inputs));

      // Only ask for phrasing once something real exists to phrase. The plan's
      // minimum bar, and the reason this never produces generic filler.
      const validated = computeInsights(inputs).filter((i) => i.isSurfaced);
      if (validated.length > 0) {
        const rec = await requestRecommendation({
          insights: validated.slice(0, 3).map((i) => ({
            statement: i.statement,
            direction: i.direction,
            magnitude: i.magnitude,
            sampleSize: i.sampleSize,
          })),
          upcoming: [],
        });
        setAdvice(rec.ok ? rec.text : null);
      }
      setSubjects([
        ...new Set(
          [...sessions.map((s) => s.subject), ...outcomes.map((o) => o.subject)]
            .filter((s): s is string => Boolean(s))
            .map((s) => s.trim()),
        ),
      ]);
    } catch {
      // Failing to decrypt is not the same as having no data, and must never
      // be shown as an empty dashboard — that would read as data loss.
      setFailed(true);
    }
  }, [reveal, status, collectPendingDeviceData]);

  useEffect(() => {
    // The rule can't see that `load` awaits before it touches state — every
    // setState in it happens after a network round trip, so there is no
    // cascading render to avoid. This genuinely has to be an effect: the data
    // arrives as ciphertext and can only be decrypted on the client, so a
    // server component can't do it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const surfaced = insights?.filter((i) => i.isSurfaced) ?? [];
  const pending = insights?.filter((i) => !i.isSurfaced) ?? [];

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

      {stats && (
        <section className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
          <Stat value={String(stats.sessionsThisWeek)} label="Sessions this week" />
          <Stat value={formatDuration(stats.minutesThisWeek)} label="Time logged" />
          <Stat
            value={stats.meanSleep ? `${stats.meanSleep.toFixed(1)} hrs` : "—"}
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
      )}

      {recap && recap.sessions > 0 && (
        <section className="panel p-6">
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
      )}

      {lastDevice && lastDevice.entries.length > 0 && (
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
            name — never a page title or a document name. Encrypted here in your
            browser, the same as everything else.
          </p>
        </section>
      )}

      {alerts.length > 0 && (
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
      )}

      {advice && (
        <section className="rounded-lg border border-accent/30 bg-accent-soft p-6">
          <h2 className="label text-accent">Suggested this week</h2>
          <p className="mt-3 text-[17px] leading-relaxed">{advice}</p>
          <p className="mt-4 text-[13px] leading-relaxed text-text-faint">
            Written from the patterns above, which were worked out here on your
            device. Only the finished pattern was sent to phrase it, never your
            sessions or grades.
          </p>
        </section>
      )}

      <section className="pt-6">
        <h2 className="h2 text-[clamp(1.6rem,4vw,2.125rem)]">
          What we&rsquo;re seeing
        </h2>

        {failed && (
          <p role="alert" className="mt-4 text-[17px] text-down">
            Couldn&rsquo;t read your data just now. Nothing is lost — reload and
            it should come back.
          </p>
        )}

        {!failed && insights === null && (
          <p className="mt-4 text-[17px] text-text-muted">Reading your log…</p>
        )}

        {!failed && insights !== null && insights.length === 0 && (
          <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-text-muted">
            {derivedCount > 0
              ? `Your gradebook has given us ${derivedCount} score${derivedCount === 1 ? "" : "s"} to work with. What's missing is study sessions — patterns come from comparing the two, so log a few and this fills in.`
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
              ` ${minorExcluded} smaller ${minorExcluded === 1 ? "grade was" : "grades were"} left out — a 2/2 warm-up counts as a 100% and would drown out your real assessments.`}
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
    </div>
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
