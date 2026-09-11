import { redirect } from "next/navigation";

import { getOrCreateUser } from "@/lib/user";
import { AppNav, PageTitle } from "@/components/chrome";
import { AssignmentsPanel } from "@/components/assignments-panel";
import { AssignmentsProvider } from "@/components/assignments-data";
import { GradesPanel } from "@/components/grades-panel";
import { GradebookProvider } from "@/components/gradebook-data";
import { CanvasAutoSync } from "@/components/canvas-auto-sync";
import { AssignmentPairing } from "@/components/assignment-pairing";
import { GradeOutcomes } from "@/components/grade-outcomes";

export const metadata = { title: "Work, Insight" };

/**
 * What is outstanding and what has been marked, together.
 *
 * These are two views of the same term: the work you have not handed in, and
 * the work that came back. They were the two longest things on the dashboard,
 * a group per due-date bucket and a card per class, which is what made a
 * screen meant for a glance into a screen you scroll.
 *
 * The dashboard now shows two numbers from this page and links here.
 */
export default async function WorkPage() {
  const user = await getOrCreateUser();
  if (!user) redirect("/sign-in");

  return (
    <>
      <AppNav email={user.email} />
      <GradebookProvider>
        <AssignmentsProvider>
          <div className="mx-auto w-full max-w-3xl flex-1 px-6 pb-32">
            <PageTitle
              eyebrow="This term"
              title="Your work"
              lede="What's still open, and what's come back marked. Both are read from Canvas and HAC and decrypted here in your browser."
            />

            {/* Draws nothing. Kept here because this is the page whose content
                the ten-minute Canvas pull actually refreshes. */}
            <CanvasAutoSync />

            <div className="mt-10 space-y-6">
              <AssignmentsPanel />
              <GradesPanel />
              <GradeOutcomes />
              <AssignmentPairing />
            </div>
          </div>
        </AssignmentsProvider>
      </GradebookProvider>
    </>
  );
}
