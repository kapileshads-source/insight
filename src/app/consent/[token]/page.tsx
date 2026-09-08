import Link from "next/link";
import { findConsentByToken } from "./actions";
import { ConsentForm } from "./consent-form";

export const metadata = {
  title: "Permission for your child — Insight",
  // The token in this URL is the credential — possession of it is what
  // authorises consent. Suppress the Referer header so it can never ride
  // along to another site, and keep it out of search results.
  referrer: "no-referrer" as const,
  robots: { index: false, follow: false },
};

// Never cached or prerendered. A page carrying a credential must not sit in a
// shared cache, and its state changes the moment a parent answers.
export const dynamic = "force-dynamic";

export default async function ConsentPage(props: PageProps<"/consent/[token]">) {
  const { token } = await props.params;
  const consent = await findConsentByToken(token);

  if (!consent) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-16">
        <h1 className="h1 text-[clamp(1.75rem,4.5vw,2.25rem)]">
          This link doesn&rsquo;t work.
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-text-muted">
          It may have been replaced by a newer one — if your child asked again,
          check for a more recent email. Otherwise write to{" "}
          <a
            href="mailto:kapilesh.rajaravi@gmail.com"
            className="text-accent underline underline-offset-2"
          >
            kapilesh.rajaravi@gmail.com
          </a>
          .
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <Link href="/" className="h3 text-[17px]">
        Insight
      </Link>

      <h1 className="h1 mt-10 text-[clamp(2rem,5.5vw,2.75rem)]">
        Can your child use Insight?
      </h1>

      <p className="mt-5 text-[17px] leading-relaxed text-text-muted">
        <span className="text-text">{consent.user.email}</span> signed up for
        Insight, a study tool for Frisco ISD students. They&rsquo;re under 13,
        so the law requires your permission before we collect anything —{" "}
        <span className="text-text">
          and until you give it, we have collected nothing.
        </span>
      </p>

      <div className="mt-9 rounded-lg border border-line bg-surface p-6">
        <h2 className="h3 text-[17px]">The short version</h2>
        <ul className="mt-4 space-y-3 text-[16px] leading-relaxed text-text-muted">
          <li>
            <span className="text-text">Nobody can read their data.</span>{" "}
            It&rsquo;s encrypted on their device with a key made from their
            password. We hold scrambled data and no way to unscramble it.
          </li>
          <li>
            <span className="text-text">No location tracking.</span> They pick
            &ldquo;Library&rdquo; or &ldquo;Home&rdquo; from a list. No GPS.
          </li>
          <li>
            <span className="text-text">The school isn&rsquo;t involved.</span>{" "}
            Frisco ISD sends us nothing and can&rsquo;t see any of this.
          </li>
          <li>
            <span className="text-text">Nothing is sold or advertised.</span>{" "}
            We couldn&rsquo;t sell it if we wanted to — we can&rsquo;t read it.
          </li>
          <li>
            <span className="text-text">You can change your mind</span> at any
            time, from this same link.
          </li>
        </ul>
        <p className="mt-5 text-[15px] text-text-faint">
          Longer answers on the{" "}
          <Link
            href="/privacy/parents"
            className="text-accent underline underline-offset-2"
          >
            page for parents
          </Link>
          .
        </p>
      </div>

      <ConsentForm
        token={token}
        childEmail={consent.user.email}
        alreadyConfirmed={Boolean(consent.confirmedAt)}
      />
    </main>
  );
}
