import Link from "next/link";
import { AppNav } from "@/components/chrome";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isIOS } from "@/lib/user-agent";
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

  return (
    <>
      <AppNav email={user.email} />

      <div className="mx-auto w-full max-w-3xl flex-1 px-6 pb-32 pt-8">

        {user.schoolId && <RightNow schoolId={user.schoolId} />}

        <RoutinePrompt />

        <GapPrompt />

        <FinishSetup
          hasCanvas={canvas.connected}
          // Any paired device counts. A student on a Mac who never installs the
          // extension has still done this, and nagging them for a checkbox they
          // deliberately skipped is how a checklist gets ignored entirely.
          hasExtension={devices.length > 0}
          hasBaseline={hasBaseline}
        />

        <StudyPanel
          isIOS={onIPhone}
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

        <CanvasAutoSync />
        <AssignmentsPanel />

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
