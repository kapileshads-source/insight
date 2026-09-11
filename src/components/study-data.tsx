"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useCrypto } from "@/components/crypto-provider";
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
import { type SessionPayload } from "@/lib/records";
import type { Sealed } from "@/lib/crypto";
import type {
  OutcomePayload,
  ScreenTimePayload,
  SleepPayload,
} from "@/lib/records";

type Stats = ReturnType<typeof basicStats>;

/// What one session's devices actually saw, app by app.
///
/// The numbers this feeds already existed, a single distracted total, folded
/// into the weekly recap and a sample-size-gated insight. That meant a student
/// who paired a laptop and studied for an hour saw no evidence whatsoever that
/// it had worked, which is indistinguishable from broken and was reported as
/// broken. The detail was decrypted and thrown away; this keeps it.
type DeviceReadout = {
  startedAt: Date;
  entries: { name: string; seconds: number; distracted: boolean }[];
  totalSeconds: number;
};


/**
 * One decrypt of the study log, shared by everything that reads it.
 *
 * This used to be a single 550-line `StudyPanel` that fetched, decrypted,
 * analysed and rendered, the timer, the quick-log form, the weekly recap and
 * chart, what the devices saw, the wellbeing alerts, the advice and the
 * insight list. All of it on the dashboard, in one column.
 *
 * Splitting those across pages meant the analysis had to stop being owned by
 * the thing that draws it. Every session, sleep entry and outcome is unwrapped
 * individually, so three pages each doing their own pass would be three times
 * the AES work for identical results.
 *
 * The gather below is unchanged from the version that shipped inside
 * `StudyPanel`; it was moved, not rewritten.
 */
export type StudyData = {
  insights: ComputedInsight[] | null;
  stats: Stats | null;
  daily: ReturnType<typeof dailyStudyMinutes> | null;
  recap: WeeklyRecap | null;
  alerts: WellbeingAlert[];
  advice: string | null;
  subjects: string[];
  lastDevice: DeviceReadout | null;
  failed: boolean;
  /// How many scores came from the gradebook rather than being typed in, and
  /// how much small work was left out.
  derivedCount: number;
  minorExcluded: number;
};

const Ctx = createContext<StudyData | null>(null);

export function StudyDataProvider({ children }: { children: React.ReactNode }) {
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
              // Undefined rather than zero when nothing was measured, a
              // session studied without the extension is unknown, not focused.
              distractedMinutes: distractedBySession.has(s.id)
                ? Math.round((distractedBySession.get(s.id) ?? 0) / 60)
                : undefined,
            };
          }),
      );

      // The most recent session a device reported on, which is usually the one
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
      // be shown as an empty dashboard, that would read as data loss.
      setFailed(true);
    }
  }, [reveal, status, collectPendingDeviceData]);

  useEffect(() => {
    // The rule can't see that `load` awaits before it touches state, every
    // setState in it happens after a network round trip, so there is no
    // cascading render to avoid. This genuinely has to be an effect: the data
    // arrives as ciphertext and can only be decrypted on the client, so a
    // server component can't do it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <Ctx.Provider
      value={{
        insights,
        stats,
        daily,
        recap,
        alerts,
        advice,
        subjects,
        lastDevice,
        failed,
        derivedCount,
        minorExcluded,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useStudyData(): StudyData {
  const value = useContext(Ctx);
  if (!value) {
    throw new Error("useStudyData must be used inside StudyDataProvider");
  }
  return value;
}
