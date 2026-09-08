"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useCrypto } from "@/components/crypto-provider";
import { WrongPasswordError } from "@/lib/crypto";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      {children}
    </main>
  );
}

function UnlockScreen() {
  const { unlock } = useCrypto();
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        await unlock(password, remember);
      } catch (err) {
        // A wrong password is an expected, recoverable state. Reporting it as
        // one — rather than as a generic failure — is the difference between
        // "I mistyped" and "this app is broken".
        setError(
          err instanceof WrongPasswordError
            ? "That password doesn't match. Nothing is lost — try again."
            : "Couldn't unlock. Check your connection and try again.",
        );
        setPassword("");
      }
    });
  }

  return (
    <Shell>
      <Link href="/" className="h3 text-[17px]">
        Insight
      </Link>

      <h1 className="h1 mt-8 text-[clamp(2rem,5vw,2.5rem)]">
        Unlock your data.
      </h1>
      <p className="mt-4 text-[17px] leading-relaxed text-text-muted">
        Your sessions and grades are encrypted. We can&rsquo;t open them, so
        we have to ask you.
      </p>

      <form onSubmit={submit} className="mt-8">
        <label htmlFor="unlock-password" className="label text-text-muted">
          Password
        </label>
        <input
          id="unlock-password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-2 w-full rounded-md border border-line-hi bg-surface px-4 py-3 text-[16px] text-text focus:border-accent"
        />

        {error && (
          <p role="alert" className="mt-3 text-[15px] text-down">
            {error}
          </p>
        )}

        <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-[15px]">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="tick mt-0.5"
          />
          <span>
            Stay unlocked on this device
            <span className="mt-0.5 block text-[14px] text-text-faint">
              Don&rsquo;t use this on a school or shared computer — anyone who
              opens the browser after you would see your data.
            </span>
          </span>
        </label>

        <button
          type="submit"
          disabled={pending || password.length === 0}
          className="btn-primary mt-7 px-7 py-3.5 text-[16px] disabled:opacity-50"
        >
          {pending ? "Unlocking…" : "Unlock"}
        </button>
      </form>

      {/* The way out, which used to be a paragraph explaining that there
          wasn't one. There still is no reset in the ordinary sense — nothing
          here can be emailed to you — but a recovery key opens the same data,
          and a student staring at this screen needs the link, not the
          architecture lesson. */}
      <div className="mt-8 border-t border-line pt-5">
        <Link
          href="/recover"
          className="text-[15px] text-accent underline underline-offset-4"
        >
          Forgotten your password?
        </Link>
        <p className="mt-2 text-[14px] leading-relaxed text-text-faint">
          Your recovery key opens your data and lets you set a new password.
          There is no reset we can send you — the password never reaches us —
          so the key is the way back.
        </p>
      </div>
    </Shell>
  );
}

/// Renders children only once the data key is in memory.
///
/// Everything that touches encrypted data sits behind this, so no component
/// downstream has to handle a null key — being mounted is the guarantee.
export function UnlockGate({ children }: { children: React.ReactNode }) {
  const { status } = useCrypto();

  if (status === "checking") {
    // Says something rather than nothing. This waits on a network round trip,
    // not just an IndexedDB read, so on a slow connection a blank page is
    // indistinguishable from a broken one.
    return (
      <Shell>
        <p className="text-[17px] text-text-muted">Checking your device…</p>
      </Shell>
    );
  }

  if (status === "error") {
    return (
      <Shell>
        <h1 className="h1 text-[clamp(1.75rem,4.5vw,2.25rem)]">
          Couldn&rsquo;t reach the server.
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-text-muted">
          Your data is fine — this is a connection problem, not a lost key.
          Nothing has been changed or deleted.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="btn-primary mt-7 px-7 py-3.5 text-[16px]"
        >
          Try again
        </button>
      </Shell>
    );
  }

  if (status === "unsupported") {
    return (
      <Shell>
        <h1 className="h1 text-[clamp(1.75rem,4.5vw,2.25rem)]">
          This connection isn&rsquo;t secure enough.
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-text-muted">
          Insight encrypts your data in the browser, and browsers only allow
          that over a secure connection. Open Insight over https, or use
          localhost rather than an IP address.
        </p>
      </Shell>
    );
  }

  if (status === "no-setup") {
    return (
      <Shell>
        <h1 className="h1 text-[clamp(1.75rem,4.5vw,2.25rem)]">
          Finish setting up first.
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-text-muted">
          This account doesn&rsquo;t have a password for encryption yet.
        </p>
        <Link
          href="/onboarding"
          className="btn-primary mt-7 inline-block px-7 py-3.5 text-[16px]"
        >
          Continue setup
        </Link>
      </Shell>
    );
  }

  if (status === "locked") return <UnlockScreen />;

  return <>{children}</>;
}
