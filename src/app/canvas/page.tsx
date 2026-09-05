import { AppNav, PageTitle } from "@/components/chrome";
import { redirect } from "next/navigation";
import { getOrCreateUser } from "@/lib/user";
import { getCanvasStatus } from "@/app/actions/canvas";
import { CanvasConnect } from "@/components/canvas-connect";
import { HacSync } from "@/components/hac-sync";

export const metadata = { title: "Canvas — Insight" };

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

          <HacSync />
      </div>
      </div>
    </>
  );
}
