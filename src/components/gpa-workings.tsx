"use client";

import { GpaDetail } from "@/components/gpa-card";
import { useGradebook } from "@/components/gradebook-data";

/// Waits for the decrypt, then hands over. Exists only because `/gpa` is a
/// server component and the gradebook can only be read in the browser.
export function GpaWorkings() {
  const data = useGradebook();

  if (data.status === "locked") return null;
  if (data.status === "loading") {
    return <p className="text-[16px] text-text-muted">Reading your grades…</p>;
  }
  if (data.status === "failed") {
    return (
      <p className="max-w-xl text-[16px] leading-relaxed text-text-muted">
        Your grades couldn&rsquo;t be read with your current password. Syncing
        your gradebook again will rewrite them.
      </p>
    );
  }

  return (
    <GpaDetail
      courses={data.gpa}
      past={data.past}
      priorCount={data.priorCount}
    />
  );
}
