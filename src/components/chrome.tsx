import Link from "next/link";

/**
 * The shared frame every page is built in.
 *
 * Until now each page drew its own header, usually the word "Insight" linking
 * to the dashboard, and its own title block, with the spacing retyped each
 * time. That is why the app looked like twenty pages rather than one product,
 * and why the landing page redesign didn't reach any of them.
 *
 * There are deliberately **two** navs, not one:
 *
 * - `SiteNav` is for pages a stranger can reach. It points outward, to the
 *   things someone deciding whether to sign up needs: privacy, downloads,
 *   sample data, and a way in.
 * - `AppNav` is for pages you have to be signed in to see. It points inward,
 *   between the parts of the app, and it carries the signed-in email so it is
 *   always obvious which account is being looked at, which matters more here
 *   than in most apps, because the demo account and a real one are otherwise
 *   indistinguishable once both are full of data.
 *
 * A single nav covering both cases would have to hide half its links half the
 * time, and the two audiences want opposite things from it.
 *
 * **The one rule about atmosphere.** `PageHero` is paper, lit, with a ruled
 * grid, the landing page's treatment, and it belongs on pages that are read
 * once. Pages you open every day get `PageTitle` on flat midnight instead. A
 * gradient behind a table of grades is harder to read and gets no less tiring
 * the fiftieth time you see it. This is the same split the `mk-` prefix
 * enforces in `globals.css`.
 */

/// Two plotted points and the line through them. A logo that is a tiny chart,
/// for the same reason the landing page's hero is a chart, and it stays
/// legible at 20px, which a glyph or a gradient blob does not.
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <rect x="1" y="1" width="22" height="22" rx="6" stroke="var(--line-hi)" />
      <path
        d="M5 17.5 L19 7"
        stroke="var(--accent-deep)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="7.5" cy="15.5" r="2.6" fill="var(--ember)" />
      <circle cx="16.5" cy="8.5" r="2.6" fill="var(--accent)" />
    </svg>
  );
}

/// The wordmark, used by both navs so they can't drift apart.
function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <Mark />
      <span className="h3 text-[17px]">Insight</span>
    </Link>
  );
}

const SITE_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/download", label: "Download" },
  { href: "/demo", label: "Sample data" },
];

/**
 * Public nav.
 *
 * Stays midnight over the paper heroes rather than going transparent. A nav
 * that inverts as you scroll past alternating light and dark bands is a
 * chance to render unreadable text on its own background at every boundary,
 * and it buys nothing.
 */
export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <Wordmark />

        <nav className="hidden items-center gap-7 text-[15px] text-text-muted sm:flex">
          {SITE_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-text">
              {l.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/dashboard"
          className="btn-primary px-4 py-2 text-[15px] sm:px-5"
        >
          Open
        </Link>
      </div>
    </header>
  );
}

/// The nav, in the order a student uses them. Settings is not in this list,
/// it is the gear at the end, because it is the one destination nobody needs
/// a word for and it was taking the same width as the pages that carry work.
const APP_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/study", label: "Study" },
  { href: "/work", label: "Work" },
  { href: "/gpa", label: "GPA" },
  { href: "/logs", label: "Insights" },
  { href: "/canvas", label: "Canvas" },
  { href: "/hac", label: "HAC" },
  { href: "/devices", label: "Devices" },
];

/**
 * The five destinations that get a bottom bar on a phone.
 *
 * `APP_LINKS` has eight, which is two too many for a tab bar and includes
 * three (Canvas, HAC, Devices) that are setup rather than daily use. Those
 * stay reachable from Settings and from the pages that need them.
 *
 * This exists because the top nav is `hidden md:flex`, so on a phone the app
 * had no navigation whatsoever: a wordmark, an email, and no way to reach any
 * other page. The site was unusable on the device most students hold most of
 * the time, and it took someone opening it on their phone to notice.
 */
