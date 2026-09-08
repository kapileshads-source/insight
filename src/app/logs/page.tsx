import { redirect } from "next/navigation";

import { getOrCreateUser } from "@/lib/user";
import { AppNav, PageTitle } from "@/components/chrome";
import { StudyDataProvider } from "@/components/study-data";
import {
  DeviceReadout,
  WeekTrends,
  WellbeingNotes,
} from "@/components/study-panel";

export const metadata = { title: "Your log — Insight" };

/**
 * The record: what was logged, what the devices measured, and anything about
 * the student rather than the grade.
 *
 * Split off the dashboard because it is reference rather than action. Nobody
 * opens an app to read last week's totals several times a day, but they do
 * want them somewhere findable — and while they sat between the timer and the
 * findings they pushed both further down.
 */
export default async function LogsPage() {
  const user = await getOrCreateUser();
  if (!user) redirect("/sign-in");

  return (
    <>
      <AppNav email={user.email} />
      <StudyDataProvider>
        <div className="mx-auto w-full max-w-3xl flex-1 px-6 pb-32">
          <PageTitle
            eyebrow="History"
            title="Your log"
            lede="What you've logged, what your devices measured, and how the week compares to the one before it."
          />
          <div className="mt-10 space-y-6">
            <WeekTrends />
            <DeviceReadout />
            <WellbeingNotes />
          </div>
        </div>
      </StudyDataProvider>
    </>
  );
}
