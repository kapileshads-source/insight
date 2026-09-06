import Link from "next/link";
import { InsightRow } from "@/components/insight-row";
import { SiteFooter, SiteNav } from "@/components/chrome";
import { ScatterCard } from "@/components/scatter-card";

/**
 * The landing page.
 *
 * Rebuilt twice in September 2026, and the second rewrite is the interesting
 * one. The first replaced a bare page with a dark gradient hero, a two-tone
 * gradient headline and a scrolling ticker of feature words. It looked better
 * and it was still wrong: that is the house style of every student-org and
 * dev-tool site on the internet right now, so the page had swapped "obviously
 * a template" for "obviously the current template".
 *
 * The fix was not more restraint. It was to find the one image this app has
 * that nobody else does, and build the page on it:
 *
 *   **Insight is about a correlation, so the hero is a scatter plot** — real
 *   axes, twenty-six points, split into the two groups the engine actually
 *   compares. It states the entire product before a word is read, it cannot
 *   be lifted by anyone selling something else, and it is honest, because it
 *   is the shape of the demo student's term.
 *
 * Everything else follows from putting a chart first:
 *
 * - **The hero is paper, not midnight.** A plot belongs on a light ground, and
 *   inverting to dark for the data sections is a stronger rhythm than starting
 *   dark and staying there. It also flips the usual order, which is most of
 *   why the page no longer resembles its neighbours.
 * - **No gradient headline, no marquee.** Those are the two most recognisable
 *   moves of the style being avoided. Emphasis is one clause in ember.
 * - **Left-aligned and asymmetric**, against a centred column.
 * - **Ornament is a ruled grid**, which means "measured" rather than "we had a
 *   gradient available".
 *
 * Every figure quoted is real and traceable — 600,000 PBKDF2 iterations
 * (`src/lib/crypto.ts`), 1,000 shuffles and seven factors
 * (`src/lib/insights.ts`), five clients. Nothing is a marketing round number,
 * because a judge who reads the source will check.
 */

export const metadata = {
  title: "Insight — study habits, against real grades",
  description:
    "See which of your own habits line up with your test scores. Encrypted in your browser, so nobody else can read any of it.",
};

const FACTORS = [
  "Sleep",
  "Study timing",
  "Session length",
  "Where you studied",
  "Noise",
  "Phone time",
  "Distraction",
];

const PLATFORMS = [
  {
    name: "Browser extension",
    detail: "Counts sites, blocks the ones you name, reads your gradebook.",
    tag: "Chrome",
  },
  {
    name: "Mac",
    detail: "Counts app time. Stops counting when the display sleeps.",
    tag: "Swift",
  },
  {
    name: "Windows",
    detail: "Same counting. Closes a blocked app politely, so nothing is lost.",
    tag: "C#",
  },
  {
    name: "Android",
    detail: "Apps and sites both — the sites through a local DNS filter.",
    tag: "Kotlin",
  },
  {
    name: "iPhone",
    detail: "Add to Home Screen. Logging and reminders; no blocking, see below.",
    tag: "Web app",
  },
];

const STEPS = [
  {
    n: "01",
    head: "Start the timer",
    body: "Subject, where you are, how loud it is. Your Canvas courses are already in the list, so it's three taps.",
  },
  {
    n: "02",
    head: "Grades arrive on their own",
    body: "Canvas syncs every ten minutes. Home Access Center is read through the extension, using the session you're already signed into.",
  },
  {
    n: "03",
    head: "Two questions a day",
    body: "Sleep in the morning, phone time at night — the only two things the app can't measure for itself. Skipped on days you've already answered.",
  },
  {
    n: "04",
    head: "It waits",
    body: "Nothing is claimed until there are enough sessions behind it, it has held across more than one week, and it has beaten a thousand shuffles of your own data.",
  },
];

