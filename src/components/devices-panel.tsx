"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pairDevice, revokeDevice, type DeviceRow } from "@/app/actions/devices";

const KIND_LABELS: Record<string, string> = {
  BROWSER_EXTENSION: "Browser extension",
  WINDOWS_APP: "Windows app",
  MACOS_APP: "Mac app",
  ANDROID_APP: "Android app",
};

export function DevicesPanel({
  devices,
  appUrl,
}: {
  devices: DeviceRow[];
  appUrl: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pair() {
    setError(null);
    setToken(null);
    setCopied(false);
    start(async () => {
      const res = await pairDevice("BROWSER_EXTENSION", "Browser extension");
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setToken(res.token ?? null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-line bg-surface p-6">
        <h2 className="h3 text-[17px]">Install the extension</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-text-muted">
          It records which sites you use while a session is running, and blocks
          distracting ones when Focus Mode is on. It does nothing at any other
          time.
        </p>

        <ol className="mt-5 space-y-3 text-[15px] leading-relaxed text-text-muted">
          <li>
            <span className="text-text">1.</span> Download the extension folder
            and unzip it somewhere you won&rsquo;t delete by accident.
          </li>
          <li>
            <span className="text-text">2.</span> Open{" "}
            <code className="rounded bg-bg px-1.5 py-0.5 text-[14px] text-text">
              chrome://extensions
            </code>{" "}
            and turn on <strong>Developer mode</strong>, top right.
          </li>
          <li>
            <span className="text-text">3.</span> Click{" "}
            <strong>Load unpacked</strong> and choose that folder.
          </li>
          <li>
            <span className="text-text">4.</span> Click the Insight icon in the
            toolbar and paste the code below.
          </li>
        </ol>

        <div className="mt-6 border-t border-line pt-5">
          <p className="text-[15px] text-text-muted">
            Insight address to paste:{" "}
            <code className="rounded bg-bg px-2 py-1 text-[14px] text-text">
              {appUrl}
            </code>
          </p>

          <button
            onClick={pair}
            disabled={pending}
            className="btn-primary mt-4 px-6 py-3 text-[15px] disabled:opacity-60"
          >
            {pending ? "Generating…" : "Generate a pairing code"}
          </button>

          {error && (
            <p role="alert" className="mt-3 text-[15px] text-down">
              {error}
            </p>
          )}

          {token && (
            <div className="mt-5 rounded-md border border-sky/30 bg-sky-soft p-4">
              <p className="text-[15px] text-text">
                Copy this now. It is shown once and never again.
              </p>
              <code className="mt-3 block overflow-x-auto rounded bg-bg px-3 py-2.5 text-[13px] break-all text-text">
                {token}
              </code>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(token);
                  setCopied(true);
                }}
                className="btn-secondary mt-3 px-4 py-2 text-[14px] text-text-muted"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <p className="mt-3 text-[13px] leading-relaxed text-text-faint">
                Only a hash of this is stored, which is why we can&rsquo;t show
                it to you again. Lost it? Generate another and revoke this one.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-surface p-6">
        <h2 className="h3 text-[17px]">Paired devices</h2>

        {devices.length === 0 ? (
          <p className="mt-3 text-[15px] text-text-muted">
            Nothing paired yet.
          </p>
        ) : (
          <div className="mt-4">
            {devices.map((d, i) => (
              <div
                key={d.id}
                className={`flex flex-wrap items-baseline justify-between gap-4 py-3.5 ${
                  i > 0 ? "border-t border-line" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="text-[15px]">
                    {KIND_LABELS[d.kind] ?? d.kind}
                  </div>
                  <div className="mt-0.5 text-[14px] text-text-faint">
                    {d.lastSeenAt
                      ? `Last seen ${new Date(d.lastSeenAt).toLocaleString()}`
                      : "Never used"}
                  </div>
                  {/* Open problem #6 from the plan: a device that quietly
                      stops reporting leaves a gap, and a gap read as "no
                      distraction" would skew the insights. */}
                  {d.silent && (
                    <div className="mt-1 text-[14px] text-butter">
                      Quiet for a few days. If you removed it, revoke it here so
                      the missing time is marked as missing rather than counted
                      as focused.
                    </div>
                  )}
                </div>
                <button
                  onClick={() =>
                    start(async () => {
                      await revokeDevice(d.id);
                      router.refresh();
                    })
                  }
                  disabled={pending}
                  className="btn-secondary shrink-0 px-4 py-2 text-[14px] text-text-muted disabled:opacity-60"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