const TAB_LINKS = [
  { href: "/dashboard", label: "Home", icon: "M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5" },
  { href: "/study", label: "Study", icon: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  { href: "/work", label: "Work", icon: "M4 5h16v15H4zM8 3v4M16 3v4M8 12h8M8 16h5" },
  { href: "/gpa", label: "GPA", icon: "M4 19V9M10 19V5M16 19v-6M22 19H2" },
  { href: "/logs", label: "Insights", icon: "M4 18l5-6 4 3 7-8" },
];

/// Drawn rather than fetched, so it costs no request and cannot 404, and it
/// inherits `currentColor` so it dims and brightens with the link beside it.
function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/**
 * Signed-in nav.
 *
 * The email is shown at every width, not hidden on a phone the way the links
 * are. Which account you are in is the one piece of state that changes what
 * every number on the screen means, and a demo account full of invented scores
 * looks exactly like a real one.
 */
export function AppNav({ email }: { email?: string | null }) {
  return (
    <>
      <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-3.5">
        <Wordmark href="/dashboard" />

        <nav className="hidden items-center gap-6 text-[15px] text-text-muted md:flex">
          {APP_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="transition-colors duration-150 hover:text-text"
            >
              {l.label}
            </Link>
          ))}
          {/* Labelled for a screen reader, which cannot see a gear. */}
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className="transition-colors duration-150 hover:text-text"
          >
            <GearIcon />
          </Link>
        </nav>

        {/* The gear moves into the top bar on a phone, where the nav it
            normally sits in is hidden and the bottom tabs have no room for it. */}
        <Link
          href="/settings"
          aria-label="Settings"
          title="Settings"
          className="-m-2.5 p-2.5 text-text-muted transition-colors duration-150 hover:text-text md:hidden"
        >
          <GearIcon />
        </Link>

        {/* The email was dead text for the life of the app, which meant the
            only way off an account was clearing site data: there was no
            sign-out anywhere. It is a link to Settings now, where signing out
            lives, because the address you are signed in as is the obvious
            thing to reach for when you want to stop being signed in as it. */}
        {email && (
          <Link
            href="/settings"
            title="Account settings"
            className="max-w-[9rem] truncate text-[13px] text-text-faint transition-colors duration-150 hover:text-text-muted sm:max-w-none sm:text-[14px]"
          >
            {email}
          </Link>
        )}
        </div>
      </header>

      {/* The bottom bar, phones only.
      
          A tab bar rather than a hamburger because this is a tool opened for
          twenty seconds at a time: what is due, what was marked, start a
          session. A menu that has to be opened first puts a tap in front of
          every one of those.
      
          `pb-[env(safe-area-inset-bottom)]` is what keeps the labels above the
          home indicator on a notched iPhone, which is most of them. Pages carry
          `pb-32`, which is already enough room to scroll clear of this. */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <ul className="mx-auto flex max-w-md items-stretch justify-between px-2">
          {TAB_LINKS.map((t) => (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className="flex flex-col items-center gap-1 px-1 py-2.5 text-text-faint transition-colors duration-150 active:text-accent"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="21"
                  height="21"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={t.icon} />
                </svg>
                <span className="text-[11px] leading-none">{t.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

/**
 * The title band on a public page: paper, lit, ruled.
 *
 * `eyebrow` is the small ember label above the heading. `lede` is the one
 * paragraph that says what the page is for before any detail arrives.
 */
export function PageHero({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="mk-paper relative overflow-hidden text-on-light">
      <div className="mk-dotgrid absolute inset-0" aria-hidden />
      <div className="relative mx-auto w-full max-w-4xl px-6 pb-16 pt-16 sm:pt-20">
        {eyebrow && <span className="label text-ember-deep">{eyebrow}</span>}
        <h1
          className={`h1 max-w-3xl text-[clamp(2.2rem,6vw,3.6rem)] ${
            eyebrow ? "mt-4" : ""
          }`}
        >
          {title}
        </h1>
        {lede && (
          <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-on-light-muted sm:text-[19px]">
            {lede}
          </p>
        )}
        {children}
      </div>
    </section>
  );
}

/**
 * The title block on a signed-in page. Flat midnight, no atmosphere.
 *
 * Same type scale as `PageHero` so the two read as one family, and none of the
 * lighting, because this is a screen someone opens daily.
 */
export function PageTitle({
  eyebrow,
  title,
  lede,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
}) {
  return (
    <div className="border-b border-line pb-10 pt-12">
      {eyebrow && <span className="label text-ember">{eyebrow}</span>}
      <h1
        className={`h1 text-[clamp(2rem,5vw,2.9rem)] ${eyebrow ? "mt-3" : ""}`}
      >
        {title}
      </h1>
      {lede && (
        <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-text-muted">
          {lede}
        </p>
      )}
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto w-full max-w-6xl px-6 py-14">
        <div className="flex flex-wrap items-start justify-between gap-10">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <Mark size={20} />
              <span className="h3 text-[16px]">Insight</span>
            </div>
            <p className="mt-4 text-[14px] leading-relaxed text-text-faint">
              Insight compares your data against your own averages. It describes
              what happened together, never what caused what.
            </p>
          </div>

          <nav className="flex gap-14 text-[15px]">
            <div>
              <p className="label text-text-faint">Product</p>
              <ul className="mt-3 space-y-2 text-text-muted">
                <li>
                  <Link href="/dashboard" className="hover:text-text">
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link href="/download" className="hover:text-text">
                    Download
                  </Link>
                </li>
                <li>
                  <Link href="/demo" className="hover:text-text">
                    Sample data
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="label text-text-faint">About</p>
              <ul className="mt-3 space-y-2 text-text-muted">
                <li>
                  <Link href="/privacy" className="hover:text-text">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link href="/iphone" className="hover:text-text">
                    iPhone setup
                  </Link>
                </li>
                <li>
                  <Link href="/sign-in" className="hover:text-text">
                    Sign in
                  </Link>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <p className="mt-12 text-[13px] text-text-faint">
          © 2026 Insight · Built in Frisco ISD
        </p>
      </div>
    </footer>
  );
}
