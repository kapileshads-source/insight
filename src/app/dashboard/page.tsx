import { redirect } from "next/navigation";
import { getOrCreateUser, nextOnboardingStep } from "@/lib/user";
import { getSchoolDayState } from "@/lib/current-period";
import { getRunningSession } from "@/app/actions/sessions";
import { StudyPanel } from "@/components/study-panel";

export const metadata = { title: "Insight" };

function formatDay(date: Date, timezone: string) {
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
            Next school day is{" "}
            {formatDay(state.nextSchoolDay, state.timezone)}.
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
function FinishSetup({ hasCanvas }: { hasCanvas: boolean }) {
  const items = [
    {
      title: "Connect Canvas",
      body: "Brings in your courses, due dates and grades.",
      done: hasCanvas,
    },
    {
      title: "Sleep and wake times",
      body: "The baseline every night gets measured against.",
      done: false,
    },
    {
      title: "Where you usually study",
      body: "Location and noise, so those can be compared later.",
      done: false,
    },
    {
      title: "Install the extension",
      body: "Tracks laptop time during a session, and powers Focus Mode.",
      done: false,
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
            {!item.done && (
              <button className="shrink-0 text-[14px] text-sky">Set up</button>
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

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 pb-32">
      <header className="flex items-center justify-between border-b border-line py-6">
        <span className="h3 text-[17px]">Insight</span>
        <span className="text-[14px] text-text-faint">
          {user.school?.name}
        </span>
      </header>

      {user.schoolId && <RightNow schoolId={user.schoolId} />}

      <FinishSetup hasCanvas={false} />

      <StudyPanel
        running={
          running
            ? { id: running.id, startedAt: running.startedAt.toISOString() }
            : null
        }
      />

      <p className="mt-12 text-[13px] text-text-faint">
        {formatDay(today, user.school?.timezone ?? "America/Chicago")}
        {user.gradeLevel ? ` · Grade ${user.gradeLevel}` : ""}
      </p>
    </div>
  );
}
