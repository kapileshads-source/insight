import { UnlockGate } from "@/components/unlock-gate";

/// The baseline is encrypted, so the key has to be in memory before the form
/// can show what's already saved. Same reason /dashboard is gated.
export default function BaselineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <UnlockGate>{children}</UnlockGate>;
}
