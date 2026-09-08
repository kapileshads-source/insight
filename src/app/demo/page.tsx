import { PageHero, SiteFooter, SiteNav } from "@/components/chrome";

import { DemoSeeder } from "@/components/demo-seeder";

export const metadata = { title: "Sample data — Insight" };

/**
 * Filling an empty account with a term of sample data.
 *
 * The engine can't be shown to anyone on an empty dashboard, and a real term
 * takes a real term to collect. This makes one in a few seconds so the app can
 * be demonstrated, screenshotted, and argued with.
 *
 * It leads with what this is, because the one way to misuse it is to forget.
 */
export default function DemoPage() {
  return (
    <main className="flex-1">
      <SiteNav />

      <PageHero
        eyebrow="Demonstration"
        title="Sample data."
        lede="Twelve weeks of a made-up student, so the dashboard has something to show. Useful for a demo video, a screenshot, or checking that the insight engine behaves."
      />

      <div className="mx-auto w-full max-w-3xl px-6 py-16">

      <section className="mt-10 rounded-lg border border-alert/40 bg-surface p-6">
        <h2 className="h3 text-[17px]">This is not real data</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
          It is invented, and it must never be described as anyone&rsquo;s
          actual usage — in a submission, a video, or anywhere else. Use it to
          show what the app <em>does</em>, not what it found.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
          It only runs in an account with no sessions and no scores in it, and
          that limit is enforced rather than suggested. Once invented scores and
          real ones are both encrypted they are indistinguishable, and every
          insight afterwards would be drawn from both. Make a separate account
          for this; deleting it afterwards is the whole cleanup.
        </p>
      </section>

      <DemoSeeder />

      <section className="mt-12">
        <h2 className="h3 text-[17px]">What it makes</h2>
        <ul className="mt-4 ml-5 list-disc space-y-2 text-[15px] leading-relaxed text-text-muted">
          <li>Around 50 study sessions across three subjects, on school days</li>
          <li>A night&rsquo;s sleep and a phone-time figure for every day</li>
          <li>Around 20 test scores</li>
        </ul>
        <p className="mt-4 text-[15px] leading-relaxed text-text-muted">
          The student has a deliberate pattern: they score worse after late
          nights. That is the point — you can check whether the engine finds
          what was put there, and whether it stays quiet about the things that
          were left as noise. It should surface the late-night pattern and say
          nothing about where they studied, because nothing was planted there.
        </p>
        <p className="mt-4 text-[13px] leading-relaxed text-text-faint">
          Everything is encrypted in your browser on the way in, exactly like
          real logs. The generator has to run here for the same reason the rest
          of the app does — the server has no key.
        </p>
      </section>
      </div>

      <SiteFooter />
    </main>
  );
}
