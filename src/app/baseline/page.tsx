import { AppNav, PageTitle } from "@/components/chrome";
import { redirect } from "next/navigation";
import { getOrCreateUser } from "@/lib/user";
import { getProfile } from "@/app/actions/profile";
import { BaselineForm } from "@/components/baseline-form";

export const metadata = { title: "Your usual week, Insight" };

export default async function BaselinePage() {
  const user = await getOrCreateUser();
  if (!user) redirect("/sign-in");

  const profile = await getProfile();

  return (
    <>
      <AppNav email={user.email} />

      <div className="mx-auto w-full max-w-3xl flex-1 px-6 pb-32">
        <PageTitle
          eyebrow="Your normal"
          title="Your usual week"
          lede="Insight never compares you against a general target, there is no &quot;eight hours&quot; anywhere in it. Everything is measured against your own normal, and this is where you say what that is."
        />

        <div className="mt-10">
          <BaselineForm profile={profile} />
      </div>
      </div>
    </>
  );
}
