import Link from "next/link";
import { InsightRow } from "@/components/insight-row";

/// Three short claims, set large and stacked. The apple.com rhythm: one idea
/// per band, a lot of air around each, no boxes doing the separating.
const BANDS = [
  {
    kicker: "Logging",
    line: "A timer, a location, and last night’s sleep.",
    body: "Start the timer when you sit down. Everything else is a couple of taps, and your Canvas courses are already in the list.",
  },
  {
    kicker: "Outcomes",
    line: "Your real grades, not a productivity score.",
    body: "Canvas brings in assignments, due dates, and grades as they post. Anything Canvas misses, you can add in a few seconds.",
  },
  {
    kicker: "Patterns",
    line: "Held up against your own averages.",
    body: "Nothing gets shown until there’s enough of it to mean something, and it’s always compared to you rather than to a general rule.",
  },
];

export default function Home() {
  return (
    <main className="flex-1">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <span className="h3 text-[17px]">Insight</span>
        <span className="label text-text-faint">Frisco ISD pilot</span>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-4xl px-6 pb-24 pt-20 text-center sm:pt-28">
        <h1 className="h1 mx-auto max-w-3xl text-[clamp(2.75rem,8vw,5rem)]">
          Study habits, against real grades.
        </h1>

        <p className="mx-auto mt-7 max-w-xl text-lg leading-relaxed text-text-muted sm:text-xl">
          Insight logs when you study, where, for how long, and on how much
          sleep. Then it lines all of that up against what you actually scored.
        </p>

        <div className="mt-11">
          <Link
            href="/dashboard"
            className="btn-primary inline-block px-8 py-4 text-[17px]"
          >
            See the dashboard
          </Link>
          <p className="mt-5 text-[15px] text-text-faint">
            Sample data. Nothing is wired up yet.
          </p>
        </div>
      </section>

      {/* One real insight, shown rather than described. */}
      <section className="mx-auto w-full max-w-3xl px-6 pb-28">
        <div className="rounded-lg border border-line bg-surface px-7 py-3 sm:px-9">
          <InsightRow
            direction="NEGATIVE"
            magnitude={-15}
            statement="Sessions you started after 11 PM came before lower scores than your own average."
            sampleSize={12}
            heldIn={{ held: 9, of: 12 }}
            isSurfaced
            hideTopRule
          />
        </div>
        <p className="mt-4 text-center text-[15px] text-text-faint">
          What one looks like after a few weeks of logging.
        </p>
      </section>

      {/* Starlight band. A full-bleed inversion is the single biggest jump in
          energy available without adding ornament — the page goes from a dark
          run to a warm paper field, which is the apple.com section rhythm. */}
      <section className="bg-starlight py-28 text-on-light">
        <div className="mx-auto w-full max-w-5xl px-6">
          <div className="grid gap-14 sm:gap-20">
            {BANDS.map((b, i) => (
              <div
                key={b.kicker}
                className={`grid gap-4 pt-10 sm:grid-cols-[9rem_1fr] sm:gap-12 ${
                  i > 0 ? "border-t border-starlight-dim" : ""
                }`}
              >
                <div className="label pt-1.5 text-on-light-muted">
                  {b.kicker}
                </div>
                <div>
                  <h2 className="h2 max-w-xl text-[clamp(1.6rem,3.6vw,2.4rem)]">
                    {b.line}
                  </h2>
                  <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-on-light-muted">
                    {b.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-5xl px-6 py-14">
        <p className="max-w-2xl text-[14px] leading-relaxed text-text-faint">
          Insight compares your data against your own averages. It describes
          what happened together, never what caused what.
        </p>
      </footer>
    </main>
  );
}
