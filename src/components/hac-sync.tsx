"use client";

import { useState } from "react";

import { fetchHacState, pullHac, storeHacData } from "@/app/actions/hac";
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
  | {
      kind: "done";
      created: number;
      updated: number;
      unchanged: number;
      guessed: boolean;
      /// What the page actually contained, reported rather than inferred.
      /// Four wrong theories about why grades were missing were argued from
      /// the outside; a sync that says what it saw ends that.
      coursesSeen: number;
      gradesSeen: number;
      gradesWritten: number;
      via: "extension" | "password";
    }
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

    // Two ways to get the page, tried in that order.
    //
    // The extension first, because it uses the session already in this browser
    // and no password is involved. If it isn't there — which is every phone,
    // and any computer without it installed — fall back to the stored
    // credentials, which is the whole reason they exist.
    //
    // This fallback is the bug Kapilesh hit. `pullHac` was written, tested and
    // never called by anything, so a student could connect their credentials,
    // see "HAC is connected", and still have nothing ever fetched with them.
    // The habit in HANDOFF.md exists for exactly this: grep for the new export
    // outside the file that defines it.
    let html: string | null = null;
    let problem = "Couldn't read HAC just now.";
    let via: "extension" | "password" = "extension";
    let from = "the extension";

    const fetched = await requestHacPage();
    if (fetched.ok) {
      html = fetched.html;
    } else {
      const server = await pullHac();
      if (server.ok) {
        html = server.html;
        via = "password";
        from = server.from;
      } else {
        // The extension's reason is the more useful one when it is installed
        // but unhappy; otherwise the credential path's message is.
        // The credential path's message is the informative one whenever it
        // actually ran, because it now carries what each address returned.
        // The extension's reason only wins when the extension is installed
        // and unhappy about something specific.
        problem =
          fetched.reason === "no-extension"
            ? server.error
            : `${PROBLEMS[fetched.reason] ?? "Couldn't read HAC."} ${server.error}`;
      }
    }

    if (!html) {
      setOutcome({ kind: "problem", message: problem });
      return;
    }

    try {
      const {
        assignments: incoming,
        grades: incomingGrades,
        usedFallback,
      } = readPage(parseHacHtml(html));

      if (incoming.length === 0) {
        // Describe the page rather than assuming why it was empty.
        //
        // This used to say "normal early in a grading period" and stop, which
        // was a guess dressed as an explanation — and it was wrong: the page
        // being fetched was an iframe shell with no gradebook in it at all.
        // Three numbers separate the cases that actually occur: a shell (tiny
        // page, no courses), selectors that no longer match (large page, no
        // courses), and a genuinely empty term (courses found, no rows).
        const courses = parseHacHtml(html).length;
        const size = Math.round(html.length / 1024);

        setOutcome({
          kind: "problem",
          message:
            courses > 0
              ? `HAC gave ${courses} classes but no assignments in any of them — normal early in a grading period. (${size}KB from ${from}.)`
              : size < 10
                ? `That page was only ${size}KB and had no classes on it, so it is a wrapper rather than the gradebook. (From ${from}.)`
                : `Read ${size}KB from ${from} but found no classes on it — HAC's page layout has probably changed, which needs a look at the parser.`,
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
      let newCoursesWithGrades = 0;
      const refByCourse = new Map<string, string>();

      // Built before any course is created, not after.
      //
      // This was the bug behind "none of your 12 classes has posted a grade
      // yet" on an account whose HAC plainly showed 96.50% and 97.00%. Courses
      // HAC named but Insight had never seen were created here with only a
      // name, and the grade was written in a second pass that ran over
      // *existing* rows only — so every course got its grade on the sync after
      // the one that created it. A first sync therefore produced a full set of
      // classes with no grades at all, which is exactly what a student sees the
      // first time they connect and the only time they are watching.
      const gradeByCourse = new Map(
        incomingGrades.map((g) => [g.course, g.grade]),
      );

      const courseRefFor = async (name: string): Promise<{ id: string | null; ref: string | null }> => {
        const id = courseIdFor(name, courses, coursesMatch);
        if (id) return { id, ref: null };

        const existingRef = refByCourse.get(name);
        if (existingRef) return { id: null, ref: existingRef };

        const ref = `hac-${newCourses.length}`;
        refByCourse.set(name, ref);
        const grade = gradeByCourse.get(name) ?? null;
        if (grade) newCoursesWithGrades++;
        newCourses.push({
          ref,
          payload: await conceal({
            name,
            shortName: name,
            reportedGrade: grade,
            hacNamed: true,
          }),
        });
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
      // Resolved through the same matcher that files the assignments, rather
      // than by comparing names.
      //
      // This is the second half of why an account showing 96.50% in HAC was
      // told it had no grades. `courseIdFor` deliberately matches a HAC course
      // onto an existing *Canvas* row where it can — "MTH34300A - 8 AP Pre
      // Calculus S1 - C Lunch" and "AP Pre Calculus YR (SCHMIDT, AMANDA)" are
      // the same class. That row then keeps its Canvas name, and the grade was
      // being looked up by the stored name, which never appears in a HAC
      // heading. Every course that matched lost its grade silently.
      //
      // Driven from the grades HAC actually reported, so the lookup is always
      // in the direction the data came from.
      const courseUpdates = [];
      for (const g of incomingGrades) {
        const id = courseIdFor(g.course, courses, coursesMatch);
        if (!id) continue; // A course we have no row for is created above, with
        // its grade already in the payload.
        const existing = courses.find((c) => c.id === id);
        if (!existing || existing.reportedGrade === g.grade) continue;
        courseUpdates.push({
          id,
          payload: await conceal({
            name: existing.payloadName,
            shortName: existing.payloadShortName,
            reportedGrade: g.grade,
            // Marks the class as one HAC knows about, whichever row it landed
            // on.
            //
            // "Came from HAC" cannot be read off the Canvas id, and assuming it
            // could made a real class vanish. When a HAC course matches an
            // existing Canvas row — PLTW did — the grade is written onto that
            // row, which still has its Canvas id, so the de-duplication read it
            // as a Canvas duplicate and dropped it along with HAC's grade. The
            // student lost a whole class from their GPA.
            hacNamed: true,
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
        coursesSeen: new Set(incoming.map((a) => a.course)).size,
        gradesSeen: incomingGrades.length,
        gradesWritten: courseUpdates.length + newCoursesWithGrades,
        via,
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
        className="mt-5 rounded bg-accent px-4 py-2 text-[15px] text-on-light disabled:opacity-40"
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

          {/* What the page contained, not what we hoped it did.
          
              Missing grades were argued about from the outside four times, on
              four wrong theories, because the sync reported only what it wrote
              and never what it saw. These three numbers separate "HAC gave us
              nothing" from "we read it and dropped it" in one glance. */}
          <p className="text-[14px] leading-relaxed text-text-faint">
            Read {outcome.coursesSeen}{" "}
            {outcome.coursesSeen === 1 ? "class" : "classes"} and{" "}
            {outcome.gradesSeen} course{" "}
            {outcome.gradesSeen === 1 ? "grade" : "grades"} from HAC, via the{" "}
            {outcome.via === "password" ? "saved password" : "extension"}.{" "}
            {outcome.gradesWritten > 0
              ? `${outcome.gradesWritten} saved.`
              : outcome.gradesSeen === 0
                ? "HAC printed no overall grade for any class yet."
                : "All were already stored."}
          </p>
          {outcome.guessed && (
            <p className="text-[14px] leading-relaxed text-alert">
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
