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
import { RecoveryKeyCard } from "@/components/recovery-key-card";
import { recoveryKeyStatus } from "@/app/actions/crypto";

export const metadata = { title: "Settings, Insight" };

export default async function SettingsPage() {
  const user = await getOrCreateUser();
  if (!user) redirect("/sign-in");

  const [muted, canvas, blocklist, recovery] = await Promise.all([
    getMutedCategories(),
    getCanvasStatus(),
    getBlocklistPrefs(),
    recoveryKeyStatus(),
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
          {/* First on the page when there isn't one. An account with no
              recovery key is one forgotten password away from losing its whole
              study log, which outranks every other setting here. */}
          <RecoveryKeyCard
            exists={recovery.exists}
            createdAt={recovery.createdAt?.toISOString() ?? null}
          />
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
