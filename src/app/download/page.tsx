import Link from "next/link";
import { headers } from "next/headers";
import { detectOs } from "@/lib/user-agent";
import { DownloadPanel } from "@/components/download-panel";

export const metadata = { title: "Download — Insight" };

/// Public on purpose: a student sent this link by a friend should be able to
/// read it before deciding whether to sign up, and the apps are useless
/// without an account anyway.
export default async function DownloadPage() {
  const os = detectOs((await headers()).get("user-agent"));

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <Link href="/" className="h3 text-[17px]">
        Insight
      </Link>

      <h1 className="h1 mt-10 text-[clamp(2.25rem,6vw,3rem)]">
        The desktop apps.
      </h1>
      <p className="mt-5 text-[17px] leading-relaxed text-text-muted">
        Optional. Insight works without them — they add the half of your time
        that isn&rsquo;t in a browser, and let Focus Mode reach apps rather than
        only websites. On a phone, that means Android: iOS doesn&rsquo;t allow
        it, and never will without Apple&rsquo;s permission.
      </p>
      <p className="mt-4 text-[15px] text-text-faint">
        The browser extension is separate, and you&rsquo;ll find it on your{" "}
        <Link href="/devices" className="text-sky underline underline-offset-2">
          Devices page
        </Link>{" "}
        along with the pairing code both of these need.
      </p>

      <div className="mt-10">
        <DownloadPanel
          os={os}
          windowsUrl={process.env.NEXT_PUBLIC_DOWNLOAD_WINDOWS_URL}
          macUrl={process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL}
          androidUrl={process.env.NEXT_PUBLIC_DOWNLOAD_ANDROID_URL}
        />
      </div>
    </main>
  );
}
