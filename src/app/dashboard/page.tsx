import Link from "next/link";
import { AppNav } from "@/components/chrome";
import { GradebookProvider } from "@/components/gradebook-data";
import { AssignmentsProvider } from "@/components/assignments-data";
import { SummaryTiles } from "@/components/summary-tiles";
import { redirect } from "next/navigation";
import { getOrCreateUser, nextOnboardingStep } from "@/lib/user";
import { getSchoolDayState } from "@/lib/current-period";
import { getCanvasStatus } from "@/app/actions/canvas";
import { listDevices } from "@/app/actions/devices";
import { hasProfile } from "@/app/actions/profile";
import { GapPrompt } from "@/components/gap-prompt";
import { RoutinePrompt } from "@/components/routine-prompt";
import { SuggestedThisWeek, WeekTrends } from "@/components/study-panel";
import { StudyDataProvider } from "@/components/study-data";

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

  return (
    <>
      <AppNav email={user.email} />

      {/* One decrypt of the gradebook for the whole screen. The GPA band at the
          top and the grades list further down are the same data seen twice, and
          before this each would have unwrapped every assignment row itself. */}
      <GradebookProvider>
        <StudyDataProvider>
        <AssignmentsProvider>
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

          {/* Things that interrupt: a question to answer, a gap to explain.
              First because they are asks, and an ask below a summary is an ask
              nobody answers. Both render nothing on an ordinary day. */}
          <div className="mt-6 empty:mt-0 space-y-6">
            <RoutinePrompt />
            <GapPrompt />
          </div>

          {/* The hub. One tile per page, each showing that page's headline
              number and linking to it.

              This screen used to carry the full grades list, the full
              assignments list, the week chart, the findings, the gathering
              list and the chat — everything the app knows, in one column,
              on the page opened twenty times a day. Now it answers "where am
              I" at a glance and every follow-up has one obvious destination. */}
          <div className="mt-6">
            <SummaryTiles />
          </div>

          {/* The week, because a trend is the one thing a tile cannot say. */}
          <div className="mt-6">
            <WeekTrends />
          </div>

          {/* One line of payoff, when there is a validated pattern to phrase.
              It stays on the dashboard because when it exists it is the most
              valuable sentence in the app, and it is one sentence. */}
          <div className="mt-6 empty:mt-0">
            <SuggestedThisWeek />
          </div>

          {/* Setup, last. It is finite, mostly done, and disappears when
              finished — a checklist above the content is how one gets ignored. */}
          <div className="mt-10">
            <FinishSetup
              hasCanvas={canvas.connected}
              // Any paired device counts. A student on a Mac who never installs
              // the extension has still done this.
              hasExtension={devices.length > 0}
              hasBaseline={hasBaseline}
            />
          </div>
        </div>
        </AssignmentsProvider>
        </StudyDataProvider>
      </GradebookProvider>
    </>
  );
}
