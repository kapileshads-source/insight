import Link from "next/link";
import { PageHero, SiteFooter, SiteNav } from "@/components/chrome";
import { headers } from "next/headers";
import { detectOs } from "@/lib/user-agent";
import { DownloadPanel } from "@/components/download-panel";

export const metadata = { title: "Download, Insight" };

/// Public on purpose: a student sent this link by a friend should be able to
/// read it before deciding whether to sign up, and the apps are useless
/// without an account anyway.
export default async function DownloadPage() {
  const os = detectOs((await headers()).get("user-agent"));

  return (
    <main className="flex-1">
      <SiteNav />

      <PageHero
        eyebrow="Optional"
        title="Get the apps."
        lede="Optional. Insight works without them, they add the half of your time that isn’t in a browser, and let Focus Mode reach apps rather than only websites. On a phone, that means Android: iOS doesn’t allow it, and never will without Apple’s permission."
      />

      <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <p className="mt-4 text-[15px] text-text-faint">
        On an iPhone there&rsquo;s nothing to download, Apple doesn&rsquo;t
        allow it. There is{" "}
        <Link href="/iphone" className="text-accent underline underline-offset-2">
          a setup worth ten minutes
        </Link>{" "}
        instead.
      </p>
      <p className="mt-4 text-[15px] text-text-faint">
        Everything needs a pairing code, which is on your{" "}
        <Link href="/devices" className="text-accent underline underline-offset-2">
          Devices page
        </Link>
        .
      </p>

      <div className="mt-10">
        <DownloadPanel
          os={os}
          windowsUrl={process.env.NEXT_PUBLIC_DOWNLOAD_WINDOWS_URL}
          macUrl={process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL}
          androidUrl={process.env.NEXT_PUBLIC_DOWNLOAD_ANDROID_URL}
          extensionUrl={process.env.NEXT_PUBLIC_EXTENSION_URL}
        />
      </div>
      </div>

      <SiteFooter />
    </main>
  );
}
