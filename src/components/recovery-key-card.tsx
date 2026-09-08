"use client";

import { useState, useTransition } from "react";

import { fetchEncryptionSetup } from "@/app/actions/crypto";
import { updateRecoveryKey } from "@/app/actions/settings";
import { RecoveryCodeScreen } from "@/components/recovery-code";
import { createRecoveryKey, WrongPasswordError } from "@/lib/crypto";

/**
 * Issuing a recovery key from settings.
 *
 * Two audiences, one card. Accounts made before recovery existed have no key
 * at all and are one forgotten password away from losing their study log —
 * they get a prompt that says so. Accounts that have one get a quieter offer
 * to replace it, which is what a student wants after losing the paper or
 * sharing the code by accident.
 *
 * The password is required either way, and not as a confirmation step: the
 * data key is non-extractable once unlocked, so the only way to wrap a second
 * copy of it is to unwrap the first one from the password again.
 */
export function RecoveryKeyCard({
  exists,
  createdAt,
}: {
  exists: boolean;
  createdAt: string | null;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function issue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    start(async () => {
      try {
        const setup = await fetchEncryptionSetup();
        if (!setup) {
          setError("There's no encryption set up on this account.");
          return;
        }

        const { code, recovery } = await createRecoveryKey(password, setup);
        const res = await updateRecoveryKey(recovery);
        if (!res.ok) {
          setError(res.error);
          return;
        }

        setPassword("");
        setCode(code);
      } catch (err) {
        setError(
          err instanceof WrongPasswordError
            ? "That password isn't right."
            : "Couldn't make a recovery key just now.",
        );
      }
    });
  }

  if (code) {
    return (
      <RecoveryCodeScreen
        code={code}
        heading={exists ? "Your new recovery key" : "Your recovery key"}
        intro={
          exists
            ? "This replaces your old key, which no longer works. Save it and throw the old one away."
            : "This is the only way back into your data if you forget your password. Save it now — we cannot show it again, and we do not have a copy."
        }
        onDone={() => setCode(null)}
      />
    );
  }

  return (
    <section
      className={`rounded-lg border p-6 ${
        exists ? "border-line bg-surface" : "border-alert/40 bg-alert/8"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="h3 text-[17px]">Recovery key</h2>
        {exists && createdAt && (
          <span className="label text-text-faint">
            Issued {new Date(createdAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {exists ? (
        <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-text-muted">
          You have one. If you have lost it, or it ended up somewhere you
          didn&rsquo;t mean it to, make a new one — the old key stops working
          the moment you do.
        </p>
      ) : (
        <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-text-muted">
          This account doesn&rsquo;t have one. Your password is currently the
          only thing that opens your data, and we have no copy of it — so if you
          forget it, your study log is gone. A recovery key fixes that, and
          takes a minute.
        </p>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            exists
              ? "mt-4 text-[15px] text-accent underline underline-offset-4"
              : "btn-primary mt-5 px-6 py-3 text-[15px]"
          }
        >
          {exists ? "Make a new one" : "Make a recovery key"}
        </button>
      ) : (
        <form onSubmit={issue} className="mt-5 max-w-sm">
          <label htmlFor="recovery-pw" className="label text-text-muted">
            Your Insight password
          </label>
          <input
            id="recovery-pw"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full rounded-md border border-line bg-bg px-4 py-3 text-[16px]"
          />
          <p className="mt-2 text-[13px] leading-relaxed text-text-faint">
            Needed because the key is built in your browser from your password.
            It isn&rsquo;t sent anywhere.
          </p>

          {error && (
            <p role="alert" className="mt-4 text-[15px] text-down">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending || password.length === 0}
            className="btn-primary mt-5 px-6 py-3 text-[15px] disabled:opacity-50"
          >
            {pending ? "Making it…" : "Make the key"}
          </button>
        </form>
      )}
    </section>
  );
}
