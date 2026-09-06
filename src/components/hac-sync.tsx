"use client";

import { useState } from "react";

import { fetchHacState, storeHacData } from "@/app/actions/hac";
import { useCrypto } from "@/components/crypto-provider";
import { coursesMatch } from "@/lib/assignment-match";
import { readPage } from "@/lib/hac";
import { parseHacHtml } from "@/lib/hac-dom";
import { requestHacPage } from "@/lib/hac-bridge-client";
import {
  courseIdFor,
  planHacSync,
  type StoredHacAssignment,
} from "@/lib/hac-store";

/**
 * Pull the student's own HAC gradebook, from their own browser.
 *
 * The whole point of this route is that no password is involved anywhere. They
 * are already signed into HAC; the extension fetches a page they are already
 * allowed to see, and everything after that happens here, on plaintext that
 * never leaves the tab unencrypted.
 *
 * It is a button rather than a background job on purpose. This reads a
 * gradebook, which is the most sensitive thing the app touches, and a student
 * pressing a button each time is a much easier promise to keep than a timer
 * they have to trust.
 */

type Payload = {
  name?: string;
  course?: string;
  category?: string | null;
  assignedOn?: string | null;
  dueOn?: string | null;
  score?: number | null;
  pointsPossible?: number | null;
  status?: string;
};

type Outcome =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done"; created: number; updated: number; unchanged: number; guessed: boolean }
  | { kind: "problem"; message: string };

const PROBLEMS: Record<string, string> = {
  "signed-out":
    "You're not signed into Home Access Center in this browser. Open HAC, log in, and try again.",
  "needs-permission":
    "The Insight extension needs permission to read HAC. Click its icon in your toolbar and allow it there — the browser only accepts that from the extension itself.",
  "no-extension":
    "This needs the Insight browser extension, which is what reads HAC using the login you already have.",
  "not-hac": "Something asked for the wrong page. Nothing was read.",
};

