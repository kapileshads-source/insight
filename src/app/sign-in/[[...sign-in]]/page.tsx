import { SignIn } from "@clerk/nextjs";
import { SiteNav } from "@/components/chrome";

export const metadata = { title: "Sign in — Insight" };

export default function SignInPage() {
  return (
    <main className="flex-1">
      <SiteNav />

      <div className="mx-auto flex w-full max-w-md flex-col px-6 py-16">
        <h1 className="h1 text-[clamp(2rem,5vw,2.6rem)]">Welcome back.</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-text-muted">
          You&rsquo;ll be asked for your password after this to unlock your data.
        </p>

        <div className="mt-8">
          <SignIn />
        </div>
      </div>
    </main>
  );
}