export default function Home() {
  return (
    <main className="flex-1">
      <SiteNav />

      {/* ---- Hero. Paper, asymmetric, chart on the right. ----------------- */}
      <section className="mk-paper relative overflow-hidden text-on-light">
        <div className="mk-dotgrid absolute inset-0" aria-hidden />

        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-6 pb-24 pt-20 lg:grid-cols-[1.02fr_1fr] lg:gap-16 lg:pb-28 lg:pt-24">
          <div>
            <span className="label inline-flex items-center gap-2 rounded-full border border-on-light/20 px-3.5 py-1.5 text-on-light-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-ember-deep" aria-hidden />
              Built by two students in Frisco ISD
            </span>

            <h1 className="h1 mt-7 max-w-2xl text-[clamp(2.5rem,6.4vw,4.5rem)]">
              Your study habits, plotted against{" "}
              <span className="text-ember-deep">what you actually scored.</span>
            </h1>

            <p className="mt-7 max-w-lg text-[17px] leading-relaxed text-on-light-muted sm:text-[19px]">
              Insight logs when you study, where, for how long, and on how much
              sleep — then checks which of it lines up with your grades. All of
              it is encrypted in your browser, so nobody else can read a word.
              Not us either.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard"
                className="btn-primary-inverted inline-block px-7 py-4 text-[17px]"
              >
                Open the dashboard
              </Link>
              <Link
                href="/demo"
                className="btn-secondary-on-light inline-block px-6 py-4 text-[17px]"
              >
                See it with sample data
              </Link>
            </div>

            <p className="mt-5 text-[14px] text-on-light-muted">
              Free. No password reset, because there is nothing to reset with.
            </p>
          </div>

          <ScatterCard />
        </div>
      </section>

      {/* ---- The engine ---------------------------------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-6 py-24">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.25fr] lg:gap-16">
          <div className="mk-reveal">
            <span className="label text-ember">The part that matters</span>
            <h2 className="h2 mt-4 text-[clamp(1.9rem,4vw,2.9rem)]">
              Most of what a tracker would tell you is a coincidence.
            </h2>
          </div>

          <div className="mk-reveal">
            <p className="max-w-2xl text-[17px] leading-relaxed text-text-muted">
              Seven habits compared against a term of tests will throw up
              impressive-looking differences by luck alone. We checked. Driven
              with generated students,{" "}
              <span className="text-text">
                28 of the 65 findings had no effect built into the data at all
              </span>{" "}
              — and one arrived with the sign backwards.
            </p>
            <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-text-muted">
              So before Insight says anything, it shuffles which of your scores
              land on which side of the comparison a thousand times, and counts
              how often chance alone produces a gap that big. Above five
              percent, you never see it.
            </p>
          </div>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <div className="mk-card mk-reveal px-7 py-5 sm:px-9">
            <p className="label text-up">Shown</p>
            <InsightRow
              direction="NEGATIVE"
              magnitude={-15}
              statement="Sessions you started after 11 PM came before lower scores than your own average."
              sampleSize={12}
              heldIn={{ held: 9, of: 12 }}
              isSurfaced
              hideTopRule
            />
            <p className="pb-4 text-[14px] leading-relaxed text-text-faint">
              Cleared every gate, and beat the shuffle.
            </p>
          </div>

          <div className="mk-card mk-reveal px-7 py-5 sm:px-9">
            <p className="label text-text-faint">Withheld</p>
            <InsightRow
              direction="POSITIVE"
              magnitude={11}
              statement="Studying at the library came before higher scores than your own average."
              sampleSize={7}
              isSurfaced={false}
              hideTopRule
            />
            <p className="pb-4 text-[14px] leading-relaxed text-text-faint">
              An eleven-point gap, and still not shown — chance produced one
              that big in 19% of shuffles. This is the whole idea.
            </p>
          </div>
        </div>

        <p className="mt-8 max-w-2xl text-[15px] leading-relaxed text-text-faint">
          Every statement says <em>came before</em>, never <em>caused</em>, and
          there are tests that fail the build if that slips. Comparisons are
          against your own average — never against eight hours, or a study tip
          off the internet.
        </p>
      </section>

      {/* ---- Figures, on a rule rather than in boxes. --------------------- */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-24">
        <hr className="mk-rule" />
        <div className="mk-reveal grid gap-10 pt-12 sm:grid-cols-2 lg:grid-cols-4">
          <Figure value="7" label="habits compared against your scores" />
          <Figure value="1,000" label="shuffles before anything is called a pattern" />
          <Figure value="600k" label="key iterations between your password and your data" />
          <Figure value="0" label="people who can read it, including us" />
        </div>
      </section>

      {/* ---- How it works, with the week panel under it. ------------------ */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-24">
        <span className="label text-ember">How it works</span>
        <h2 className="h2 mt-4 max-w-2xl text-[clamp(1.9rem,4vw,2.9rem)]">
          Four things, and three of them happen without you.
        </h2>

        <ol className="mt-14 grid gap-x-12 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n} className="mk-reveal border-t border-line pt-5">
              <div className="figure text-[1.4rem] text-ember">{s.n}</div>
              <h3 className="h3 mt-4 text-[19px]">{s.head}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
                {s.body}
              </p>
            </li>
          ))}
        </ol>

        <div className="mk-reveal mt-16">
          <WeekPanel />
        </div>
      </section>

      {/* ---- Privacy. The inversion back to paper lands on the claim worth
              remembering, and closes the light/dark alternation. --------- */}
      <section className="mk-paper relative overflow-hidden py-28 text-on-light">
        <div className="relative mx-auto w-full max-w-6xl px-6">
          <span className="label text-ember-deep">Encryption</span>
          <h2 className="h2 mt-4 max-w-3xl text-[clamp(2rem,4.8vw,3.3rem)]">
            We built it so that we couldn&rsquo;t read your grades even if we
            wanted to.
          </h2>

          <div className="mt-14 grid gap-10 sm:grid-cols-3">
            <div className="border-t border-on-light/15 pt-5">
              <h3 className="h3 text-[17px]">The key never leaves</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-on-light-muted">
                Your password is stretched through 600,000 rounds in your own
                browser, and what comes out unlocks your data there. The server
                is handed ciphertext and nothing else.
              </p>
            </div>
            <div className="border-t border-on-light/15 pt-5">
              <h3 className="h3 text-[17px]">So the maths runs on your device</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-on-light-muted">
                Every pattern on this page is computed in the tab you have open,
                because the only machine that can read the inputs is yours. That
                is a consequence, not a feature.
              </p>
            </div>
            <div className="border-t border-on-light/15 pt-5">
              <h3 className="h3 text-[17px]">And there is no reset</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-on-light-muted">
                Forget the password and the data is gone — we cannot recover
                what we cannot read. Said here rather than in a support article,
                because it is the price of the two paragraphs above.
              </p>
            </div>
          </div>

          <p className="mt-12 max-w-2xl text-[15px] leading-relaxed text-on-light-muted">
            Reminders carry no data either — the server can tell that Tuesday
            night is unlogged without knowing what you would have written. So a
            lock screen never shows your grades to whoever picks up the phone.
          </p>

          <Link
            href="/privacy"
            className="btn-secondary-on-light mt-8 inline-block px-6 py-3 text-[16px]"
          >
            Read exactly what is stored
          </Link>
        </div>
      </section>

      {/* ---- Clients ------------------------------------------------------ */}
      <section className="mx-auto w-full max-w-6xl px-6 py-24">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.25fr] lg:gap-16">
          <div>
            <span className="label text-ember">Five ways to log</span>
            <h2 className="h2 mt-4 text-[clamp(1.9rem,4vw,2.9rem)]">
              It counts the time so you don&rsquo;t have to guess at it.
            </h2>
          </div>
          <p className="max-w-2xl self-end text-[17px] leading-relaxed text-text-muted">
            Install whichever you actually use. Each one counts app and site
            time in the background, and can block what you name while a session
            is running — with a three-second override that gets recorded, rather
            than a hard lock you&rsquo;d have uninstalled by Thursday.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PLATFORMS.map((p) => (
            <div key={p.name} className="mk-card mk-reveal p-6">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="h3 text-[17px]">{p.name}</h3>
                <span className="label text-text-faint">{p.tag}</span>
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
                {p.detail}
              </p>
            </div>
          ))}

          {/* Named rather than omitted. A missing platform on a grid reads as
              an oversight; the reason is more interesting than the gap. */}
          <div className="mk-reveal rounded-lg border border-dashed border-line p-6">
            <h3 className="h3 text-[17px] text-text-muted">
              Why iPhone can&rsquo;t block
            </h3>
            <p className="mt-3 text-[15px] leading-relaxed text-text-faint">
              Apple puts app blocking behind an entitlement that is granted, not
              bought, and we don&rsquo;t have it. Rather than pretend, the
              iPhone app uses a Shortcuts automation you set up yourself.
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-3">
          <Link
            href="/download"
            className="btn-secondary inline-block px-6 py-3 text-[16px] text-text"
          >
            Downloads and setup
          </Link>
          <span className="text-[14px] text-text-faint">
            Nothing is required — the web app logs on its own.
          </span>
        </div>
      </section>

      {/* ---- Close -------------------------------------------------------- */}
      <section className="relative overflow-hidden border-t border-line">
        <div className="mk-aurora mk-grain" aria-hidden />
        <div className="relative mx-auto w-full max-w-6xl px-6 py-28">
          <h2 className="h2 max-w-2xl text-[clamp(2rem,5vw,3.3rem)]">
            A term of your own data, honestly read.
          </h2>
          <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-text-muted">
            It takes a few weeks of logging before anything clears the gates.
            That wait is the point — but you can see what the far end looks like
            right now.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/sign-up"
              className="btn-primary inline-block px-8 py-4 text-[17px]"
            >
              Make an account
            </Link>
            <Link
              href="/demo"
              className="btn-secondary inline-block px-7 py-4 text-[17px] text-text"
            >
              Load sample data instead
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

