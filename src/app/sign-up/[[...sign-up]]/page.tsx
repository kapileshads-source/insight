import { SignUp } from "@clerk/nextjs";
import { SiteNav } from "@/components/chrome";
import Link from "next/link";

export const metadata = { title: "Sign up, Insight" };

export default function SignUpPage() {
  return (
    <main className="flex-1">
      <SiteNav />

      <div className="mx-auto flex w-full max-w-md flex-col px-6 py-16">
        <h1 className="h1 text-[clamp(2rem,5vw,2.6rem)]">Make an account.</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-text-muted">
          A few questions after this, then you&rsquo;re in. It takes about two minutes.
        </p>

        <div className="mt-8">
          <SignUp />
        </div>

      <p className="mt-8 text-[13px] leading-relaxed text-text-faint">
        By making an account you agree to how we handle your data, which is
        written out in plain language on the{" "}
        <Link href="/privacy" className="text-accent underline underline-offset-2">
          privacy page
        </Link>
        .
      </p>
      </div>
    </main>
  );
}
