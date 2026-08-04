import { UnlockGate } from "@/components/unlock-gate";

/// Everything under /dashboard reads encrypted data, so the key has to be in
/// memory before any of it renders. Gating at the layout means no page below
/// needs its own locked state.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <UnlockGate>{children}</UnlockGate>;
}
