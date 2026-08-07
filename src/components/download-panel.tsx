import type { DesktopOs } from "@/lib/user-agent";

/**
 * The two desktop apps, and how to get past the warning each OS shows.
 *
 * Neither app is signed — signing costs $100–300 a year on Windows and $99 on
 * a Mac, and this project is free by design. So both operating systems will
 * accuse them of being suspicious, and the single most useful thing this page
 * does is say so first. A student who hits an unexplained "Windows protected
 * your PC" box assumes the download is broken, or worse, that it's malware.
 */

export function DownloadPanel({
  os,
  windowsUrl,
  macUrl,
}: {
  os: DesktopOs;
  windowsUrl?: string;
  macUrl?: string;
}) {
  const cards = [
    {
      id: "windows" as const,
      title: "Windows",
      size: "68 MB",
      url: windowsUrl,
      file: "Insight.exe",
      steps: [
        "Put it somewhere you won't delete by accident — not Downloads.",
        "Windows will say it's an unrecognised app. Click More info, then Run anyway. That happens once.",
        "The pairing window opens by itself. Paste the code from your Devices page.",
        "Right-click the Insight circle near the clock and turn on Start with Windows.",
      ],
    },
    {
      id: "mac" as const,
      title: "Mac",
      size: "320 KB",
      url: macUrl,
      file: "Insight.app",
      steps: [
        "Drag it to your Applications folder.",
        "Right-click it and choose Open, then Open again. Double-clicking gets refused — that's what an unsigned app looks like, and you only do this once.",
        "The pairing window opens by itself. Paste the code from your Devices page.",
        "Click the Insight circle in the menu bar and turn on Open at Login.",
      ],
    },
  ];

  const ordered = os === "mac" ? [cards[1], cards[0]] : cards;

  return (
    <div className="space-y-6">
      {ordered.map((card) => {
        const primary = card.id === os;

        return (
          <section
            key={card.id}
            className={`rounded-lg border bg-surface p-6 ${
              primary ? "border-sky/40" : "border-line"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="h3 text-[17px]">
                {card.title}
                {primary && (
                  <span className="ml-3 label text-sky">Looks like yours</span>
                )}
              </h2>
              <span className="label text-text-faint">
                {card.file} · {card.size}
              </span>
            </div>

            <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
              Records which apps you use while a session is running, and closes
              blocked ones when Focus Mode is on. No installer, no admin rights.
            </p>

            {card.url ? (
              <a
                href={card.url}
                className={`mt-5 inline-block px-6 py-3 text-[15px] ${
                  primary ? "btn-primary" : "btn-secondary text-text-muted"
                }`}
              >
                Download for {card.title}
              </a>
            ) : (
              // Never a dead button. A link that goes nowhere reads as a
              // broken site; a sentence explaining the wait doesn't.
              <p className="mt-5 rounded-md border border-line bg-bg px-4 py-3 text-[15px] text-text-muted">
                Not published yet. It&rsquo;s built and working — ask Kapilesh
                or Sahas for a copy in the meantime.
              </p>
            )}

            <ol className="mt-6 space-y-3 border-t border-line pt-5 text-[15px] leading-relaxed text-text-muted">
              {card.steps.map((step, i) => (
                <li key={step}>
                  <span className="text-text">{i + 1}.</span> {step}
                </li>
              ))}
            </ol>
          </section>
        );
      })}

      <section className="rounded-lg border border-line bg-surface p-6">
        <h2 className="h3 text-[17px]">What they record</h2>
        <ul className="mt-4 ml-5 list-disc space-y-2 text-[15px] leading-relaxed text-text-muted">
          <li>
            Only while a study session is running. Outside one the timer
            doesn&rsquo;t accumulate at all.
          </li>
          <li>
            App names — Word, Spotify, Steam. Never window titles, so never
            which document or which video.
          </li>
          <li>
            Ten minutes without touching the keyboard and the clock stops, back
            to your last keypress. Sleep and screen lock do the same.
          </li>
          <li>
            Browsers are left to the extension, so nothing is counted twice.
          </li>
        </ul>
        <p className="mt-4 text-[13px] leading-relaxed text-text-faint">
          Neither app is code-signed, which is why your computer warns about
          them. Signing costs a few hundred dollars a year and Insight is free.
        </p>
      </section>
    </div>
  );
}
