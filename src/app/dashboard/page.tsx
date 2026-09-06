import Link from "next/link";
import { AppNav } from "@/components/chrome";
import { GradesPanel } from "@/components/grades-panel";
import { InsightProgress } from "@/components/insight-progress";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isIOS } from "@/lib/user-agent";
import { db } from "@/lib/db";
import { getOrCreateUser, nextOnboardingStep } from "@/lib/user";
import { getSchoolDayState } from "@/lib/current-period";
import { getRunningSession } from "@/app/actions/sessions";
import { getCanvasStatus } from "@/app/actions/canvas";
import { listDevices } from "@/app/actions/devices";
import { hasProfile } from "@/app/actions/profile";
import { AssignmentsPanel } from "@/components/assignments-panel";
import { CanvasAutoSync } from "@/components/canvas-auto-sync";
import { AssignmentPairing } from "@/components/assignment-pairing";
import { GradeOutcomes } from "@/components/grade-outcomes";
import { GapPrompt } from "@/components/gap-prompt";
import { RoutinePrompt } from "@/components/routine-prompt";
import { StudyPanel } from "@/components/study-panel";

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

  if (state.kind === "NO_SCHOOL") {
    return (
      <section className="mt-10 rounded-xl bg-sky px-7 py-9 text-on-light sm:px-10 sm:py-11">
        <span className="label text-on-light-muted">No school today</span>
        <h1 className="h1 mt-4 text-[clamp(2.25rem,6vw,3.25rem)]">
          Nothing scheduled.
        </h1>
        {state.nextSchoolDay && (
          <p className="mt-5 text-[17px] leading-relaxed text-on-light-muted">
            Next school day is {formatCalendarDate(state.nextSchoolDay)}.
          </p>
        )}
      </section>
    );
  }

  if (state.kind === "BEFORE_OR_AFTER") {
    return (
      <section className="mt-10 rounded-xl bg-sky px-7 py-9 text-on-light sm:px-10 sm:py-11">
        <span className="label text-on-light-muted">
          {state.dayLabel || "Today"}
        </span>
        <h1 className="h1 mt-4 text-[clamp(2.25rem,6vw,3.25rem)]">
          Outside class hours.
        </h1>
        <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-on-light-muted">
          Good time to log a session. Nothing you do now counts against a
          period.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-10 rounded-xl bg-sky px-7 py-9 text-on-light sm:px-10 sm:py-11">
      <span className="label text-on-light-muted">
        {[
          state.dayLabel,
          state.rounded
            ? `starts in ${state.minutesRemaining} min`
            : `ends in ${state.minutesRemaining} min`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>

      <h1 className="h1 mt-4 text-[clamp(2.25rem,6vw,3.25rem)]">
        {state.description}
      </h1>

      <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-on-light-muted">
        Connect Canvas and this will show what&rsquo;s due for the class
        you&rsquo;re sitting in.
      </p>

    </section>
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
    <section className="mt-6 rounded-lg border border-line bg-surface px-7 py-6">
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
              <Link href={item.href} className="shrink-0 text-[14px] text-sky">
                Set up
              </Link>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/// Wraps StudyPanel so the two orderings above don't have to repeat the prop
/// shaping. A Date can't cross into a client component, so it goes as an ISO
/// string, which is the only reason this exists.
function StudyTimer({
  isIOS,
  running,
}: {
  isIOS: boolean;
  running: { id: string; startedAt: Date; focusModeActive: boolean } | null;
}) {
  return (
    <StudyPanel
      isIOS={isIOS}
      running={
        running
          ? {
              id: running.id,
              startedAt: running.startedAt.toISOString(),
              focusModeActive: running.focusModeActive,
            }
          : null
      }
    />
  );
}

export default async function Dashboard() {
  const user = await getOrCreateUser();
  if (!user) redirect("/sign-in");
  if (nextOnboardingStep(user) !== "DONE") redirect("/onboarding");

  const today = new Date();
  const running = await getRunningSession();
  const canvas = await getCanvasStatus();
  const devices = await listDevices();
  const hasBaseline = await hasProfile();
  // The Focus shortcut only exists on Apple's phones, and a button that opens
  // nothing is worse than no button.
  const onIPhone = isIOS((await headers()).get("user-agent"));

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

      <div className="mx-auto w-full max-w-3xl flex-1 px-6 pb-32 pt-8">

        {user.schoolId && <RightNow schoolId={user.schoolId} />}

        <RoutinePrompt />

        <GapPrompt />

        {/* Kept high so the ten-minute Canvas pull starts on load rather than
            after everything below has rendered. It draws nothing. */}
        <CanvasAutoSync />

        {/* Order is the whole argument of this screen.

            It used to open with a setup checklist and a 550-line timer, and
            put grades and deadlines below both. But the timer is something you
            touch once when you sit down to work, whereas what's due and what
            just got marked are what a student opens the app *for*, several
            times a day. An app that buries them is one you stop opening, and
            the insight engine says nothing for the first few weeks — so
            without a reason to come back, nobody is still here when it does.

            The exception is a session already running: then the timer is the
            live thing on the screen and belongs at the top. */}
        {running ? (
          <>
            <StudyTimer isIOS={onIPhone} running={running} />
            <AssignmentsPanel />
            <GradesPanel />
          </>
        ) : (
          <>
            <AssignmentsPanel />
            <GradesPanel />
            <StudyTimer isIOS={onIPhone} running={running} />
          </>
        )}

        <InsightProgress sessions={sessionCount} outcomes={outcomeCount} />

        {/* Setup, below the daily things. It is finite and mostly done; a
            checklist above the content is how a checklist gets ignored. */}
        <FinishSetup
          hasCanvas={canvas.connected}
          // Any paired device counts. A student on a Mac who never installs the
          // extension has still done this, and nagging them for a checkbox they
          // deliberately skipped is how a checklist gets ignored entirely.
          hasExtension={devices.length > 0}
          hasBaseline={hasBaseline}
        />

        <GradeOutcomes />

        <AssignmentPairing />

        <p className="mt-12 text-[13px] text-text-faint">
          {formatToday(today, user.school?.timezone ?? "America/Chicago")}
          {user.gradeLevel ? ` · Grade ${user.gradeLevel}` : ""}
          {user.school?.name ? ` · ${user.school.name}` : ""}
        </p>
      </div>
    </>
  );
}
