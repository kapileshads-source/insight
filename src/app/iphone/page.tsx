import Link from "next/link";

import { appsToBlock } from "@/lib/ios-apps";

export const metadata = { title: "Insight on iPhone — Insight" };

/**
 * The iPhone setup, written out.
 *
 * Every other platform has an app that does the work. iOS grants no way to see
 * which app is in front, or to block one, without an entitlement Apple hands
 * to parental-control companies — so what a student gets instead is three
 * things they set up by hand, and this page is the difference between them
 * being set up and not.
 *
 * It leads with what iPhone can't do. A student who expects what their friend
 * gets on a laptop and finds silence will conclude the app is broken, and stop
 * trusting the parts that do work.
 */

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="border-t border-line pt-6">
      <h3 className="text-[17px] text-text">
        <span className="text-text-faint">{number}.</span> {title}
      </h3>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-text-muted">
        {children}
      </div>
    </li>
  );
}

export default function IPhonePage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <Link href="/" className="h3 text-[17px]">
        Insight
      </Link>

      <h1 className="h1 mt-10 text-[clamp(2rem,6vw,2.75rem)]">
        Insight on iPhone.
      </h1>

      <p className="mt-5 text-[17px] leading-relaxed text-text-muted">
        Three things to set up, about ten minutes, and you only do it once.
      </p>

      <section className="mt-10 rounded-lg border border-line bg-surface p-6">
        <h2 className="h3 text-[17px]">First, what an iPhone can&rsquo;t do</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
          It can&rsquo;t measure which apps you use, and it can&rsquo;t block
          one. Apple keeps both behind a permission it grants to
          parental-control companies, and no amount of building gets round it.
          Android can do both; your laptop can do both. An iPhone can&rsquo;t,
          and we&rsquo;d rather say so than let you wonder why nothing appears.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
          What it can do is start and stop sessions, log a night&rsquo;s sleep,
          quiet itself while you work, and interrupt you when you reach for the
          thing you were avoiding. Phone screen time still gets in the same way
          it always has — the screenshot on{" "}
          <Link href="/dashboard" className="text-sky underline underline-offset-2">
            your dashboard
          </Link>
          .
        </p>
      </section>

      <ol className="mt-12 space-y-8">
        <Step number={1} title="Put Insight on your Home Screen">
          <p>
            In Safari, open Insight, tap the <strong>Share</strong> button — the
            square with the arrow — and choose{" "}
            <strong>Add to Home Screen</strong>.
          </p>
          <p>
            It opens like an app after that, without the address bar, and
            it&rsquo;s where the session buttons and your sleep log live. Do
            this in Safari specifically; Chrome on iPhone can&rsquo;t add it.
          </p>
        </Step>

        <Step number={2} title="Make a Focus, and two shortcuts to switch it">
          <p>
            <strong>Settings → Focus → +</strong>, and make one called{" "}
            <strong>Study</strong>. Choose which apps are allowed to reach you;
            everything else gets hidden and silenced while it&rsquo;s on.
          </p>
          <p>
            Then open <strong>Shortcuts</strong> and make two, each with a
            single <strong>Set Focus</strong> action:
          </p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>
              One that turns Study <strong>on</strong>, named exactly{" "}
              <code className="rounded bg-bg px-1.5 py-0.5 text-[14px] text-text">
                Insight Study On
              </code>
            </li>
            <li>
              One that turns it <strong>off</strong>, named exactly{" "}
              <code className="rounded bg-bg px-1.5 py-0.5 text-[14px] text-text">
                Insight Study Off
              </code>
            </li>
          </ul>
          <p>
            The names have to match exactly. Insight shows two buttons on the
            session screen that run them, so you can quiet your phone without
            leaving the app.
          </p>
        </Step>

        <Step number={3} title="Bounce yourself out of the tempting ones">
          <p>
            This is the closest an iPhone gets to blocking, and it works
            surprisingly well.
          </p>
          <p>
            In <strong>Shortcuts → Automation → +</strong>, choose{" "}
            <strong>App</strong>. Pick the apps that eat your evenings, set it to{" "}
            <strong>Is Opened</strong>, and turn on{" "}
            <strong>Run Immediately</strong>. For the action, choose{" "}
            <strong>Open URL</strong> and paste:
          </p>
          <code className="block overflow-x-auto rounded bg-bg px-3 py-2.5 text-[13px] break-all text-text">
            https://insight-study-sleep.vercel.app/bounce?app=Instagram
          </code>
          <p>
            Change <span className="text-text">Instagram</span> to whichever app
            it is, so the page knows what to say. Now opening it flips you
            straight back out to a page that tells you how far into your session
            you are.
          </p>
          <div className="rounded-lg border border-line bg-bg p-4">
            <h4 className="text-[15px] text-text">Which apps to tick</h4>
            <p className="mt-2 text-[14px] leading-relaxed text-text-muted">
              The picker shows everything on your phone, so here is the list
              the rest of Insight already blocks — your laptop and an Android
              phone enforce exactly these. Tick the ones you actually have; you
              only do this once, and you can come back and edit the automation
              whenever.
            </p>
            <dl className="mt-4 space-y-3">
              {appsToBlock().map((group) => (
                <div key={group.category}>
                  <dt className="text-[13px] text-text-faint">{group.label}</dt>
                  <dd className="mt-1 text-[14px] leading-relaxed text-text">
                    {group.apps.join(", ")}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[13px] leading-relaxed text-text-faint">
              One automation holds all of them — select as many apps as you
              like in the same picker, rather than making one per app. Anything
              you add to your own blocklist in{" "}
              <Link
                href="/settings"
                className="text-sky underline underline-offset-2"
              >
                Settings
              </Link>{" "}
              shows up here too.
            </p>
          </div>

          <p className="text-text-faint">
            It fires every single time, which is more than a hidden icon does —
            but you can also delete the automation in ten seconds, and
            that&rsquo;s deliberate. A blocker that hides its own off-switch is
            one you remove in a bad week, and then it protects you from nothing.
          </p>
        </Step>

        <Step number={4} title="If you actually mean it, use Screen Time">
          <p>
            <strong>Settings → Screen Time → App Limits</strong> is Apple&rsquo;s
            own blocking, and it&rsquo;s a real wall rather than a nudge.
          </p>
          <p>
            The catch is that you can lift it yourself in two taps — unless
            somebody else sets the Screen Time passcode. A parent, a sibling, a
            friend who won&rsquo;t tell you. That&rsquo;s the free version of a
            lock you can&rsquo;t undo on a whim, and honestly it&rsquo;s
            stronger than anything an app is allowed to do to your phone.
          </p>
        </Step>
      </ol>

      <section className="mt-14 rounded-lg border border-line bg-surface p-6">
        <h2 className="h3 text-[17px]">What ends up happening</h2>
        <ul className="mt-4 ml-5 list-disc space-y-2 text-[15px] leading-relaxed text-text-muted">
          <li>You start a session from your Home Screen, or your laptop.</li>
          <li>One tap quiets your phone for the length of it.</li>
          <li>
            Reaching for Instagram bounces you back out, every time, with your
            session time in front of you.
          </li>
          <li>
            Your laptop keeps measuring properly, and that&rsquo;s where the
            insights come from.
          </li>
        </ul>
        <p className="mt-4 text-[13px] leading-relaxed text-text-faint">
          Got an Android phone as well?{" "}
          <Link href="/download" className="text-sky underline underline-offset-2">
            That one measures and blocks properly
          </Link>
          , with no setup beyond two permissions.
        </p>
      </section>
    </main>
  );
}
