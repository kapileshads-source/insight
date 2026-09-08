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
 * There used to be two ways in, and the extension one was better: it read HAC
 * with the session already in the browser and never saw a password. It was
 * removed because it only ever worked on desktop Chrome, which meant every HAC
 * bug had to be found and fixed twice for the smaller half of the users.
 *
 * That trade is real and this page does not pretend otherwise. Using HAC now
 * means storing the password, which is the one place in the app where Insight
 * can read something of a student's — so the box that asks says so before the
 * fields rather than after.
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
          <h2 className="h3 text-[17px]">What this costs you</h2>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-text-muted">
            Your HAC password is stored, encrypted, so your gradebook can be
            fetched when you are not looking. That means Insight can open your
            gradebook — the only part of the app where that is true. Everything
            else stays encrypted with a key we do not have.
          </p>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-text-muted">
            It works on a phone, which is the reason it exists. It is never put
            in a web address or written to a log, and disconnecting deletes it.
          </p>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-text-faint">
            If your HAC password is also your school email password, change one
            of them first.
          </p>
        </section>
      </div>
    </>
  );
}
