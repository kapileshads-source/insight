"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { fetchGradebook } from "@/app/actions/grades";
import { fetchStoredTranscript } from "@/app/actions/hac";
import { useCrypto } from "@/components/crypto-provider";
import type { GpaInput } from "@/components/gpa-card";
import { officialGpa, semesterGrades, type Transcript } from "@/lib/transcript";
import {
  buildGradebook,
  gradedSince,
  oneCardPerClass,
  type CourseGrades,
  type GradeRow,
  type GradeStatus,
} from "@/lib/gradebook";

/**
 * One decrypt of the gradebook, shared by everything that needs it.
 *
 * This used to live inside `GradesPanel`, which was fine while the grades list
 * and the GPA were the same block of the page. The redesign separates them —
 * the GPA is now the headline at the top of the dashboard and the list sits
 * further down — and two components cannot each own the same decrypt without
 * doing the work twice. Every assignment row is unwrapped individually, so
 * "twice" is measured in hundreds of AES operations, not two fetches.
 *
 * The gather itself is unchanged from the version that shipped in
 * `grades-panel.tsx`; it was moved, not rewritten. Nothing about which courses
 * count, how HAC and Canvas are reconciled, or how the transcript anchors the
 * GPA is decided here — those live in `gradebook.ts`, `gpa.ts` and
 * `transcript.ts`, and this file only hands their answers to React.
 */

type Payload = {
  name?: string;
  course?: string;
  category?: string | null;
  score?: number | null;
  pointsPossible?: number | null;
  status?: GradeStatus;
};

export type GradebookState =
  /// The key is not in memory. Nothing can be read, and nothing should render.
  | { status: "locked" }
  /// Unlocked, decrypt in flight.
  | { status: "loading" }
  /// A row would not decrypt — almost always a changed password.
  | { status: "failed" }
  | {
      status: "ready";
      courses: CourseGrades[];
      /// Marked since this browser last looked. Per-device on purpose.
      fresh: GradeRow[];
      gpa: GpaInput[];
      /// The school's own cumulative figure, off the transcript.
      past: { weighted: number | null; unweighted: number | null } | null;
      /// How many finished semester grades that figure covers.
      priorCount: number;
    };

const SEEN_KEY = "insight.grades.lastSeen";

function readLastSeen(): Date | null {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    if (!raw) return null;
    const at = new Date(raw);
    return Number.isNaN(at.getTime()) ? null : at;
  } catch {
    return null;
  }
}

function writeLastSeen(at: Date) {
  try {
    window.localStorage.setItem(SEEN_KEY, at.toISOString());
  } catch {
    // Private windows and blocked site data. The badge simply never appears,
    // which is a worse experience and not a broken one.
  }
}

const Ctx = createContext<GradebookState | null>(null);

