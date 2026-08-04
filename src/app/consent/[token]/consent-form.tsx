"use client";

import { useState, useTransition } from "react";
import { confirmConsent, revokeConsent } from "./actions";

export function ConsentForm({
  token,
  childEmail,
  alreadyConfirmed,
}: {
  token: string;
  childEmail: string;
  alreadyConfirmed: boolean;
}) {
  const [state, setState] = useState<"idle" | "granted" | "withdrawn">(
    alreadyConfirmed ? "granted" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function act(fn: (t: string) => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn(token);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      setState(fn === confirmConsent ? "granted" : "withdrawn");
    });
  }

  if (state === "granted") {
    return (
      <div className="mt-10 rounded-lg border border-line bg-surface p-6">
        <h2 className="h3 text-[19px] text-up">Permission given.</h2>
        <p className="mt-3 text-[17px] leading-relaxed text-text-muted">
          {childEmail} can now use Insight. They&rsquo;ll be able to continue
          setting up straight away.
        </p>
        <p className="mt-4 text-[15px] leading-relaxed text-text-faint">
          Keep this email. The same link withdraws permission at any time, and
          doing so closes the account and erases the data.
        </p>
        <button
          onClick={() => act(revokeConsent)}
          disabled={pending}
          className="btn-secondary mt-5 px-5 py-2.5 text-[15px] text-text-muted disabled:opacity-60"
        >
          {pending ? "Withdrawing…" : "Withdraw permission"}
        </button>
        {error && (
          <p role="alert" className="mt-3 text-[15px] text-down">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (state === "withdrawn") {
    return (
      <div className="mt-10 rounded-lg border border-line bg-surface p-6">
        <h2 className="h3 text-[19px]">Permission withdrawn.</h2>
        <p className="mt-3 text-[17px] leading-relaxed text-text-muted">
          {childEmail} can no longer use Insight, and their data is being
          deleted. You can give permission again from this same link if you
          change your mind.
        </p>
        <button
          onClick={() => act(confirmConsent)}
          disabled={pending}
          className="btn-secondary mt-5 px-5 py-2.5 text-[15px] text-text-muted disabled:opacity-60"
        >
          {pending ? "Saving…" : "Give permission again"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-10">
      <button
        onClick={() => act(confirmConsent)}
        disabled={pending}
        className="btn-primary px-8 py-4 text-[17px] disabled:opacity-60"
      >
        {pending ? "Saving…" : "Yes, they can use Insight"}
      </button>
      {error && (
        <p role="alert" className="mt-4 text-[15px] text-down">
          {error}
        </p>
      )}
      <p className="mt-5 text-[15px] leading-relaxed text-text-faint">
        Doing nothing is also an answer. Without your permission the account
        stays empty and nothing about your child is collected.
      </p>
    </div>
  );
}
