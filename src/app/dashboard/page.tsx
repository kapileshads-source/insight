import { InsightRow } from "@/components/insight-row";

export const metadata = { title: "Insight" };

// Static sample data. This screen is not wired to the database yet — it exists
// to fix the visual language before the real queries land behind it.
const UPCOMING = [
  {
    name: "Unit 6 test: stoichiometry",
    course: "Chemistry",
    due: "Thursday",
    soon: true,
  },
  {
    name: "Federalist essay draft",
    course: "AP Gov",
    due: "Friday",
    soon: false,
  },
  { name: "Problem set 14", course: "Algebra II", due: "Monday", soon: false },
];

// Which of the last seven days got logged. This is the only progress-shaped
// thing in the product, and it deliberately tracks participation rather than
// outcomes — a student should never see a reward for reporting good sleep,
// because that is exactly what makes self-reported data worth less.
const LOGGED_DAYS = [true, true, false, true, true, true, false];
const DAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

function Stat({
  value,
  label,
  delta,
}: {
  value: string;
  label: string;
  delta?: { text: string; tone: "up" | "down" | "flat" };
}) {
  const tone =
    delta?.tone === "up"
      ? "text-up"
      : delta?.tone === "down"
        ? "text-down"
        : "text-text-faint";

  return (
    <div>
      <div className="figure text-[2.25rem]">{value}</div>
      <div className="label mt-2.5 text-text-muted">{label}</div>
      {delta && <div className={`mt-1 text-[14px] ${tone}`}>{delta.text}</div>}
    </div>
  );
}

export default function Dashboard() {
  const loggedCount = LOGGED_DAYS.filter(Boolean).length;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 pb-32">
      <header className="flex items-center justify-between border-b border-line py-6">
        <span className="h3 text-[17px]">Insight</span>
        <span className="text-[14px] text-text-faint">Wednesday, Oct 8</span>
      </header>

      {/* Right now. A full Sky panel rather than a chip — one large flat area
          of color per screen is where the energy comes from, and inverting to
          Midnight ink inside it keeps the palette at two colors. */}
      <section className="mt-10 rounded-xl bg-sky px-7 py-9 text-on-light sm:px-10 sm:py-11">
        <span className="label text-on-light-muted">
          3rd period, ends in 24 minutes
        </span>

        <h1 className="h1 mt-4 text-[clamp(2.5rem,7vw,3.75rem)]">Chemistry</h1>

        <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-on-light-muted">
          Unit 6 test is Thursday. You&rsquo;ve logged 40 minutes on it this
          week, against 2 hours 10 minutes the week before your last test.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button className="btn-primary-inverted px-7 py-3.5 text-[16px]">
            Start studying
          </button>
          <button className="btn-secondary-on-light px-5 py-3.5 text-[16px]">
            Log a score
          </button>
        </div>
      </section>

      {/* Logging consistency. Participation only — never a judgement on the
          numbers themselves. */}
      <section className="mt-6 rounded-lg border border-line bg-surface px-7 py-6">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[15px] text-text-muted">
            Logged {loggedCount} of the last 7 days
          </span>
          <span className="label text-text-faint">Keeps insights honest</span>
        </div>

        <div className="mt-5 flex gap-2">
          {LOGGED_DAYS.map((logged, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-2">
              <div
                className={`h-2 w-full rounded-full ${
                  logged ? "bg-sky" : "bg-surface-hi"
                }`}
              />
              <span
                className={`text-[12px] ${
                  logged ? "text-text-muted" : "text-text-faint"
                }`}
              >
                {DAY_INITIALS[i]}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
        <Stat
          value="6"
          label="Sessions this week"
          delta={{ text: "+2 vs. your average", tone: "up" }}
        />
        <Stat
          value="4h 20m"
          label="Time logged"
          delta={{ text: "35m below average", tone: "down" }}
        />
        <Stat
          value="6.4 hrs"
          label="Sleep, 7-day"
          delta={{ text: "1.1 below average", tone: "down" }}
        />
        <Stat
          value="82%"
          label="On-task time"
          delta={{ text: "About usual", tone: "flat" }}
        />
      </section>

      <section className="mt-20">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="h2 text-[clamp(1.6rem,4vw,2.125rem)]">
            What we&rsquo;re seeing
          </h2>
          <button className="btn-secondary shrink-0 px-4 py-2 text-[14px] text-text-muted">
            Manage
          </button>
        </div>
        <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-text-muted">
          Patterns in your own data, compared against your own averages. These
          describe what happened together, not what caused what.
        </p>

        <div className="mt-8">
          <InsightRow
            direction="NEGATIVE"
            magnitude={-15}
            statement="Sessions you started after 11 PM came before lower scores than your own average."
            sampleSize={12}
            heldIn={{ held: 9, of: 12 }}
            suggestion="Your strongest results came after sessions started before 9 PM. With the Chemistry test Thursday, two shorter evenings may fit your pattern better than one long night."
            isSurfaced
          />
          <InsightRow
            direction="POSITIVE"
            magnitude={11}
            statement="Library sessions came before higher scores than sessions at home."
            sampleSize={14}
            heldIn={{ held: 11, of: 14 }}
            isSurfaced
          />
          <InsightRow
            direction="POSITIVE"
            magnitude={9}
            statement="Sessions under 45 minutes came before higher scores than sessions over 2 hours."
            sampleSize={10}
            heldIn={{ held: 7, of: 10 }}
            isSurfaced
          />
          <InsightRow
            direction="NEUTRAL"
            magnitude={2}
            statement="Phone use during study time hasn&rsquo;t lined up with any score difference."
            sampleSize={5}
            isSurfaced={false}
          />
        </div>
      </section>

      <section className="mt-20">
        <h2 className="h2 text-[clamp(1.6rem,4vw,2.125rem)]">Coming up</h2>
        <div className="mt-7">
          {UPCOMING.map((a) => (
            <div
              key={a.name}
              className="flex items-baseline justify-between gap-6 border-t border-line py-4"
            >
              <div className="min-w-0">
                <div className="truncate text-[16px]">{a.name}</div>
                <div className="mt-1 text-[14px] text-text-faint">
                  {a.course}
                </div>
              </div>
              <span
                className={`shrink-0 text-[14px] ${
                  a.soon ? "text-butter" : "text-text-muted"
                }`}
              >
                {a.due}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
