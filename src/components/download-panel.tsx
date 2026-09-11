import type { DesktopOs } from "@/lib/user-agent";

/**
 * The two desktop apps, and how to get past the warning each OS shows.
 *
 * Neither app is signed, signing costs $100–300 a year on Windows and $99 on
 * a Mac, and this project is free by design. So both operating systems will
 * accuse them of being suspicious, and the single most useful thing this page
 * does is say so first. A student who hits an unexplained "Windows protected
 * your PC" box assumes the download is broken, or worse, that it's malware.
 */

export function DownloadPanel({
  os,
  windowsUrl,
  macUrl,
  androidUrl,
  extensionUrl,
}: {
  os: DesktopOs;
  windowsUrl?: string;
  macUrl?: string;
  androidUrl?: string;
  extensionUrl?: string;
}) {
  const cards = [
    {
      id: "windows" as const,
      title: "Windows",
      size: "68 MB",
      url: windowsUrl,
      file: "Insight.exe",
      steps: [
        "Put it somewhere you won't delete by accident, not Downloads.",
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
        "Right-click it and choose Open, then Open again. Double-clicking gets refused, that's what an unsigned app looks like, and you only do this once.",
        "The pairing window opens by itself. Paste the code from your Devices page.",
        "Click the Insight circle in the menu bar and turn on Open at Login.",
      ],
    },
    {
      id: "android" as const,
      title: "Android",
      size: "8 MB",
      url: androidUrl,
      file: "Insight.apk",
      steps: [
        "Tap the file. Android will say installing from unknown sources is blocked, tap Settings in that prompt and allow it. Once only.",
        "Open Insight and paste the code from your Devices page.",
        "It asks for usage access, in Settings. That's the permission that lets it see which app is in front, app names only, and only while a session runs.",
        "Then it asks to draw over other apps. That one is what lets Focus Mode actually block something, and you can skip it if you only want the counting.",
      ],
    },
    {
      id: "extension" as const,
      title: "Chrome extension",
      size: "12 KB",
      url: extensionUrl,
      file: "Chrome Web Store",
      steps: [
        "Click Add to Chrome, then Add extension when it asks.",
        "Click the Insight icon in the toolbar and paste the code from your Devices page.",
        "That's it. It counts sites only while a session is running, and does nothing at any other time.",
      ],
    },
  ];

  // Whichever one you're on goes first; the rest keep their order.
  const ordered = [
    ...cards.filter((c) => c.id === os),
    ...cards.filter((c) => c.id !== os),
  ];

  return (
    <div className="space-y-6">
      {ordered.map((card) => {
        const primary = card.id === os;

        return (
          <section
            key={card.id}
            className={`rounded-lg border bg-surface p-6 ${
              primary ? "border-accent/40" : "border-line"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="h3 text-[17px]">
                {card.title}
                {primary && (
                  <span className="ml-3 label text-accent">Looks like yours</span>
                )}
              </h2>
              <span className="label text-text-faint">
                {card.file} · {card.size}
              </span>
            </div>

            <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
              {card.id === "extension"
                ? "Counts the sites you use during a session, and blocks the distracting ones when Focus Mode is on. It never sees a password and holds no encryption key."
                : card.id === "android"
                  ? "Records which apps you use while a session is running, and puts a screen in front of blocked ones when Focus Mode is on. The only phone that can do either."
                  : "Records which apps you use while a session is running, and closes blocked ones when Focus Mode is on. No installer, no admin rights."}
            </p>

            {card.url ? (
              <a
                href={card.url}
                className={`mt-5 inline-block px-6 py-3 text-[15px] ${
                  primary ? "btn-primary" : "btn-secondary text-text-muted"
                }`}
              >
                {card.id === "extension"
                  ? "Add to Chrome"
                  : `Download for ${card.title}`}
              </a>
            ) : (
              // Never a dead button. A link that goes nowhere reads as a
              // broken site; a sentence explaining the wait doesn't.
              <p className="mt-5 rounded-md border border-line bg-bg px-4 py-3 text-[15px] text-text-muted">
                {card.id === "extension"
                  ? "Waiting on Chrome Web Store review. Until it clears, the Devices page has the manual route."
                  : "Not published yet. It\u2019s built and working \u2014 ask Kapilesh or Sahas for a copy in the meantime."}
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
            App names, Word, Spotify, Steam. Never window titles, so never
            which document or which video.
          </li>
          <li>
            Ten minutes without touching the keyboard and the clock stops, back
            to your last keypress. Sleep and screen lock do the same.
          </li>
          <li>
            On Windows and Mac, browsers are left to the extension so nothing
            is counted twice. On Android they&rsquo;re counted here, because
            Chrome for Android can&rsquo;t run the extension, and you can
            block a browser by name, though only the whole thing. Telling
            YouTube from Wikipedia inside it would mean reading your screen,
            which nothing here does.
          </li>
          <li>
            On Android, nothing counts while the screen is off, a phone in a
            pocket names a foreground app, and that isn&rsquo;t studying.
          </li>
        </ul>
        <p className="mt-4 text-[13px] leading-relaxed text-text-faint">
          None of these are signed by a paid developer account, which is why
          each system warns about them. Signing costs a few hundred dollars a
          year and Insight is free.
        </p>
      </section>
    </div>
  );
}
