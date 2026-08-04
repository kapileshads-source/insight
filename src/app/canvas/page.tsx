import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrCreateUser } from "@/lib/user";
import { getCanvasStatus } from "@/app/actions/canvas";
import { CanvasConnect } from "@/components/canvas-connect";

export const metadata = { title: "Canvas — Insight" };

export default async function CanvasPage() {
  const user = await getOrCreateUser();
  if (!user) redirect("/sign-in");

  const status = await getCanvasStatus();

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 pb-32">
      <header className="flex items-center justify-between border-b border-line py-6">
        <Link href="/dashboard" className="h3 text-[17px]">
          Insight
        </Link>
        <Link href="/settings" className="text-[14px] text-text-muted">
          Settings
        </Link>
      </header>

      <h1 className="h1 mt-12 text-[clamp(2rem,5vw,2.75rem)]">Canvas</h1>
      <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-text-muted">
        Connecting Canvas brings in your courses, due dates and grades, so you
        stop typing scores in by hand and insights have real outcomes to
        compare against.
      </p>

      <div className="mt-10">
        <CanvasConnect status={status} />
      </div>
    </div>
  );
}