export function HacSync() {
  const { conceal, reveal, status } = useCrypto();
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });

  async function pull() {
    setOutcome({ kind: "working" });

    const fetched = await requestHacPage();
    if (!fetched.ok) {
      setOutcome({
        kind: "problem",
        message: PROBLEMS[fetched.reason] ?? "Couldn't read HAC just now.",
      });
      return;
    }

    try {
      const {
        assignments: incoming,
        grades: incomingGrades,
        usedFallback,
      } = readPage(parseHacHtml(fetched.html));

      if (incoming.length === 0) {
        setOutcome({
          kind: "problem",
          message:
            "HAC loaded but had no assignments on it — which is normal early in a grading period.",
        });
        return;
      }

      const state = await fetchHacState();
      if (!state) {
        setOutcome({ kind: "problem", message: "Couldn't reach Insight." });
        return;
      }

      // Decrypt what we already hold. This is the only place the comparison
      // can happen: the server can't read either side.
      const courses = await Promise.all(
        state.courses.map(async (c) => {
          const p = await reveal<{
            name?: string;
            shortName?: string;
            reportedGrade?: string | null;
          }>({
            cipher: c.payloadCipher,
            iv: c.payloadIv,
          });
          return {
            id: c.id,
            name: p.shortName || p.name || "",
            // Kept so rewriting the payload to add a grade cannot blank the
            // name — a payload is replaced whole, not merged.
            payloadName: p.name,
            payloadShortName: p.shortName,
            reportedGrade: p.reportedGrade ?? null,
          };
        }),
      );

      const existing: StoredHacAssignment[] = await Promise.all(
        state.assignments.map(async (a) => {
          const p = await reveal<Payload>({
            cipher: a.payloadCipher,
            iv: a.payloadIv,
          });
          return {
            id: a.id,
            course: p.course ?? "",
            name: p.name ?? "",
            assignedOn: p.assignedOn ?? null,
            dueOn: p.dueOn ?? null,
            score: p.score ?? null,
            pointsPossible: p.pointsPossible ?? null,
            status: p.status ?? "UNGRADED",
          };
        }),
      );

      const plan = planHacSync(existing, incoming);

      // Courses HAC named that we have no row for. A class Canvas doesn't
      // know about is still a class.
      const newCourses: { ref: string; payload: Awaited<ReturnType<typeof conceal>> }[] = [];
      const refByCourse = new Map<string, string>();

      const courseRefFor = async (name: string): Promise<{ id: string | null; ref: string | null }> => {
        const id = courseIdFor(name, courses, coursesMatch);
        if (id) return { id, ref: null };

        const existingRef = refByCourse.get(name);
        if (existingRef) return { id: null, ref: existingRef };

        const ref = `hac-${newCourses.length}`;
        refByCourse.set(name, ref);
        newCourses.push({ ref, payload: await conceal({ name, shortName: name }) });
        return { id: null, ref };
      };

      const create = [];
      for (const row of plan.create) {
        const { id, ref } = await courseRefFor(row.course);
        create.push({
          courseId: id,
          courseRef: ref,
          // Kept in the clear so the assignments card can sort without
          // decrypting every row first — the same rule Canvas rows follow.
          dueAt: row.dueOn ? new Date(`${row.dueOn}T23:59:00`).toISOString() : null,
          payload: await conceal(row),
        });
      }

      const update = await Promise.all(
        plan.update.map(async ({ id, row }) => ({
          id,
          dueAt: row.dueOn ? new Date(`${row.dueOn}T23:59:00`).toISOString() : null,
          payload: await conceal(row),
        })),
      );

      // The overall figure beside each class, written onto the course rows we
      // already hold. New courses created above get theirs on the next sync
      // rather than complicating the two-phase ref dance for a number that is
      // one pull away.
      const gradeByCourse = new Map(
        incomingGrades.map((g) => [g.course, g.grade]),
      );
      const courseUpdates = [];
      for (const c of courses) {
        const grade = gradeByCourse.get(c.name);
        if (!grade || grade === c.reportedGrade) continue;
        courseUpdates.push({
          id: c.id,
          payload: await conceal({
            name: c.payloadName,
            shortName: c.payloadShortName,
            reportedGrade: grade,
          }),
        });
      }

      const stored = await storeHacData({
        newCourses,
        create,
        update,
        courseUpdates,
      });
      if (!stored.ok) {
        setOutcome({ kind: "problem", message: stored.error });
        return;
      }

      setOutcome({
        kind: "done",
        created: stored.created,
        updated: stored.updated,
        unchanged: plan.unchanged,
        guessed: usedFallback,
      });
    } catch {
      setOutcome({
        kind: "problem",
        message: "Couldn't read that gradebook. Nothing was saved.",
      });
    }
  }

  if (status !== "unlocked") return null;

  return (
    <section className="rounded-lg border border-line bg-surface p-6">
      <h2 className="h3 text-[17px]">Home Access Center</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
        Reads your gradebook using the login you already have in this browser.
        No password is typed, stored, or sent anywhere — the extension fetches
        the page, and it&rsquo;s encrypted here before it&rsquo;s saved.
      </p>

      <button
        type="button"
        onClick={() => void pull()}
        disabled={outcome.kind === "working"}
        className="mt-5 rounded bg-sky px-4 py-2 text-[15px] text-on-light disabled:opacity-40"
      >
        {outcome.kind === "working" ? "Reading…" : "Read my gradebook"}
      </button>

      {outcome.kind === "problem" && (
        <p className="mt-4 text-[15px] leading-relaxed text-down">
          {outcome.message}
        </p>
      )}

      {outcome.kind === "done" && (
        <div className="mt-4 space-y-2">
          <p className="text-[15px] leading-relaxed text-text-muted">
            {outcome.created} new, {outcome.updated} updated,{" "}
            {outcome.unchanged} already up to date.
          </p>
          {outcome.guessed && (
            <p className="text-[14px] leading-relaxed text-butter">
              HAC&rsquo;s table had no column headings, so the columns were read
              by position. If any scores look wrong, that&rsquo;s why — tell us
              rather than trusting them.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
