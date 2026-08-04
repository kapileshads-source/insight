import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/user";
import { isAdmin } from "@/app/actions/admin";
import {
  CalendarDayEditor,
  PeriodEditor,
} from "@/components/schedule-editor";

export const metadata = { title: "Schedules — Insight admin" };

export default async function AdminSchedulesPage(
  props: PageProps<"/admin/schedules">,
) {
  const user = await getOrCreateUser();
  if (!user) redirect("/sign-in");

  // 404 rather than 403: a student who guesses the URL learns nothing about
  // whether the page exists.
  if (!(await isAdmin())) notFound();

  const { school: schoolId } = await props.searchParams;
  const schools = await db.school.findMany({
    select: { id: true, name: true, type: true },
    orderBy: { name: "asc" },
  });

  const selectedId =
    (typeof schoolId === "string" ? schoolId : null) ?? schools[0]?.id;

  const [periods, terms, unresolved] = await Promise.all([
    selectedId
      ? db.period.findMany({
          where: { schoolId: selectedId },
          orderBy: [{ dayType: "asc" }, { sequence: "asc" }],
        })
      : Promise.resolve([]),
    selectedId
      ? db.term.findMany({
          where: { schoolId: selectedId },
          orderBy: { startDate: "asc" },
        })
      : Promise.resolve([]),
    // The dates the calendar extractor flagged. Surfaced here so they get
    // fixed by hand rather than sitting wrong all year.
    db.districtCalendarDay.findMany({
      where: {
        date: {
          in: [
            new Date("2027-05-03T00:00:00Z"),
            new Date("2027-05-10T00:00:00Z"),
            new Date("2026-10-01T00:00:00Z"),
            new Date("2027-04-07T00:00:00Z"),
            new Date("2027-04-22T00:00:00Z"),
          ],
        },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const selected = schools.find((s) => s.id === selectedId);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 pb-32">
      <header className="flex items-center justify-between border-b border-line py-6">
        <Link href="/dashboard" className="h3 text-[17px]">
          Insight
        </Link>
        <span className="label text-text-faint">Admin</span>
      </header>

      <h1 className="h1 mt-12 text-[clamp(2rem,5vw,2.75rem)]">Schedules</h1>
      <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-text-muted">
        Bell times and the district calendar, editable without a deploy. The
        seeded times were reconstructed rather than taken from a published FISD
        page, so they should be checked against a real campus schedule.
      </p>

      <section className="mt-10">
        <h2 className="h2 text-[1.5rem]">Campus</h2>
        <form className="mt-4">
          <select
            name="school"
            defaultValue={selectedId}
            className="w-full rounded-md border border-line-hi bg-surface px-4 py-3 text-[16px] text-text focus:border-sky"
          >
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="btn-secondary mt-3 px-5 py-2.5 text-[15px] text-text-muted"
          >
            Load
          </button>
        </form>
      </section>

      {selected && (
        <section className="mt-12">
          <h2 className="h2 text-[1.5rem]">Bell times</h2>
          <p className="mt-2 text-[15px] text-text-muted">
            {selected.name} &middot;{" "}
            {selected.type === "HIGH"
              ? "A/B block, four 90-minute blocks plus Advisory"
              : "All classes meet daily"}
          </p>
          <div className="mt-6">
            <PeriodEditor periods={periods} />
          </div>
        </section>
      )}

      <section className="mt-14">
        <h2 className="h2 text-[1.5rem]">Calendar</h2>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-text-muted">
          Overrides one date district-wide. Use it for exam schedules, an
          invoked bad-weather day, or a late start added mid-year.
        </p>
        <div className="mt-6 rounded-lg border border-line bg-surface p-6">
          <CalendarDayEditor />
        </div>
      </section>

      {unresolved.length > 0 && (
        <section className="mt-14">
          <h2 className="h2 text-[1.5rem]">Worth double-checking</h2>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-text-muted">
            The extractor read these from the published PDF but couldn&rsquo;t
            resolve them cleanly — two Mondays it missed entirely, and three
            places where alternation broke next to a late-arrival day. Confirm
            them against the calendar and correct any that are wrong.
          </p>
          <ul className="mt-4 space-y-2">
            {unresolved.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-md border border-line bg-surface px-4 py-3 text-[15px]"
              >
                <span>{d.date.toISOString().slice(0, 10)}</span>
                <span className="text-text-muted">
                  {d.dayType ? `${d.dayType} day` : "No school"}
                  {d.variant !== "REGULAR" ? ` · ${d.variant}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-14">
        <h2 className="h2 text-[1.5rem]">Terms</h2>
        <ul className="mt-4 space-y-2">
          {terms.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded-md border border-line bg-surface px-4 py-3 text-[15px]"
            >
              <span>{t.name}</span>
              <span className="text-text-muted">
                {t.startDate.toISOString().slice(0, 10)} to{" "}
                {t.endDate.toISOString().slice(0, 10)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
