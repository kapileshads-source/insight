"use client";

import { useCallback, useEffect, useState } from "react";
import { useCrypto } from "@/components/crypto-provider";
import { InsightRow } from "@/components/insight-row";
import { QuickLog } from "@/components/quick-log";
import { SessionTimer } from "@/components/session-timer";
import { fetchEncryptedRecords } from "@/app/actions/logs";
import { requestRecommendation } from "@/app/actions/recommendations";
import {
  commitPendingDeviceData,
  fetchPendingDeviceData,
} from "@/app/actions/devices";
import {
  basicStats,
  computeInsights,
  weeklyRecap,
  wellbeingAlerts,
  type ComputedInsight,
  type InsightInputs,
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

/// Fetches ciphertext, decrypts it here, and does the analysis in the browser.
///
/// This component is the whole reason the architecture looks the way it does:
/// the server sends rows it cannot read, and everything meaningful happens
/// after they arrive.
export function StudyPanel({
  running,
}: {
  running: { id: string; startedAt: string } | null;
}) {
  const { reveal, conceal, status } = useCrypto();
  const [insights, setInsights] = useState<ComputedInsight[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recap, setRecap] = useState<WeeklyRecap | null>(null);
  const [alerts, setAlerts] = useState<WellbeingAlert[]>([]);
  const [advice, setAdvice] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);

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
            };
          }),
      );

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

      const inputs: InsightInputs = { sessions, sleep, screenTime, outcomes };
      setInsights(computeInsights(inputs));
      setStats(basicStats(inputs));
      setRecap(weeklyRecap(inputs));
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
    <>
      <section className="mt-6">
        <SessionTimer running={running} recentSubjects={subjects} />
      </section>

      <section className="mt-6">
        <QuickLog recentSubjects={subjects} />
      </section>

      {stats && (
        <section className="mt-16 grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
          <Stat value={String(stats.sessionsThisWeek)} label="Sessions this week" />
          <Stat value={formatDuration(stats.minutesThisWeek)} label="Time logged" />
          <Stat
            value={stats.meanSleep ? `${stats.meanSleep.toFixed(1)} hrs` : "—"}
            label="Sleep, 7-day"
          />
          <Stat value={String(stats.outcomesLogged)} label="Scores logged" />
        </section>
      )}

      {recap && recap.sessions > 0 && (
        <section className="mt-14 rounded-lg border border-line bg-surface p-6">
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
          {recap.headline && (
            <p className="mt-4 border-t border-line pt-4 text-[15px] leading-relaxed text-text-muted">
              {recap.headline.statement}
            </p>
          )}
        </section>
      )}

      {alerts.length > 0 && (
        <section className="mt-14 rounded-lg border border-butter/30 bg-butter/8 p-6">
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
        <section className="mt-6 rounded-lg border border-sky/30 bg-sky-soft p-6">
          <h2 className="label text-sky">Suggested this week</h2>
          <p className="mt-3 text-[17px] leading-relaxed">{advice}</p>
          <p className="mt-4 text-[13px] leading-relaxed text-text-faint">
            Written from the patterns above, which were worked out here on your
            device. Only the finished pattern was sent to phrase it, never your
            sessions or grades.
          </p>
        </section>
      )}

      <section className="mt-16">
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
            Nothing yet. Log a few sessions and a test score, and patterns start
            appearing once there&rsquo;s enough of them to mean something.
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
    </>
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
