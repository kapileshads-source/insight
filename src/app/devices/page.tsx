import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrCreateUser } from "@/lib/user";
import { listDevices } from "@/app/actions/devices";
import { DevicesPanel } from "@/components/devices-panel";

export const metadata = { title: "Devices — Insight" };

export default async function DevicesPage() {
  const user = await getOrCreateUser();
  if (!user) redirect("/sign-in");

  const devices = await listDevices();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 pb-32">
      <header className="flex items-center justify-between border-b border-line py-6">
        <Link href="/dashboard" className="h3 text-[17px]">
          Insight
        </Link>
        <Link href="/settings" className="text-[14px] text-text-muted">
          Settings
        </Link>
      </header>

      <h1 className="h1 mt-12 text-[clamp(2rem,5vw,2.75rem)]">Devices</h1>
      <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-text-muted">
        Pairing a device lets it record laptop time during a session. It
        can&rsquo;t read anything you&rsquo;ve already logged — pairing only
        grants the ability to add.
      </p>

      <div className="mt-10">
        <DevicesPanel devices={devices} appUrl={appUrl} />
      </div>
    </div>
  );
}
