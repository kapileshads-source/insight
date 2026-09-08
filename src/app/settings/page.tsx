import Link from "next/link";
import { AppNav, PageTitle } from "@/components/chrome";
import { redirect } from "next/navigation";
import { getOrCreateUser } from "@/lib/user";
import {
  getBlocklistPrefs,
  getMutedCategories,
} from "@/app/actions/settings";
import { getCanvasStatus } from "@/app/actions/canvas";
import { SettingsPanel } from "@/components/settings-panel";
import { BlocklistEditor } from "@/components/blocklist-editor";

export const metadata = { title: "Settings — Insight" };

export default async function SettingsPage() {
  const user = await getOrCreateUser();
  if (!user) redirect("/sign-in");

  const [muted, canvas, blocklist] = await Promise.all([
    getMutedCategories(),
    getCanvasStatus(),
    getBlocklistPrefs(),
  ]);

  return (
    <>
      <AppNav email={user.email} />

      <div className="mx-auto w-full max-w-3xl flex-1 px-6 pb-32">
        <PageTitle
          eyebrow="Your account"
          title="Settings"
          lede="What Insight blocks during a session, which reminders it sends, and which kinds of insight it stays quiet about."
        />

        <div className="mt-10 space-y-6">
          <BlocklistEditor prefs={blocklist} />
          <SettingsPanel muted={muted} canvas={canvas} />
      </div>

      <p className="mt-12 text-[14px] leading-relaxed text-text-faint">
        How all of this works is written out on the{" "}
        <Link href="/privacy" className="text-accent underline underline-offset-2">
          privacy page
        </Link>
        .
      </p>
      </div>
    </>
  );
}
