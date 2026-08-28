"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCrypto } from "@/components/crypto-provider";
import {
  connectCanvas,
  pullCanvas,
  storeCanvasData,
  type CanvasStatus,
} from "@/app/actions/canvas";

const FIELD =
  "w-full rounded-md border border-line-hi bg-bg px-4 py-3 text-[16px] text-text focus:border-sky";

export function CanvasConnect({ status }: { status: CanvasStatus }) {
  const router = useRouter();
  const { conceal, status: cryptoStatus } = useCrypto();
  const [result, action, connecting] = useActionState(connectCanvas, null);
  const [syncing, startSync] = useTransition();
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  /// Pull, encrypt here, push the ciphertext back. The server reads Canvas but
  /// can't encrypt for this student, so the data makes a round trip through
  /// the browser rather than being written where it was fetched.
  function sync() {
    setSyncNote(null);
    setSyncError(null);

    startSync(async () => {
      const pulled = await pullCanvas();
      if (!pulled.ok) {
        setSyncError(pulled.error);
        router.refresh();
        return;
      }

      try {
        const courses = await Promise.all(
          pulled.data.courses.map(async (c) => ({
            canvasId: c.canvasId,
            payload: await conceal({ name: c.name, shortName: c.shortName }),
          })),
        );

        const assignments = await Promise.all(
          pulled.data.assignments.map(async (a) => ({
            canvasId: a.canvasId,
            courseCanvasId: a.courseCanvasId,
            dueAt: a.dueAt,
            payload: await conceal({
              name: a.name,
              pointsPossible: a.pointsPossible,
              state: a.state,
              score: a.score,
              assignedOn: a.assignedOn,
            }),
          })),
        );

        const stored = await storeCanvasData({ courses, assignments });
        if (!stored.ok) {
          setSyncError(stored.error);
          return;
        }

        setSyncNote(
          `Synced ${courses.length} courses and ${assignments.length} assignments.`,
        );
        router.refresh();
      } catch {
        setSyncError("Couldn't encrypt what came back. Nothing was saved.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {status.connected && (
        <section className="rounded-lg border border-line bg-surface p-6">
          <h2 className="h3 text-[17px]">Connected</h2>

          {status.disconnected && (
            <p className="mt-3 text-[15px] leading-relaxed text-down">
              Your token stopped working — Canvas expires them every 90 days.
              Paste a new one below. The time since it died is recorded as
              missing data, not as a week where nothing was due.
            </p>
          )}

          {!status.disconnected &&
            status.daysUntilExpiry !== null &&
            status.daysUntilExpiry <= 14 && (
              <p className="mt-3 text-[15px] text-butter">
                Expires in {status.daysUntilExpiry} days. Worth replacing it
                now rather than during exam week.
              </p>
            )}

          <p className="mt-3 text-[15px] text-text-muted">
            {status.lastSyncedAt
              ? `Last synced ${new Date(status.lastSyncedAt).toLocaleString()}`
              : "Not synced yet."}
          </p>

          <button
            onClick={sync}
            disabled={syncing || cryptoStatus !== "unlocked"}
            className="btn-primary mt-5 px-6 py-3 text-[15px] disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>

          {cryptoStatus !== "unlocked" && (
            <p className="mt-3 text-[14px] text-text-faint">
              Unlock first — the sync has to be encrypted on this device before
              it can be saved.
            </p>
          )}

          {syncNote && <p className="mt-4 text-[15px] text-up">{syncNote}</p>}
          {syncError && (
            <p role="alert" className="mt-4 text-[15px] text-down">
              {syncError}
            </p>
          )}
        </section>
      )}

      <section className="rounded-lg border border-line bg-surface p-6">
        <h2 className="h3 text-[17px]">
          {status.connected ? "Replace your token" : "Connect Canvas"}
        </h2>

        <ol className="mt-4 space-y-3 text-[15px] leading-relaxed text-text-muted">
          <li>
            <span className="text-text">1.</span> Open Canvas and go to Account
            → Settings.
          </li>
          <li>
            <span className="text-text">2.</span> Scroll to Approved
            Integrations and click <strong>+ New Access Token</strong>.
          </li>
          <li>
            <span className="text-text">3.</span> Put &ldquo;Insight&rdquo; as
            the purpose, and set the expiry date as far ahead as Canvas lets
            you — FISD caps it at 90 days.
          </li>
          <li>
            <span className="text-text">4.</span> Copy the token. Canvas shows
            it once and never again.
          </li>
        </ol>

        <form action={action} className="mt-6 space-y-4">
          <div>
            <label htmlFor="token" className="label text-text-muted">
              Token
            </label>
            <input
              id="token"
              name="token"
              type="password"
              autoComplete="off"
              required
              className={`${FIELD} mt-2`}
            />
          </div>
          <div>
            <label htmlFor="expiresOn" className="label text-text-muted">
              Expiry date Canvas gave you
            </label>
            <input
              id="expiresOn"
              name="expiresOn"
              type="date"
              className={`${FIELD} mt-2`}
            />
            <p className="mt-2 text-[14px] leading-relaxed text-text-faint">
              Optional, but it&rsquo;s how we warn you before it dies instead of
              after.
            </p>
          </div>

          {result && !result.ok && (
            <p role="alert" className="text-[15px] text-down">
              {result.error}
            </p>
          )}
          {result?.ok && (
            <p className="text-[15px] text-up">
              Connected. Hit sync above to pull everything in.
            </p>
          )}

          <button
            type="submit"
            disabled={connecting}
            className="btn-primary px-6 py-3 text-[15px] disabled:opacity-60"
          >
            {connecting ? "Checking…" : "Connect"}
          </button>
        </form>

        <p className="mt-6 border-t border-line pt-5 text-[14px] leading-relaxed text-text-faint">
          This token is the one thing of yours our server can read, because it
          has to call Canvas for you. Everything it brings back is encrypted on
          this device before it&rsquo;s stored. Said plainly on the privacy
          page too.
        </p>
      </section>
    </div>
  );
}
