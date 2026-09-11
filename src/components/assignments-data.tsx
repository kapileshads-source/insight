"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { fetchStoredAssignments } from "@/app/actions/canvas";
import { useCrypto } from "@/components/crypto-provider";
import {
  groupAssignments,
  submissionStateFromHac,
  type AssignmentGroup,
  type AssignmentRow,
  type SubmissionState,
} from "@/lib/assignments";

/**
 * One decrypt of what Canvas and HAC say is outstanding.
 *
 * Third provider on the same argument as the other two: the dashboard wants a
 * count of what is due, `/work` wants the list, and every assignment row is
 * unwrapped individually, so two components each doing their own pass is
 * twice the AES work for the same answer.
 *
 * The gather is unchanged from the version inside `AssignmentsPanel`. Ticking
 * an item off stayed with the panel, because that is a write and only the list
 * does it.
 */

/// Canvas and HAC store different shapes. Canvas has `state`; HAC has `status`
/// and carries its own course name.
type Payload = {
  name?: string;
  course?: string;
  pointsPossible?: number | null;
  state?: SubmissionState;
  status?: string;
  score?: number | null;
  assignedOn?: string | null;
};

export type AssignmentsState = {
  groups: AssignmentGroup[] | null;
  units: { course: string; unit: string }[];
  failed: boolean;
  unlocked: boolean;
};

const Ctx = createContext<AssignmentsState | null>(null);

export function AssignmentsProvider({ children }: { children: React.ReactNode }) {
  const { reveal, status } = useCrypto();
  const [groups, setGroups] = useState<AssignmentGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [units, setUnits] = useState<{ course: string; unit: string }[]>([]);

  const load = useCallback(async () => {
    const stored = await fetchStoredAssignments();
    if (!stored) {
      setGroups([]);
      return;
    }

    try {
      const courseNames = new Map<string, string>();
      // What each class is on now, and which assignments sit inside it.
      const units: { course: string; unit: string }[] = [];
      const currentModuleIds = new Set<string>();
      const unitByCourse = new Map<string, string>();
      await Promise.all(
        stored.courses.map(async (c) => {
          const p = await reveal<{
            name?: string;
            shortName?: string;
            currentModule?: { name: string; assignmentIds: string[] } | null;
          }>({
            cipher: c.payloadCipher,
            iv: c.payloadIv,
          });
          const label = p.shortName || p.name || "Course";
          courseNames.set(c.id, label);
          if (p.currentModule?.name) {
            units.push({ course: label, unit: p.currentModule.name });
            unitByCourse.set(c.id, p.currentModule.name);
            for (const id of p.currentModule.assignmentIds ?? []) {
              currentModuleIds.add(id);
            }
          }
        }),
      );

      const rows: AssignmentRow[] = await Promise.all(
        stored.assignments.map(async (a) => {
          const p = await reveal<Payload>({
            cipher: a.payloadCipher,
            iv: a.payloadIv,
          });
          return {
            id: a.id,
            name: p.name || "Untitled assignment",
            course: courseNames.get(a.courseId) || p.course || "Course",
            dueAt: a.dueAt ? new Date(a.dueAt) : null,
            completedAt: a.completedAt ? new Date(a.completedAt) : null,
            pointsPossible: p.pointsPossible ?? null,
            score: p.score ?? null,
            state:
              p.state ??
              (p.status ? submissionStateFromHac(p.status) : "UNSUBMITTED"),
            assignedOn: p.assignedOn ?? null,
            inCurrentModule: a.canvasId
              ? currentModuleIds.has(a.canvasId)
              : false,
            moduleName:
              a.canvasId && currentModuleIds.has(a.canvasId)
                ? (unitByCourse.get(a.courseId) ?? null)
                : null,
          };
        }),
      );

      setGroups(groupAssignments(rows));
      setUnits(units);
    } catch {
      // A row that won't decrypt is a real possibility after a password
      // change, and it must not take the dashboard down with it.
      setFailed(true);
    }
  }, [reveal]);

  useEffect(() => {
    // `load` awaits a round trip before it touches state, so there is no
    // cascading render for the rule to catch, and the data arrives as
    // ciphertext, so this genuinely cannot happen on the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "unlocked") void load();
  }, [status, load]);


  return (
    <Ctx.Provider
      value={{ groups, units, failed, unlocked: status === "unlocked" }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAssignments(): AssignmentsState {
  const value = useContext(Ctx);
  if (!value) {
    throw new Error("useAssignments must be used inside AssignmentsProvider");
  }
  return value;
}
