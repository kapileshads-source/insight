import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrCreateUser } from "@/lib/user";
import { getProfile } from "@/app/actions/profile";
import { BaselineForm } from "@/components/baseline-form";

export const metadata = { title: "Your usual week — Insight" };

export default async function BaselinePage() {
  const user = await getOrCreateUser();
  if (!user) redirect("/sign-in");

  const profile = await getProfile();

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

      <h1 className="h1 mt-12 text-[clamp(2rem,5vw,2.75rem)]">
        Your usual week
      </h1>
      <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-text-muted">
        Insight never compares you against a general target — there is no
        &ldquo;eight hours&rdquo; anywhere in it. Everything is measured against
        your own normal, and this is where you say what that is.
      </p>

      <div className="mt-10">
        <BaselineForm profile={profile} />
      </div>
    </div>
  );
}
