import Link from "next/link";
import { AppNav } from "@/components/chrome";
import { GpaPanel, GradesPanel } from "@/components/grades-panel";
import { GradebookProvider } from "@/components/gradebook-data";
import { InsightProgress } from "@/components/insight-progress";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getOrCreateUser, nextOnboardingStep } from "@/lib/user";
import { getSchoolDayState } from "@/lib/current-period";
import { getCanvasStatus } from "@/app/actions/canvas";
import { listDevices } from "@/app/actions/devices";
import { hasProfile } from "@/app/actions/profile";
import { AssignmentsPanel } from "@/components/assignments-panel";
import { CanvasAutoSync } from "@/components/canvas-auto-sync";
import { AssignmentPairing } from "@/components/assignment-pairing";
import { GradeOutcomes } from "@/components/grade-outcomes";
import { GapPrompt } from "@/components/gap-prompt";
import { RoutinePrompt } from "@/components/routine-prompt";
import {
  SuggestedThisWeek,
  WeekTrends,
  WhatWeAreSeeing,
} from "@/components/study-panel";
import { StudyDataProvider } from "@/components/study-data";
import { StatsChat } from "@/components/stats-chat";

export const metadata = { title: "Insight" };

/// A calendar date, not an instant.
///
/// Postgres `@db.Date` values arrive as midnight UTC. Rendering one in
/// America/Chicago lands it at 7pm the evening before, so the first day of
/// school displays as the day before the first day of school. Calendar dates
/// are formatted in UTC because that is the only zone they were ever in.
function formatCalendarDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);
}

/// A real moment, which does belong in the school's zone.
function formatToday(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);
}

/// The "right now" panel. Real data — the period comes from the campus bell
/// schedule and the A/B assignment from the stored district calendar.
async function RightNow({ schoolId }: { schoolId: string }) {
  const state = await getSchoolDayState(schoolId);
  if (!state) return null;

  // Prominence tracks usefulness, which it did not used to.
  //
  // All three states rendered the same full-bleed Sky slab with an h1 in it —
  // so "no school today" arrived as the loudest thing on the dashboard, a
  // screen-height block of pale blue announcing that nothing was happening. It
  // was the first thing anyone saw and the least worth seeing, and it pushed
  // the work that *was* due below the fold.
  //
  // Only one of these three states tells a student something they can act on:
  // which class they are sitting in right now. That one keeps the panel. The
  // other two are a line of text, because that is what they are worth.
  if (state.kind === "NO_SCHOOL") {
    return (
      <span className="text-text-faint">
        No school today
        {state.nextSchoolDay
          ? ` · next is ${formatCalendarDate(state.nextSchoolDay)}`
          : ""}
      </span>
    );
  }

  if (state.kind === "BEFORE_OR_AFTER") {
    return (
      <span className="text-text-faint">
        {state.dayLabel ? `${state.dayLabel} · ` : ""}Outside class hours
      </span>
    );
  }

  // In class, which is the one state worth a colour. It sits inline in the
  // masthead rather than in a panel of its own: it is one short fact, and a
  // full-width slab for it was pushing the work that is actually due below
  // the fold.
  return (
    <span className="text-text-muted">
      {state.dayLabel ? `${state.dayLabel} · ` : ""}
      <span className="text-text">{state.description}</span>
      <span className="text-accent">
        {" · "}
        {state.rounded
          ? `starts in ${state.minutesRemaining} min`
          : `ends in ${state.minutesRemaining} min`}
      </span>
    </span>
  );
}

