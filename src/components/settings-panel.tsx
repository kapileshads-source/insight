"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCrypto } from "@/components/crypto-provider";
import {
  changePassword,
  checkPassword,
  WrongPasswordError,
} from "@/lib/crypto";
import { fetchEncryptionSetup } from "@/app/actions/crypto";
import {
  deleteAccount,
  disconnectCanvas,
  exportEverything,
  setCategoryMuted,
  updateEncryptionSetup,
} from "@/app/actions/settings";
import type { CanvasStatus } from "@/app/actions/canvas";

const FIELD =
  "w-full rounded-md border border-line-hi bg-bg px-4 py-3 text-[16px] text-text focus:border-accent";

const CATEGORIES = [
  { id: "SLEEP", label: "Sleep" },
  { id: "STUDY_TIMING", label: "When you study" },
  { id: "SESSION_LENGTH", label: "How long you study" },
  { id: "LOCATION", label: "Where you study" },
  { id: "NOISE", label: "Noise" },
  { id: "PHONE_USAGE", label: "Phone use" },
] as const;

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface p-6">
      <h2 className="h3 text-[17px]">{title}</h2>
      {description && (
        <p className="mt-2 text-[15px] leading-relaxed text-text-muted">
          {description}
        </p>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function SettingsPanel({
  muted,
  canvas,
}: {
  muted: string[];
  canvas: CanvasStatus;
}) {
  const router = useRouter();
  const { lock } = useCrypto();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [mutedSet, setMutedSet] = useState(new Set(muted));
  const [confirmDelete, setConfirmDelete] = useState("");

  const strength = next ? checkPassword(next) : null;

  function changePw(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNote(null);

    if (next !== confirmPw) {
      setError("The new passwords don't match.");
      return;
    }
    if (!strength?.ok) {
      setError(strength?.message ?? "Pick a longer password.");
      return;
    }

    startTransition(async () => {
      try {
        const setup = await fetchEncryptionSetup();
        if (!setup) {
          setError("No encryption set up on this account.");
          return;
        }

        // Re-wraps the same data key. Not one stored row is rewritten, which
        // is why this is instant even after a year of logging.
        const updated = await changePassword(current, next, setup);
        const res = await updateEncryptionSetup(updated);
        if (!res.ok) {
          setError(res.error);
          return;
        }

        setCurrent("");
        setNext("");
        setConfirmPw("");
        setNote("Password changed. Your data didn't need re-encrypting.");
      } catch (err) {
        setError(
          err instanceof WrongPasswordError
            ? "That current password isn't right."
            : "Couldn't change the password.",
        );
      }
    });
  }

  function toggleMute(id: string) {
    const nowMuted = !mutedSet.has(id);
    const copy = new Set(mutedSet);
    if (nowMuted) copy.add(id);
    else copy.delete(id);
    setMutedSet(copy);
    startTransition(async () => {
      await setCategoryMuted(id, nowMuted);
    });
  }

  function doExport() {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const data = await exportEverything();
      if (!data) {
        setError("Couldn't build the export.");
        return;
      }
      // Written from the browser, since it's the only place the contents can
      // be read. The file contains the ciphertext exactly as stored.
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `insight-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNote("Downloaded.");
    });
  }

  function doDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteAccount(confirmDelete);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await lock();
      router.push("/");
    });
  }

  return (
    <div className="space-y-6">
      <Card
        title="Lock this device"
        description="Forgets your password on this browser. You'll be asked for it next time. Worth doing on a school or shared computer."
      >
        <button
          onClick={() =>
            startTransition(async () => {
              await lock();
              router.refresh();
            })
          }
          disabled={pending}
          className="btn-secondary px-5 py-2.5 text-[15px] text-text-muted disabled:opacity-60"
        >
          Lock now
        </button>
      </Card>

      <Card
        title="Change your password"
        description="Only the key gets re-wrapped, so nothing you've logged has to be re-encrypted. Forgetting the new one has the same consequence as before."
      >
        <form onSubmit={changePw} className="space-y-4">
          <div>
            <label htmlFor="current-pw" className="label text-text-muted">
              Current password
            </label>
            <input
              id="current-pw"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={`${FIELD} mt-2`}
            />
          </div>
          <div>
            <label htmlFor="new-pw" className="label text-text-muted">
              New password
            </label>
            <input
              id="new-pw"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className={`${FIELD} mt-2`}
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
          </div>
          <div>
            <label htmlFor="confirm-pw" className="label text-text-muted">
              Type it again
            </label>
            <input
              id="confirm-pw"
              type="password"
              autoComplete="new-password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className={`${FIELD} mt-2`}
            />
          </div>
          <button
            type="submit"
            disabled={pending || !current || !next}
            className="btn-primary px-6 py-3 text-[15px] disabled:opacity-50"
          >
            {pending ? "Changing…" : "Change password"}
          </button>
        </form>
      </Card>

      <Card
        title="Canvas"
        description={
          canvas.connected
            ? "Brings in your courses, due dates and grades."
            : "Not connected. Without it you enter scores by hand."
        }
      >
        {canvas.connected ? (
          <div className="space-y-3">
            {canvas.disconnected && (
              <p className="text-[15px] text-down">
                Your token stopped working. Reconnect to resume, nothing is
                lost, but the time since then is marked as missing rather than
                counted as a quiet week.
              </p>
            )}
            {canvas.daysUntilExpiry !== null &&
              canvas.daysUntilExpiry <= 14 &&
              !canvas.disconnected && (
                <p className="text-[15px] text-alert">
                  Your token expires in {canvas.daysUntilExpiry} days. Canvas
                  caps them at 90.
                </p>
              )}
            <p className="text-[15px] text-text-muted">
              {canvas.lastSyncedAt
                ? `Last synced ${new Date(canvas.lastSyncedAt).toLocaleString()}`
                : "Not synced yet."}
            </p>
            <button
              onClick={() =>
                startTransition(async () => {
                  await disconnectCanvas();
                  router.refresh();
                })
              }
              disabled={pending}
              className="btn-secondary px-5 py-2.5 text-[15px] text-text-muted disabled:opacity-60"
            >
              Disconnect Canvas
            </button>
          </div>
        ) : (
          <a
            href="/canvas"
            className="btn-primary inline-block px-6 py-3 text-[15px]"
          >
            Connect Canvas
          </a>
        )}
      </Card>

      <Card
        title="Mute insights"
        description="Turn off any category you'd rather not see. Muting stops it being shown, and the data behind it stays yours either way."
      >
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const isMuted = mutedSet.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggleMute(c.id)}
                disabled={pending}
                className={`rounded-md border px-4 py-2 text-[15px] ${
                  isMuted
                    ? "border-line-hi text-text-faint line-through"
                    : "border-accent bg-accent text-on-light"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </Card>

      <Card
        title="Export everything"
        description="A file with everything we hold. Your entries are encrypted in it, exactly as they are on our server."
      >
        <button
          onClick={doExport}
          disabled={pending}
          className="btn-secondary px-5 py-2.5 text-[15px] text-text-muted disabled:opacity-60"
        >
          {pending ? "Building…" : "Download my data"}
        </button>
      </Card>

      <Card
        title="Delete your account"
        description="Everything goes: sessions, sleep, scores, the lot. There is no undo and no copy kept."
      >
        <label htmlFor="confirm-delete" className="label text-text-muted">
          Type <span className="text-text">delete everything</span> to confirm
        </label>
        <input
          id="confirm-delete"
          value={confirmDelete}
          onChange={(e) => setConfirmDelete(e.target.value)}
          className={`${FIELD} mt-2`}
        />
        <button
          onClick={doDelete}
          disabled={
            pending || confirmDelete.trim().toLowerCase() !== "delete everything"
          }
          className="mt-4 rounded-md border border-down px-5 py-2.5 text-[15px] font-semibold text-down disabled:opacity-40"
        >
          {pending ? "Deleting…" : "Delete my account"}
        </button>
      </Card>

      {note && <p className="text-[15px] text-up">{note}</p>}
      {error && (
        <p role="alert" className="text-[15px] text-down">
          {error}
        </p>
      )}
    </div>
  );
}
