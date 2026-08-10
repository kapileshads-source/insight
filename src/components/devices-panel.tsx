"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pairDevice, revokeDevice, type DeviceRow } from "@/app/actions/devices";
import { fetchEncryptionSetup } from "@/app/actions/crypto";
import { encodePhonePairing } from "@/lib/pairing";

const KIND_LABELS: Record<string, string> = {
  BROWSER_EXTENSION: "Browser extension",
  WINDOWS_APP: "Windows app",
  MACOS_APP: "Mac app",
  ANDROID_APP: "Android app",
};

/// A pairing code, and which section asked for it.
///
/// Tracked together because two sections can both mint one, and a code that
/// appears under the wrong heading is a code pasted into the wrong app — which
/// fails in the most confusing way available: it works.
type Minted = { kind: string; token: string };

export function DevicesPanel({
  devices,
  appUrl,
}: {
  devices: DeviceRow[];
  appUrl: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [minted, setMinted] = useState<Minted | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /// The phone's code is not the same as a laptop's.
  ///
  /// It carries the address and the encryption setup alongside the token, so
  /// the phone can decrypt without any endpoint ever handing key material to a
  /// bearer token. Assembled here, in a browser that is already signed in and
  /// already holds all of it.
  function pairPhone() {
    setError(null);
    setMinted(null);
    setCopied(false);
    start(async () => {
      const setup = await fetchEncryptionSetup();
      if (!setup) {
        setError("Set up your encryption password first.");
        return;
      }

      const res = await pairDevice("MACOS_APP", "iPhone");
      if (!res.ok || !res.token) {
        setError(res.ok ? "Couldn't generate a code." : res.error);
        return;
      }

      setMinted({
        kind: "PHONE",
        token: encodePhonePairing({
          v: 1,
          base: appUrl,
          token: res.token,
          setup,
        }),
      });
      router.refresh();
    });
  }

  function pair(kind: string, label: string) {
    setError(null);
    setMinted(null);
    setCopied(false);
    start(async () => {
      const res = await pairDevice(kind, label);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMinted(res.token ? { kind, token: res.token } : null);
      router.refresh();
    });
  }

  function pairingBlock(kind: string, label: string, buttonText: string) {
    const shown = minted?.kind === kind ? minted.token : null;

    return (
      <div className="mt-6 border-t border-line pt-5">
        <p className="text-[15px] text-text-muted">
          Insight address to paste:{" "}
          <code className="rounded bg-bg px-2 py-1 text-[14px] text-text">
            {appUrl}
          </code>
        </p>

        <button
          onClick={() => pair(kind, label)}
          disabled={pending}
          className="btn-primary mt-4 px-6 py-3 text-[15px] disabled:opacity-60"
        >
          {pending ? "Generating…" : buttonText}
        </button>

        {error && (
          <p role="alert" className="mt-3 text-[15px] text-down">
            {error}
          </p>
        )}

        {shown && (
          <div className="mt-5 rounded-md border border-sky/30 bg-sky-soft p-4">
            <p className="text-[15px] text-text">
              Copy this now. It is shown once and never again.
            </p>
            <code className="mt-3 block overflow-x-auto rounded bg-bg px-3 py-2.5 text-[13px] break-all text-text">
              {shown}
            </code>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(shown);
                setCopied(true);
              }}
              className="btn-secondary mt-3 px-4 py-2 text-[14px] text-text-muted"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <p className="mt-3 text-[13px] leading-relaxed text-text-faint">
              Only a hash of this is stored, which is why we can&rsquo;t show it
              to you again. Lost it? Generate another and revoke this one.
            </p>
          </div>
        )}
      </div>
    );
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

        {pairingBlock(
          "BROWSER_EXTENSION",
          "Browser extension",
          "Generate a pairing code",
        )}
      </section>

      <section className="rounded-lg border border-line bg-surface p-6">
        <h2 className="h3 text-[17px]">Install the Windows app</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-text-muted">
          The same idea for apps rather than websites: it records which apps you
          use while a session is running, and closes blocked ones when Focus
          Mode is on. Outside a session it records nothing.
        </p>

        <ol className="mt-5 space-y-3 text-[15px] leading-relaxed text-text-muted">
          <li>
            <span className="text-text">1.</span>{" "}
            <a href="/download" className="text-sky underline underline-offset-2">
              Download Insight.exe
            </a>{" "}
            and put it somewhere you won&rsquo;t delete by accident. There is no
            installer and it needs no admin rights.
          </li>
          <li>
            <span className="text-text">2.</span> Run it. Windows will say
            it&rsquo;s an unrecognised app — click <strong>More info</strong>,
            then <strong>Run anyway</strong>. That warning is what any app
            without a paid signing certificate looks like.
          </li>
          <li>
            <span className="text-text">3.</span> The pairing window opens by
            itself. Paste the address and the code below.
          </li>
          <li>
            <span className="text-text">4.</span> Right-click the Insight icon
            near the clock and turn on <strong>Start with Windows</strong>, so a
            session isn&rsquo;t missed because the app wasn&rsquo;t running.
          </li>
        </ol>

        <p className="mt-5 text-[14px] leading-relaxed text-text-faint">
          It records app names — Word, Spotify, Steam — and never window titles,
          so which document or which video stays yours. Browsers are left to the
          extension, so nothing is counted twice.
        </p>

        {pairingBlock("WINDOWS_APP", "Windows app", "Generate a Windows code")}
      </section>

      <section className="rounded-lg border border-line bg-surface p-6">
        <h2 className="h3 text-[17px]">Install the Mac app</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-text-muted">
          The same thing for a Mac: it records which apps you use while a
          session is running, and closes blocked ones when Focus Mode is on.
          Outside a session it records nothing.
        </p>

        <ol className="mt-5 space-y-3 text-[15px] leading-relaxed text-text-muted">
          <li>
            <span className="text-text">1.</span>{" "}
            <a href="/download" className="text-sky underline underline-offset-2">
              Download Insight.app
            </a>{" "}
            and drag it to your Applications folder.
          </li>
          <li>
            <span className="text-text">2.</span>{" "}
            <strong>Right-click it and choose Open</strong>, then Open again.
            Double-clicking gets refused, because the app isn&rsquo;t signed by
            a paid Apple developer account. You only do this once.
          </li>
          <li>
            <span className="text-text">3.</span> The pairing window opens by
            itself. Paste the address and the code below.
          </li>
          <li>
            <span className="text-text">4.</span> Click the Insight circle in
            the menu bar and turn on <strong>Open at Login</strong>, so a
            session isn&rsquo;t missed because the app wasn&rsquo;t running.
          </li>
        </ol>

        <p className="mt-5 text-[14px] leading-relaxed text-text-faint">
          It never asks for Accessibility permission, and that&rsquo;s the point
          — reading window titles would require it, so macOS itself is what
          stops this app seeing which document you have open.
        </p>

        {pairingBlock("MACOS_APP", "Mac app", "Generate a Mac code")}
      </section>

      <section className="rounded-lg border border-line bg-surface p-6">
        <h2 className="h3 text-[17px]">On an iPhone</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-text-muted">
          There&rsquo;s nothing to pair. Apple doesn&rsquo;t let any app see
          which app you&rsquo;re using or block one, so an iPhone can&rsquo;t
          measure or block the way a laptop or an Android phone can.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
          What it can do is quiet itself while you work and bounce you out of
          the apps you were avoiding — about ten minutes of setup, done once.
        </p>
        <a
          href="/iphone"
          className="btn-secondary mt-5 inline-block px-5 py-2.5 text-[15px] text-text"
        >
          Set up your iPhone
        </a>
      </section>

      <section className="rounded-lg border border-line bg-surface p-6">
        <h2 className="h3 text-[17px]">Install the Android app</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-text-muted">
          The only phone that can measure its own use, and the only one where
          Focus Mode really blocks something rather than nudging you. It records
          app names while a session is running, and nothing at any other time.
        </p>

        <ol className="mt-5 space-y-3 text-[15px] leading-relaxed text-text-muted">
          <li>
            <span className="text-text">1.</span>{" "}
            <a href="/download" className="text-sky underline underline-offset-2">
              Download Insight.apk
            </a>{" "}
            and tap it. Android blocks installing from unknown sources until you
            allow it in the prompt — once only.
          </li>
          <li>
            <span className="text-text">2.</span> Open Insight and paste the
            code below.
          </li>
          <li>
            <span className="text-text">3.</span> Turn on{" "}
            <strong>usage access</strong> when it asks. That&rsquo;s the
            permission that lets it see which app is in front — app names only,
            never what&rsquo;s on screen.
          </li>
          <li>
            <span className="text-text">4.</span> Optionally allow{" "}
            <strong>drawing over other apps</strong>, which is what lets Focus
            Mode block. Skip it and you still get the counting.
          </li>
        </ol>

        <p className="mt-5 text-[14px] leading-relaxed text-text-faint">
          Both permissions live in your own Settings and can be taken back
          there. Nothing counts while the screen is off.
        </p>

        {pairingBlock("ANDROID_APP", "Android app", "Generate an Android code")}
      </section>

      <section className="rounded-lg border border-line bg-surface p-6">
        <h2 className="h3 text-[17px]">Install the iPhone app</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-text-muted">
          Start and stop sessions, and log last night&rsquo;s sleep before
          you&rsquo;re out of bed. It can&rsquo;t see which apps you use —
          iOS doesn&rsquo;t allow that — so your phone time still comes from the
          Screen Time screenshot.
        </p>

        <div className="mt-6 border-t border-line pt-5">
          <button
            onClick={pairPhone}
            disabled={pending}
            className="btn-primary px-6 py-3 text-[15px] disabled:opacity-60"
          >
            {pending ? "Generating…" : "Generate a phone code"}
          </button>

          {error && (
            <p role="alert" className="mt-3 text-[15px] text-down">
              {error}
            </p>
          )}

          {minted?.kind === "PHONE" && (
            <div className="mt-5 rounded-md border border-sky/30 bg-sky-soft p-4">
              <p className="text-[15px] text-text">
                Copy all of it. It&rsquo;s long, and it&rsquo;s shown once.
              </p>
              <code className="mt-3 block max-h-40 overflow-auto rounded bg-bg px-3 py-2.5 text-[12px] break-all text-text">
                {minted.token}
              </code>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(minted.token);
                  setCopied(true);
                }}
                className="btn-secondary mt-3 px-4 py-2 text-[14px] text-text-muted"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <p className="mt-3 text-[13px] leading-relaxed text-text-faint">
                This one carries your encryption setup as well as the pairing
                code, so the app can show your own data back to you. It is
                useless without your password, which isn&rsquo;t in it — but
                don&rsquo;t share it.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-surface p-6">
        <h2 className="h3 text-[17px]">Paired devices</h2>

        {devices.length === 0 ? (
          <p className="mt-3 text-[15px] text-text-muted">Nothing paired yet.</p>
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