/// The remaining setup a student can finish whenever they like. Everything
/// here is optional to reach the dashboard but unlocks something concrete.
function FinishSetup({
  hasCanvas,
  hasExtension,
  hasBaseline,
}: {
  hasCanvas: boolean;
  hasExtension: boolean;
  hasBaseline: boolean;
}) {
  const items: {
    title: string;
    body: string;
    done: boolean;
    href: string | null;
  }[] = [
    {
      title: "Connect Canvas",
      body: "Brings in your courses, due dates and grades.",
      done: hasCanvas,
      href: "/canvas",
    },
    {
      title: "Your usual week",
      body: "Sleep and wake times, and where you usually study — the baseline everything else is measured against.",
      done: hasBaseline,
      href: "/baseline",
    },
    {
      title: "Pair a device",
      body: "The extension, or the Windows or Mac app. Tracks time during a session, and powers Focus Mode.",
      done: hasExtension,
      href: "/devices",
    },
  ];

  const remaining = items.filter((i) => !i.done).length;
  if (remaining === 0) return null;

  return (
    <section className="panel px-7 py-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="h3 text-[17px]">Finish setting up</h2>
        <span className="label text-text-faint">{remaining} left</span>
      </div>
      <div className="mt-4">
        {items.map((item, i) => (
          <div
            key={item.title}
            className={`flex items-baseline justify-between gap-6 py-3 ${
              i > 0 ? "border-t border-line" : ""
            }`}
          >
            <div className="min-w-0">
              <div
                className={`text-[15px] ${item.done ? "text-text-faint line-through" : ""}`}
              >
                {item.title}
              </div>
              <div className="mt-0.5 text-[14px] text-text-faint">
                {item.body}
              </div>
            </div>
            {!item.done && item.href && (
              <Link href={item.href} className="shrink-0 text-[14px] text-accent">
                Set up
              </Link>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function Dashboard() {
  const user = await getOrCreateUser();
  if (!user) redirect("/sign-in");
  if (nextOnboardingStep(user) !== "DONE") redirect("/onboarding");

  const today = new Date();
  const canvas = await getCanvasStatus();
  const devices = await listDevices();
  const hasBaseline = await hasProfile();

  // Counts, not contents. Row existence is plaintext by the schema rule, so
  // the server can say how many sessions there are without being able to read
  // one — which is what lets the wait be shown before the student unlocks.
  const [sessionCount, outcomeCount] = await Promise.all([
    db.studySession.count({ where: { userId: user.id, endedAt: { not: null } } }),
    db.outcome.count({ where: { userId: user.id } }),
  ]);

  return (
    <>
      <AppNav email={user.email} />

      {/* One decrypt of the gradebook for the whole screen. The GPA band at the
          top and the grades list further down are the same data seen twice, and
          before this each would have unwrapped every assignment row itself. */}
      <GradebookProvider>
        <StudyDataProvider>
        <div className="mx-auto w-full max-w-5xl flex-1 px-6 pb-32 pt-8">
          {/* The masthead. Where you are, then where you stand.

              Both halves of this used to be somewhere else: the date and school
              were a grey footnote at the very bottom of the page, and "which
              class am I in" was a full-bleed slab at the top. Neither placement
              matched what the information is worth — one is orientation, which
              belongs at the top and belongs small. */}
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[14px]">
            <span className="text-text">
              {formatToday(today, user.school?.timezone ?? "America/Chicago")}
            </span>
            {user.schoolId && <RightNow schoolId={user.schoolId} />}
            <span className="ml-auto text-text-faint">
              {user.gradeLevel ? `Grade ${user.gradeLevel}` : ""}
              {user.gradeLevel && user.school?.name ? " · " : ""}
              {user.school?.name ?? ""}
            </span>
          </header>

          {/* The one number the app exists to answer, in the one material
              nothing else on the screen is made of. See `gpa-card.tsx`. */}
          <div className="mt-5">
            <GpaPanel />
          </div>

          {/* Things that interrupt: a question to answer, a gap to explain.
              Full width because they are asks, not reading. */}
          <div className="mt-6 empty:mt-0 space-y-6">
            <RoutinePrompt />
            <GapPrompt />
          </div>

          {/* Kept high so the ten-minute Canvas pull starts on load rather than
              after everything below has rendered. It draws nothing. */}
          <CanvasAutoSync />

          {/* Two columns, because ten stacked panels of identical width was the
              actual complaint — no amount of good typography inside a card
              fixes a page whose every element is the same size and shape.

              The split is by frequency, not importance. The left column is what
              a student opens the app for several times a day: what's due, what
              just got marked, and the timer they start when they sit down. The
              right is everything that is true but not urgent — how close the
              insight engine is, what setup is left, a score to confirm. Those
              were interleaved with the daily things before, which is how a
              dashboard turns into a feed you scroll past.

              One column below `lg`, in source order, which puts the daily
              things first on a phone. */}
          <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
            <main className="space-y-6">
              {/* What's due and what just got marked: the two things a student
                  opens the app for several times a day. The timer used to sit
                  in this column and now lives on /study, because starting a
                  session is a deliberate act and deserves a screen. */}
              <AssignmentsPanel />
              <GradesPanel />

              {/* The trend, which is the dashboard's answer to "how is this
                  week going" — a chart rather than the paragraph of totals
                  that used to be here. The full record is on /logs. */}
              <WeekTrends />

              {/* The findings, and the reason any of the rest exists. */}
              <SuggestedThisWeek />
              <WhatWeAreSeeing />
              <StatsChat />
            </main>

            <aside className="space-y-6 lg:sticky lg:top-6">
              <InsightProgress
                sessions={sessionCount}
                outcomes={outcomeCount}
              />

              {/* Setup, beside the daily things rather than under them. It is
                  finite and mostly done; a checklist above the content is how a
                  checklist gets ignored. */}
              <FinishSetup
                hasCanvas={canvas.connected}
                // Any paired device counts. A student on a Mac who never
                // installs the extension has still done this, and nagging them
                // for a checkbox they deliberately skipped is how a checklist
                // gets ignored entirely.
                hasExtension={devices.length > 0}
                hasBaseline={hasBaseline}
              />

              <GradeOutcomes />

              <AssignmentPairing />
            </aside>
          </div>
          </div>
        </StudyDataProvider>
      </GradebookProvider>
    </>
  );
}
