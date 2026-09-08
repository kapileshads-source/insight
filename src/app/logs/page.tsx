import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/user";
import { InsightProgress } from "@/components/insight-progress";
import { StatsChat } from "@/components/stats-chat";
import { GradebookProvider } from "@/components/gradebook-data";
import { AppNav, PageTitle } from "@/components/chrome";
import { StudyDataProvider } from "@/components/study-data";
import {
  DeviceReadout,
  WellbeingNotes,
  WhatWeAreSeeing,
} from "@/components/study-panel";

export const metadata = { title: "Insights — Insight" };

/**
 * Everything analytical, in one place.
 *
 * The findings, how close they are to being trustworthy, a chat about your own
 * numbers, what the devices measured, and anything about the student rather
 * than the grade.
 *
 * All of this was on the dashboard, and all of it is long: the "still
 * gathering" list is a row per untested factor, the chat is a panel with a
 * transcript in it, and the device readout runs to twelve rows. A screen a
 * student opens twenty times a day cannot also be the place the analysis
 * lives — it becomes a feed to scroll past, which is exactly what happened.
 *
 * The dashboard keeps one line: the phrased suggestion, when there is a
 * validated pattern to phrase. Everything behind that sentence is here.
 */
export default async function LogsPage() {
  const user = await getOrCreateUser();
  if (!user) redirect("/sign-in");

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
      <StudyDataProvider>
        <div className="mx-auto w-full max-w-3xl flex-1 px-6 pb-32">
          <PageTitle
            eyebrow="Your data"
            title="What we're seeing"
            lede="Patterns in your own logs, compared against your own averages — and how much more is needed before they mean anything."
          />
          <div className="mt-10 space-y-6">
            <InsightProgress sessions={sessionCount} outcomes={outcomeCount} />
            <WhatWeAreSeeing />
            {/* The chat needs the gradebook as well as the study log, so it
                brings its own provider rather than the page carrying one for
                a single consumer. */}
            <GradebookProvider>
              <StatsChat />
            </GradebookProvider>
            <DeviceReadout />
            <WellbeingNotes />
          </div>
        </div>
      </StudyDataProvider>
    </>
  );
}
