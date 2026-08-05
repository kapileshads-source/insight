import Link from "next/link";
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
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 pb-32">
      <header className="flex items-center justify-between border-b border-line py-6">
        <Link href="/dashboard" className="h3 text-[17px]">
          Insight
        </Link>
        <span className="text-[14px] text-text-faint">{user.email}</span>
      </header>

      <h1 className="h1 mt-12 text-[clamp(2rem,5vw,2.75rem)]">Settings</h1>

      <div className="mt-10 space-y-6">
        <BlocklistEditor prefs={blocklist} />
        <SettingsPanel muted={muted} canvas={canvas} />
      </div>

      <p className="mt-12 text-[14px] leading-relaxed text-text-faint">
        How all of this works is written out on the{" "}
        <Link href="/privacy" className="text-sky underline underline-offset-2">
          privacy page
        </Link>
        .
      </p>
    </div>
  );
}