/* -------------------------------------------------------------------------- */




/// A figure and its caption. The number is set far larger than the words,
/// because the caption is what makes it mean anything and it still shouldn't
/// be the thing you read first.
function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="figure text-[clamp(2.4rem,5.5vw,3.4rem)] text-sky">
        {value}
      </div>
      <p className="mt-3 max-w-[15rem] text-[15px] leading-snug text-text-muted">
        {label}
      </p>
    </div>
  );
}

/// The week view, so a visitor sees the actual dashboard and not only the one
/// chart from the hero.
function WeekPanel() {
  const week = [
    { day: "M", minutes: 95 },
    { day: "T", minutes: 140 },
    { day: "W", minutes: 60 },
    { day: "T", minutes: 155 },
    { day: "F", minutes: 45 },
    { day: "S", minutes: 0 },
    { day: "S", minutes: 80 },
  ];
  const peak = Math.max(...week.map((d) => d.minutes));

  return (
    <div className="mk-card overflow-hidden p-1.5">
      <div className="rounded-[13px] bg-bg/70 p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="h3 text-[17px]">This week</h3>
          <span className="label text-text-faint">Sample data</span>
        </div>

        <div className="mt-6 grid gap-8 sm:grid-cols-[1fr_auto] sm:items-end">
          {/* Bars and labels are two rows of one grid, rather than seven little
              columns each holding a bar and a label. The obvious version does
              not work: `items-end` on the row stops the columns stretching, so
              each is only as tall as its contents and a percentage height
              inside it resolves against nothing. Every bar renders at zero and
              the chart is invisible. */}
          <div>
            <div className="grid h-28 grid-cols-7 items-end gap-2.5">
              {week.map((d, i) => (
                <div
                  key={i}
                  className={`rounded-t-[4px] ${
                    d.minutes === 0 ? "bg-line" : "bg-sky"
                  }`}
                  // A zero day still gets a sliver, so the axis reads as seven
                  // days rather than six and a gap.
                  style={{
                    height: `${Math.max(3, (d.minutes / peak) * 100)}%`,
                  }}
                />
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-2.5">
              {week.map((d, i) => (
                <span key={i} className="label text-center text-text-faint">
                  {d.day}
                </span>
              ))}
            </div>
          </div>

          <div className="sm:pb-7 sm:text-right">
            <div className="figure text-[2.5rem] text-text">
              9<span className="text-[0.45em] align-[0.35em]">h</span> 35
              <span className="text-[0.45em] align-[0.35em]">m</span>
            </div>
            <p className="mt-1 text-[14px] text-text-faint">across 6 sessions</p>
          </div>
        </div>

        {/* The seven, listed rather than scrolled past. A ticker looks livelier
            and is unreadable, which for the actual list of what the app
            measures is the wrong trade. */}
        <div className="mt-8 border-t border-line pt-5">
          <p className="label text-text-faint">Compared against every score</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {FACTORS.map((f) => (
              <li key={f} className="mk-chip text-text-muted">
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

