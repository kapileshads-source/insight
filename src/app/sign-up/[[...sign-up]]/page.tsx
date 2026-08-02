import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

export const metadata = { title: "Sign up — Insight" };

export default function SignUpPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <Link href="/" className="h3 text-[17px]">
        Insight
      </Link>

      <h1 className="h2 mt-8 text-3xl">Make an account.</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
        A few questions after this, then you&rsquo;re in. It takes about two
        minutes.
      </p>

      <div className="mt-8">
        <SignUp />
      </div>

      <p className="mt-8 text-[13px] leading-relaxed text-text-faint">
        By making an account you agree to how we handle your data, which is
        written out in plain language on the{" "}
        <Link href="/privacy" className="text-sky underline underline-offset-2">
          privacy page
        </Link>
        .
      </p>
    </main>
  );
}
