import { redirect } from "next/navigation";

import { getOrCreateUser } from "@/lib/user";
import { hacConnectionStatus } from "@/app/actions/hac";
import { AppNav, PageTitle } from "@/components/chrome";
import { HacConnect } from "@/components/hac-connect";
import { HacSync } from "@/components/hac-sync";
import { TranscriptSync } from "@/components/transcript-sync";

export const metadata = { title: "Home Access Center — Insight" };

/**
 * Home Access Center, on its own page.
 *
 * It lived under `/canvas`, which was wrong twice over: HAC is a different
 * gradebook from a different vendor, and a student looking for their real
 * grades had no reason to open a page named after the one they were not
 * looking for. The credential form in particular went unnoticed there.
 *
 * The order on this page is the recommendation. The extension is first because
 * it never sees a password; credentials are second because they are the
 * fallback that makes a phone work. Anyone who reads top to bottom is offered
 * the safer option before the easier one.
 */
export default async function HacPage() {
  const user = await getOrCreateUser();
  if (!user) redirect("/sign-in");

  const hac = await hacConnectionStatus();

  return (
    <>
      <AppNav email={user.email} />

      <div className="mx-auto w-full max-w-3xl flex-1 px-6 pb-32">
        <PageTitle
          eyebrow="Gradebook"
          title="Home Access Center"
          lede="Your real grades — the ones the school posts. Canvas has assignments and due dates; HAC has what you actually scored, so Insight wants both."
        />

        <div className="mt-10">
          <HacSync />

          <HacConnect
            connected={hac.connected}
            username={hac.username}
            disconnected={hac.disconnected}
          />

          {hac.connected && <TranscriptSync />}
        </div>

        <section className="mt-10">
          <h2 className="h3 text-[17px]">Which one should I use?</h2>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-text-muted">
            The extension, if you have a computer. It reads HAC with the login
            already in your browser, so no password is typed, stored or sent —
            and there is nothing for us to lose if we are ever broken into.
          </p>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-text-muted">
            Signing in with your password is for phones, where no extension can
            run. It works everywhere and on its own, and the cost is that
            Insight can then open your gradebook. That is the only part of the
            app where that is true, and the box above says so before it asks.
          </p>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-text-faint">
            You can use both. If the extension is there it is what gets used,
            and the password is only a fallback.
          </p>
        </section>
      </div>
    </>
  );
}
