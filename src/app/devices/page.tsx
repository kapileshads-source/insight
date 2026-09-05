import { AppNav, PageTitle } from "@/components/chrome";
import { redirect } from "next/navigation";
import { getOrCreateUser } from "@/lib/user";
import { listDevices } from "@/app/actions/devices";
import { DevicesPanel } from "@/components/devices-panel";
import { NudgeOptIn } from "@/components/nudge-optin";

export const metadata = { title: "Devices — Insight" };

export default async function DevicesPage() {
  const user = await getOrCreateUser();
  if (!user) redirect("/sign-in");

  const devices = await listDevices();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <>
      <AppNav email={user.email} />

      <div className="mx-auto w-full max-w-3xl flex-1 px-6 pb-32">
        <PageTitle
          eyebrow="Pairing"
          title="Devices"
          lede="Pairing a device lets it record laptop time during a session. It can&rsquo;t read anything you&rsquo;ve already logged — pairing only grants the ability to add."
        />

        <div className="mt-10">
          <DevicesPanel devices={devices} appUrl={appUrl} />

          <NudgeOptIn />
      </div>
      </div>
    </>
  );
}
