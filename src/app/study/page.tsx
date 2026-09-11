import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { getOrCreateUser } from "@/lib/user";
import { getRunningSession } from "@/app/actions/sessions";
import { isIOS } from "@/lib/user-agent";
import { AppNav, PageTitle } from "@/components/chrome";
import { StudyDataProvider } from "@/components/study-data";
import { SessionControls, StudyStats } from "@/components/study-panel";

export const metadata = { title: "Study, Insight" };

/**
 * Starting a session, on a page of its own.
 *
 * The timer used to sit partway down the dashboard, below what's due and above
 * a setup checklist. It is the one thing in this app a student does
 * deliberately, they sit down, they mean to work, they press it, and a
 * deliberate action deserves a screen rather than a slot in a feed.
 *
 * The four figures underneath are here because they answer the question you
 * actually have while starting: how much have I already done this week.
 */
export default async function StudyPage() {
  const user = await getOrCreateUser();
  if (!user) redirect("/sign-in");

  const running = await getRunningSession();
  const onIPhone = isIOS((await headers()).get("user-agent"));

  return (
    <>
      <AppNav email={user.email} />
      <StudyDataProvider>
        <div className="mx-auto w-full max-w-3xl flex-1 px-6 pb-32">
          <PageTitle
            eyebrow="Focus"
            title={running ? "You're studying." : "Start studying."}
            lede={
              running
                ? "The timer is running. Stop it when you're done and Insight will ask how it went."
                : "Press start when you sit down. Insight measures the session rather than asking you to remember it."
            }
          />
          <div className="mt-10 space-y-14">
            {/* A Date cannot cross into a client component, so the instant
                goes as an ISO string. */}
            <SessionControls
              running={
                running
                  ? {
                      id: running.id,
                      startedAt: running.startedAt.toISOString(),
                      focusModeActive: running.focusModeActive,
                    }
                  : null
              }
              isIOS={onIPhone}
            />
            <StudyStats />
          </div>
        </div>
      </StudyDataProvider>
    </>
  );
}
