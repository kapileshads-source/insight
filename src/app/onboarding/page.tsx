import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { MINIMUM_AGE, getOrCreateUser, nextOnboardingStep } from "@/lib/user";
import {
  BirthDateStep,
  DevicesStep,
  ParentConsentStep,
  PasswordStep,
  SchoolStep,
  TooYoungStep,
} from "@/components/onboarding/steps";

export const metadata = { title: "Set up — Insight" };

export default async function OnboardingPage() {
  const user = await getOrCreateUser();
  if (!user) redirect("/sign-in");

  const step = nextOnboardingStep(user);

  switch (step) {
    case "BIRTHDATE":
      return <BirthDateStep />;

    case "TOO_YOUNG":
      return <TooYoungStep minimumAge={MINIMUM_AGE} />;

    case "AWAITING_CONSENT":
      return <ParentConsentStep sentTo={user.parentConsent?.parentEmail} />;

    case "PASSWORD":
      return <PasswordStep />;

    case "SCHOOL": {
      const schools = await db.school.findMany({
        select: { id: true, name: true, type: true },
        orderBy: { name: "asc" },
      });
      return <SchoolStep schools={schools} />;
    }

    case "DEVICES":
      return <DevicesStep />;

    case "DONE":
      redirect("/dashboard");
  }
}
