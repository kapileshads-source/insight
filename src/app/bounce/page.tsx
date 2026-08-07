import Link from "next/link";
import { getRunningSession } from "@/app/actions/sessions";
import { cleanAppName } from "@/lib/bounce";
import { formatDuration } from "@/lib/records";

export const metadata = { title: "Back to it — Insight" };
export const dynamic = "force-dynamic";

/**
 * Where a Shortcuts automation lands a student who just opened something they
 * meant to leave alone.
 *
 * iOS won't let any app block another one without an entitlement Apple grants
 * to parental-control companies. What it does allow is an automation that fires
 * when a chosen app opens — so the phone bounces straight back out, and lands
 * here.
 *
 * The tone matters more than usual. This appears at the exact moment someone
 * feels caught, and a page that tells them off is one they'll delete the
 * automation to avoid. It states what happened, how far into the session they
 * are, and gets out of the way — the same reasoning as the three-second
 * countdown on the desktop apps.
 *
 * Public, because it has to work in whatever browser the automation opens and
 * signing in first would defeat the point. A signed-in reader gets the minutes;
 * everyone else still gets the interruption, which is the part that works.
 */
export default async function BouncePage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string }>;
}) {
  const params = await searchParams;
  const app = cleanAppName(params.app);
  const running = await getRunningSession().catch(() => null);

  // Read once, like the dashboard does. The lint rule objects to `Date.now()`
  // mid-render, and it has a point: two calls in one render could disagree.
  const now = new Date();
  const minutes = running
    ? Math.max(0, Math.floor((now.getTime() - running.startedAt.getTime()) / 60000))
    : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 py-16">
      <p className="label text-text-faint">Insight</p>

      <h1 className="h1 mt-6 text-[clamp(2rem,7vw,2.75rem)]">
        {running ? "You're mid-session." : "You meant to leave that alone."}
      </h1>

      {app ? (
        <p className="mt-5 text-[19px] leading-relaxed text-text-muted">
          You just opened <span className="text-text">{app}</span>, and your
          phone brought you here instead. That was your own doing — you set it
          up.
        </p>
      ) : (
        <p className="mt-5 text-[19px] leading-relaxed text-text-muted">
          Your phone bounced you out of something you asked it to bounce you out
          of.
        </p>
      )}

      {minutes !== null && (
        <p className="mt-5 rounded-lg border border-line bg-surface px-5 py-4 text-[17px] leading-relaxed">
          <span className="text-text">{formatDuration(minutes)}</span>{" "}
          <span className="text-text-muted">
            into this session so far. Going back now keeps it whole.
          </span>
        </p>
      )}

      {!running && (
        <p className="mt-5 text-[15px] leading-relaxed text-text-faint">
          No session is running right now — either you finished, or this fired
          on its own. Either way, nothing is being recorded.
        </p>
      )}

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/dashboard" className="btn-primary px-6 py-3 text-[16px]">
          Open Insight
        </Link>
      </div>

      <p className="mt-6 text-[15px] leading-relaxed text-text-muted">
        Or just swipe up and go back to what you were doing. That&rsquo;s the
        one that counts.
      </p>

      <details className="mt-14 border-t border-line pt-6">
        <summary className="cursor-pointer text-[15px] text-text-muted">
          How this works, and how to turn it off
        </summary>

        <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-text-muted">
          <p>
            In the Shortcuts app: <strong className="text-text">Automation</strong>{" "}
            → <strong className="text-text">＋</strong> →{" "}
            <strong className="text-text">App</strong> → pick the apps that eat
            your evening → <strong className="text-text">Is Opened</strong> →{" "}
            <strong className="text-text">Run Immediately</strong>. For the
            action, choose <strong className="text-text">Open URL</strong> and
            paste this page&rsquo;s address, adding{" "}
            <code className="rounded bg-bg px-1.5 py-0.5 text-[14px] text-text">
              ?app=Instagram
            </code>{" "}
            so it knows what to say.
          </p>
          <p>
            To stop it, delete that automation — same screen, swipe left. No
            password, no waiting.{" "}
            <span className="text-text-faint">
              That&rsquo;s deliberate. A blocker that hides its own off-switch is
              one you uninstall in a bad week, and then it protects you from
              nothing at all.
            </span>
          </p>
          <p className="text-text-faint">
            Being straight about the limit: this is an interruption, not a wall.
            iOS only lets software Apple has vetted actually block an app. If you
            want a real wall, set a Screen Time passcode and have someone else
            choose it.
          </p>
        </div>
      </details>
    </main>
  );
}
