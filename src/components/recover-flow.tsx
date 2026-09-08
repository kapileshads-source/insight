"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useCrypto } from "@/components/crypto-provider";
import { RecoveryCodeScreen } from "@/components/recovery-code";
import { fetchEncryptionSetup, fetchRecoverySetup } from "@/app/actions/crypto";
import {
  resetEncryption,
  updateEncryptionSetup,
  updateRecoveryKey,
} from "@/app/actions/settings";
import {
  checkPassword,
  recoverWithKey,
  UnsupportedBrowserError,
  WrongRecoveryKeyError,
} from "@/lib/crypto";

/**
 * Forgetting the password.
 *
 * Two outcomes, and which one a student gets was decided months earlier, when
 * they either kept their recovery key or did not. This screen's job is to be
 * straight about that rather than to imply a third possibility — there is no
 * support address that can help, because there is nothing on the server that
 * opens the data.
 *
 * The order is deliberate. The recovery-key path is presented first and alone;
 * "start over" is behind a disclosure, because a student who has the key in a
 * drawer and is offered a one-click reset will take the reset.
 */
export function RecoverFlow() {
  const router = useRouter();
  const { adopt } = useCrypto();

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [newCode, setNewCode] = useState<string | null>(null);

  const [showReset, setShowReset] = useState(false);
  const [resetPhrase, setResetPhrase] = useState("");

  const strength = password ? checkPassword(password) : null;
  const matches = password.length > 0 && password === confirm;
  const ready = code.trim().length > 0 && Boolean(strength?.ok) && matches;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    start(async () => {
      try {
        const setup = await fetchEncryptionSetup();
        const recovery = await fetchRecoverySetup();
        if (!setup) {
          setError("There's no encryption set up on this account.");
          return;
        }
        if (!recovery) {
          setError(
            "This account doesn't have a recovery key — it was made before they existed, or one was never set up. Starting over is the only way forward.",
          );
          setShowReset(true);
          return;
        }

        const result = await recoverWithKey(code, password, setup, recovery);

        // Both writes, in order. The password wrapping first: if the second
        // fails, the student can still get in with their new password and the
        // old recovery key, which is recoverable. The other order leaves them
        // holding a key that opens nothing.
        const saved = await updateEncryptionSetup(result.setup);
        if (!saved.ok) {
          setError(saved.error);
          return;
        }
        await updateRecoveryKey(result.recovery);

        await adopt(result.dek, false);
        setNewCode(result.code);
      } catch (err) {
        setError(
          err instanceof WrongRecoveryKeyError
            ? "That recovery key doesn't match. Check for a mistyped character — the key never contains the letters I, L, O or U."
            : err instanceof UnsupportedBrowserError
              ? err.message
              : "Couldn't use that key. Check your connection and try again.",
        );
      }
    });
  }

  function doReset() {
    setError(null);
    start(async () => {
      const res = await resetEncryption(resetPhrase);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Back to onboarding, which will ask for a new password because there is
      // no longer a key on the account.
      router.push("/onboarding");
    });
  }

  // The new key, issued because using the old one retires it.
  if (newCode) {
    return (
      <RecoveryCodeScreen
        code={newCode}
        heading="You're back in — here's a new key"
        intro="Your password is changed and your data is intact. The key you just used has been retired, so this is your new one. Save it the same way."
        onDone={() => router.push("/dashboard")}
      />
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
      <Link href="/" className="h3 text-[17px]">
        Insight
      </Link>

      <h1 className="h1 mt-8 text-[clamp(1.9rem,5vw,2.4rem)]">
        Use your recovery key.
      </h1>
      <p className="mt-4 text-[17px] leading-relaxed text-text-muted">
        The 25-character key you were given when you set your password. It opens
        your data and lets you pick a new password — nothing is lost.
      </p>

      <form onSubmit={submit} className="mt-8">
        <label htmlFor="recovery-code" className="label text-text-muted">
          Recovery key
        </label>
        <input
          id="recovery-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
          className="figure mt-2 w-full rounded-md border border-line bg-bg px-4 py-3 text-[16px] uppercase"
        />
        <p className="mt-2 text-[13px] text-text-faint">
          Dashes and capitals don&rsquo;t matter.
        </p>

        <label
          htmlFor="new-password"
          className="label mt-7 block text-text-muted"
        >
          New password
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="four random words work well"
          className="mt-2 w-full rounded-md border border-line bg-bg px-4 py-3 text-[16px]"
        />
        {strength && (
          <p
            className={`mt-2 text-[14px] ${
              strength.score >= 2
                ? "text-up"
                : strength.ok
                  ? "text-text-muted"
                  : "text-down"
            }`}
          >
            {strength.message}
          </p>
        )}

        <label
          htmlFor="confirm-password"
          className="label mt-6 block text-text-muted"
        >
          Type it again
        </label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="mt-2 w-full rounded-md border border-line bg-bg px-4 py-3 text-[16px]"
        />
        {confirm.length > 0 && !matches && (
          <p className="mt-2 text-[14px] text-down">
            These don&rsquo;t match yet.
          </p>
        )}

        {error && (
          <p role="alert" className="mt-5 text-[15px] leading-relaxed text-down">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!ready || pending}
          className="btn-primary mt-7 px-7 py-3.5 text-[16px] disabled:opacity-50"
        >
          {pending ? "Checking…" : "Unlock and set a new password"}
        </button>
      </form>

      <div className="mt-12 border-t border-line pt-8">
        {!showReset ? (
          <button
            type="button"
            onClick={() => setShowReset(true)}
            className="text-[15px] text-text-muted underline underline-offset-4 hover:text-text"
          >
            I don&rsquo;t have my recovery key
          </button>
        ) : (
          <>
            <h2 className="h3 text-[17px]">Starting over</h2>
            {/* Specific about what is actually lost, because "your data" is
                both frightening and wrong. Most of what a student looks at
                every day comes back on the next sync. */}
            <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
              Without the key there is nothing anyone can do — we never had a
              copy of your password and cannot read your rows. The account can
              be reset with a new password, and what happens is:
            </p>
            <ul className="mt-4 space-y-2 text-[15px] leading-relaxed">
              <li className="text-text-muted">
                <span className="text-up">Comes back</span> — your classes,
                assignments, marks and transcript. Canvas and HAC still have
                them, so the next sync restores them.
              </li>
              <li className="text-text-muted">
                <span className="text-down">Gone for good</span> — your study
                sessions, sleep entries, the scores you typed in yourself, and
                every pattern worked out from them. Only Insight had those.
              </li>
            </ul>
            <p className="mt-4 text-[15px] leading-relaxed text-text-muted">
              Type <span className="text-text">start over</span> to confirm.
            </p>
            <input
              value={resetPhrase}
              onChange={(e) => setResetPhrase(e.target.value)}
              aria-label="Type start over to confirm"
              className="mt-3 w-full rounded-md border border-line bg-bg px-4 py-3 text-[16px]"
            />
            <button
              type="button"
              disabled={pending || resetPhrase.trim().toLowerCase() !== "start over"}
              onClick={doReset}
              className="mt-4 rounded-md border border-down/50 px-5 py-2.5 text-[15px] text-down disabled:opacity-40"
            >
              {pending ? "Resetting…" : "Reset and start over"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
