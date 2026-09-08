import { redirect } from "next/navigation";

import { getOrCreateUser } from "@/lib/user";
import { RecoverFlow } from "@/components/recover-flow";

export const metadata = { title: "Recover your data — Insight" };

/**
 * Forgetting the encryption password.
 *
 * Behind the sign-in, not public. The person here is locked out of their *data*,
 * not their account — Clerk still knows who they are, and Clerk has its own
 * forgot-password for the login itself. Conflating the two is the mistake this
 * page exists to avoid: a student who cannot get past the unlock screen will
 * reset their Clerk password five times before working out it was never the
 * one being asked for.
 *
 * Deliberately not wrapped in `UnlockGate`. Everything else behind the sign-in
 * asks for the password before it renders, which for this page would be a
 * closed loop.
 */
export default async function RecoverPage() {
  const user = await getOrCreateUser();
  if (!user) redirect("/sign-in");

  return <RecoverFlow />;
}
