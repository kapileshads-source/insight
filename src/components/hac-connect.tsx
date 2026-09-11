"use client";

import { useState, useTransition } from "react";

import {
  connectHac,
  disconnectHac,
} from "@/app/actions/hac";

/**
 * Signing into HAC with a username and password.
 *
 * **This is now the only path.** The extension used to read the same gradebook
 * using the session a student already had, without ever seeing a password,
 * which was strictly better, but it only worked on desktop Chrome, and
 * keeping two fetch paths meant finding every HAC bug twice. What is left is
 * the one that works on a phone, at the cost of holding the password.
 *
 * The honesty here is the feature. A student is about to hand over the password
 * that is probably also behind their school email, so this says plainly what is
 * stored, what we can see, and how to undo it, before the fields, not after.
 * Anything less and the app is asking for a credential on the strength of a
 * privacy page it is quietly contradicting.
 */
export function HacConnect({
  connected,
  username,
  disconnected,
}: {
  connected: boolean;
  username: string | null;
  disconnected: boolean;
}) {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const result = await connectHac({ username: user, password });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Cleared on success as well as on failure. There is no reason for a
      // password to sit in a React state tree after it has been stored.
      setPassword("");
      setUser("");
    });
  }

  // Only a *working* connection hides the form. A password that has stopped
  // working needs replacing, and the first draft said "reconnect below" above
  // a card with no fields under it, a dead end, and the exact moment a
  // student most needs the form.
  if (connected && !disconnected) {
    return (
      <section className="panel mt-6 px-7 py-6">
        <h2 className="h3 text-[17px]">HAC is connected</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
          Signed in as {username}. Your grades update on any device, including
          your phone.
        </p>

        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => void (await disconnectHac()))}
          className="mt-4 text-[14px] text-text-faint underline underline-offset-4 hover:text-text-muted disabled:opacity-50"
        >
          {pending ? "One moment…" : "Disconnect and delete the password"}
        </button>
      </section>
    );
  }

  return (
    <section className="panel mt-6 px-7 py-6">
      <h2 className="h3 text-[17px]">
        {disconnected ? "HAC needs signing in again" : "Sign in to HAC"}
      </h2>

      <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-text-muted">
        {disconnected
          ? `The saved password for ${username} stopped working, most likely you changed it. Sign in again and grades start updating.`
          : "This is how Insight reads your real grades, the ones your school posts, rather than what Canvas happens to hold."}
      </p>

      {/* Said before the fields, not after. A student is about to hand over the
          password that is probably also behind their school email. */}
      {!disconnected && (
      <div className="mt-5 rounded-md bg-accent-soft px-5 py-4">
        <p className="text-[14px] leading-relaxed text-text-muted">
          Be clear on the trade: your HAC password is stored, encrypted, so we
          can fetch your gradebook when you&rsquo;re not looking.{" "}
          <span className="text-text">
            That means Insight can read your gradebook
          </span>{" "}
         , the only part of the app where that is true. Everything else stays
          encrypted with a key we don&rsquo;t have.
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-text-muted">
          It is never put in a web address or written to a log, and
          disconnecting deletes it. If your HAC password is the same as your
          school email password, change one of them first.
        </p>
      </div>
      )}

      <form onSubmit={submit} className="mt-6 max-w-sm">
        <label htmlFor="hac-user" className="label text-text-muted">
          HAC username
        </label>
        <input
          id="hac-user"
          name="hac-user"
          autoComplete="username"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-line bg-bg px-3.5 py-2.5 text-[15px]"
        />

        <label htmlFor="hac-pass" className="label mt-4 block text-text-muted">
          HAC password
        </label>
        <input
          id="hac-pass"
          name="hac-pass"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-line bg-bg px-3.5 py-2.5 text-[15px]"
        />

        {error && (
          <p className="mt-4 text-[14px] leading-relaxed text-alert">{error}</p>
        )}

        <button
          type="submit"
          disabled={pending || !user || !password}
          className="btn-primary mt-5 px-6 py-3 text-[15px] disabled:opacity-50"
        >
          {pending ? "Checking…" : "Connect HAC"}
        </button>
      </form>

      <p className="mt-4 text-[13px] leading-relaxed text-text-faint">
        Nothing is saved until the sign-in works, so a typo is never stored.
      </p>
    </section>
  );
}