export function GradebookProvider({ children }: { children: React.ReactNode }) {
  const { status, reveal } = useCrypto();
  const [state, setState] = useState<GradebookState>({ status: "locked" });

  /// Gathers and decrypts, and touches no state. Keeping the fetch and the
  /// setState apart is what lets the effect below cancel cleanly.
  const gather = useCallback(async (): Promise<GradebookState> => {
    const stored = await fetchGradebook();
    if (!stored) {
      return {
        status: "ready",
        courses: [],
        fresh: [],
        gpa: [],
        past: null,
        priorCount: 0,
      };
    }

    try {
      const names = new Map<string, string>();
      const reported = new Map<string, string | null>();
      const fromHac = new Set<string>();
      const gpa: GpaInput[] = [];
      await Promise.all(
        stored.courses.map(async (c) => {
          const p = await reveal<{
            name?: string;
            shortName?: string;
            reportedGrade?: string | null;
            hacNamed?: boolean;
          }>({ cipher: c.payloadCipher, iv: c.payloadIv });
          const label = p.shortName || p.name || "Course";
          names.set(c.id, label);
          // Only the gradebook's own figure is ever shown. See `gradebook.ts`
          // for why nothing is computed here.
          if (p.reportedGrade != null) reported.set(label, p.reportedGrade);
          // Two ways a class is on HAC's roll: HAC created the row, or HAC
          // matched an existing Canvas row and wrote its grade there. Reading
          // only the first made PLTW disappear — its HAC grade landed on the
          // Canvas row, which then looked like a duplicate and was dropped.
          if (c.canvasId === null || p.hacNamed) fromHac.add(label);

          // The same figure, parsed, for the GPA estimate. A course with no
          // grade posted contributes nothing rather than a zero.
          const asNumber =
            p.reportedGrade == null ? NaN : Number(p.reportedGrade);
          gpa.push({
            id: c.id,
            title: label,
            fromHac: c.canvasId === null || p.hacNamed === true,
            grade: Number.isFinite(asNumber) ? asNumber : null,
          });
        }),
      );

      const rows: GradeRow[] = await Promise.all(
        stored.assignments.map(async (a) => {
          const p = await reveal<Payload>({
            cipher: a.payloadCipher,
            iv: a.payloadIv,
          });
          return {
            id: a.id,
            course: names.get(a.courseId) || p.course || "Course",
            name: p.name || "Untitled",
            category: p.category ?? null,
            score: p.score ?? null,
            pointsPossible: p.pointsPossible ?? null,
            status: p.status ?? "UNGRADED",
            updatedAt: new Date(a.updatedAt),
          };
        }),
      );

      // The transcript, if it has been read. Its GPA is the school's own and
      // anchors the estimate; the count behind it is how many finished
      // semester grades that figure covers.
      let past: { weighted: number | null; unweighted: number | null } | null =
        null;
      let priorCount = 0;
      const sealed = await fetchStoredTranscript();
      if (sealed) {
        try {
          const transcript = await reveal<Transcript>(sealed);
          const official = officialGpa(transcript);
          past = {
            weighted: official.weighted?.value ?? null,
            unweighted: official.unweighted?.value ?? null,
          };
          priorCount = semesterGrades(transcript).length;
        } catch {
          // An unreadable transcript is not worth failing the whole panel for.
          // The estimate simply falls back to this term alone.
        }
      }

      const seen = readLastSeen();
      return {
        status: "ready",
        courses: oneCardPerClass(buildGradebook(rows, reported, fromHac)),
        fresh: gradedSince(rows, seen),
        gpa,
        past,
        priorCount,
      };
    } catch {
      // A row that won't decrypt is a real possibility after a password change,
      // and it must not take the dashboard down with it.
      return { status: "failed" };
    }
  }, [reveal]);

  useEffect(() => {
    // Locked and loading are *derived* from the crypto status, not stored.
    //
    // Both used to be written here with `setState`, which is the one genuine
    // instance of the lint rule's complaint in this codebase: a synchronous
    // setState inside an effect renders twice for a value that was already
    // knowable during the first render. Everything else flagged by that rule
    // sets state after awaiting a round trip, which is fine.
    //
    // So the effect now only ever reports the *result* of a decrypt, and the
    // two states that are a function of `status` are worked out below.
    if (status !== "unlocked") return;

    // Guarded because the read is slow — every row is decrypted one at a time
    // — and a student can unlock, look, and navigate away well before it
    // finishes. Without this, the result lands on an unmounted component.
    let live = true;
    void gather().then((result) => {
      if (!live) return;
      setState(result);
      // Written only once the marks are actually on screen. Stamping "seen" at
      // fetch time would clear the badge for grades the student never saw,
      // because the tab closed or the decrypt failed halfway.
      if (result.status === "ready") writeLastSeen(new Date());
    });

    return () => {
      live = false;
    };
  }, [status, gather]);

  // The key is not in memory, so nothing can be read and nothing should
  // render — whatever a previous unlock left in `state` is stale the moment
  // the key goes, so it is ignored rather than cleared.
  const value: GradebookState =
    status !== "unlocked"
      ? { status: "locked" }
      : // Unlocked but the decrypt has not landed yet. `state` still holds
        // whatever the last one produced, which for a re-lock-and-unlock is
        // the previous session's data; "loading" until a fresh result arrives.
        state.status === "locked"
        ? { status: "loading" }
        : state;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGradebook(): GradebookState {
  const value = useContext(Ctx);
  if (!value) {
    throw new Error("useGradebook must be used inside GradebookProvider");
  }
  return value;
}
