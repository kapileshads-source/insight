import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export const metadata = { title: "Sign in — Insight" };

export default function SignInPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <Link href="/" className="h3 text-[17px]">
        Insight
      </Link>

      <h1 className="h2 mt-8 text-3xl">Welcome back.</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
        You&rsquo;ll be asked for your passphrase after this to unlock your
        data.
      </p>

      <div className="mt-8">
        <SignIn />
      </div>
    </main>
  );
}
