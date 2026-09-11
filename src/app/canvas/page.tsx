import { AppNav, PageTitle } from "@/components/chrome";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrCreateUser } from "@/lib/user";
import { getCanvasStatus } from "@/app/actions/canvas";
import { CanvasConnect } from "@/components/canvas-connect";

export const metadata = { title: "Canvas, Insight" };

export default async function CanvasPage() {
  const user = await getOrCreateUser();
  if (!user) redirect("/sign-in");

  const status = await getCanvasStatus();

  return (
    <>
      <AppNav email={user.email} />

      <div className="mx-auto w-full max-w-3xl flex-1 px-6 pb-32">
        <PageTitle
          eyebrow="Gradebooks"
          title="Canvas"
          lede="Connecting Canvas brings in your courses, due dates and grades, so you stop typing scores in by hand and insights have real outcomes to compare against."
        />

        <div className="mt-10">
          <CanvasConnect status={status} />
          {/* HAC has its own page. It is a different gradebook from a
              different vendor, and burying it under a page named after Canvas
              is why the credential option went unseen. */}
          <p className="mt-8 text-[15px] leading-relaxed text-text-muted">
            Your posted grades live in{" "}
            <Link href="/hac" className="text-accent underline underline-offset-2">
              Home Access Center
            </Link>
            , which Insight reads separately.
          </p>
      </div>
      </div>
    </>
  );
}
