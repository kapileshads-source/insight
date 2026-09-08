import { redirect } from "next/navigation";

import { getOrCreateUser } from "@/lib/user";
import { AppNav, PageTitle } from "@/components/chrome";
import { GradebookProvider } from "@/components/gradebook-data";
import { GpaWorkings } from "@/components/gpa-workings";

export const metadata = { title: "GPA — Insight" };

/**
 * The GPA, with its working shown.
 *
 * Split off the dashboard because the card there had grown to carry the two
 * figures, a paragraph of caveats, a list of which classes count, a box per
 * class for trying a different grade, and a note about anything reading 0%.
 * Every line of that is true and worth saying once. None of it is worth
 * reading on the screen you open twenty times a week, and together they made
 * the first thing on the dashboard the densest thing on it.
 *
 * So the dashboard answers the question and this page shows the arithmetic.
 */
export default async function GpaPage() {
  const user = await getOrCreateUser();
  if (!user) redirect("/sign-in");

  return (
    <>
      <AppNav email={user.email} />
      <GradebookProvider>
        <div className="mx-auto w-full max-w-3xl flex-1 px-6 pb-32">
          <PageTitle
            eyebrow="Grades"
            title="Your GPA"
            lede="Where you stand today, what would change it, and how the number is put together."
          />
          <div className="mt-10">
            <GpaWorkings />
          </div>
        </div>
      </GradebookProvider>
    </>
  );
}
