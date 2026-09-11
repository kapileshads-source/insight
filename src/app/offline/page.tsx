export const metadata = { title: "Offline, Insight" };

/// Shown when a page load fails and there's no network.
///
/// Deliberately says nothing about the student. It is the one page that gets
/// cached on the device, so it has to be a page that would be dull to find on
/// a stolen phone.
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 py-16">
      <p className="label text-text-faint">Insight</p>

      <h1 className="h1 mt-6 text-[clamp(2rem,7vw,2.75rem)]">No connection.</h1>

      <p className="mt-5 text-[19px] leading-relaxed text-text-muted">
        Insight needs the network to read your data, because none of it is kept
        on this device, that&rsquo;s the same reason a lost phone doesn&rsquo;t
        lose anything.
      </p>

      <p className="mt-5 text-[17px] leading-relaxed text-text-muted">
        A session already running keeps running. Your laptop keeps counting and
        sends it when it can, so nothing is lost by being offline for a while.
      </p>

      <p className="mt-8 text-[15px] text-text-faint">
        Try again once you&rsquo;re back on wifi or data.
      </p>
    </main>
  );
}
