/// Direction now lives inside the encrypted payload rather than in a database
/// column, so it's a plain client-side type. The server never sees it.
export type InsightDirection = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

export type InsightRowProps = {
  /// The stat, stated correlationally. Never phrased as cause.
  statement: string;
  direction: InsightDirection;
  /// Signed percentage-point difference from the student's own baseline.
  magnitude: number;
  sampleSize: number;
  /// How many of the comparable sessions the pattern held for.
  heldIn?: { held: number; of: number };
  /// Paired with every negative-leaning insight. Optional on positive ones.
  suggestion?: string;
  /// False while the insight is still below the sample-size gate.
  isSurfaced: boolean;
  /// Set on the first row of a group, or when the row stands alone in a panel.
  hideTopRule?: boolean;
};

const TONE: Record<InsightDirection, string> = {
  POSITIVE: "text-up",
  NEGATIVE: "text-down",
  NEUTRAL: "text-flat",
};

/// A single insight, set as a row rather than a card. A grid of cards is the
/// most recognizable machine-generated layout there is, and rows also let the
/// figures align down the left edge, which is the actual reason to prefer them.
export function InsightRow({
  statement,
  direction,
  magnitude,
  sampleSize,
  heldIn,
  suggestion,
  isSurfaced,
  hideTopRule = false,
}: InsightRowProps) {
  // True minus, not a hyphen, so negatives sit at the same optical weight as
  // the plus signs above and below them in the column.
  const sign = magnitude > 0 ? "+" : "−";
  const value = Math.abs(magnitude).toFixed(0);

  return (
    <div
      className={`grid grid-cols-[4.25rem_1fr] gap-x-5 py-6 sm:grid-cols-[5.5rem_1fr] sm:gap-x-8 ${
        hideTopRule ? "" : "border-t border-line"
      }`}
    >
      {/* Right-aligned so the percent marks form a clean edge down the column,
          with the sign and unit set smaller than the number they modify. */}
      <div
        className={`figure pt-1 text-right text-[1.75rem] sm:text-[2.125rem] ${
          isSurfaced ? TONE[direction] : "text-text-faint"
        }`}
      >
        <span className="text-[0.58em] align-[0.2em]">{sign}</span>
        {value}
        <span className="text-[0.58em] align-[0.2em]">%</span>
      </div>

      <div className="min-w-0">
        <p
          className={`text-[17px] leading-snug ${
            isSurfaced ? "text-text" : "text-text-muted"
          }`}
        >
          {statement}
        </p>

        <p className="mt-2 text-[14px] text-text-faint">
          {isSurfaced
            ? heldIn
              ? `${sampleSize} sessions, held in ${heldIn.held} of ${heldIn.of}`
              : `${sampleSize} sessions`
            : `${sampleSize} sessions so far, not enough to say yet`}
        </p>

        {suggestion && (
          <p className="mt-4 rounded-md bg-accent-soft px-4 py-3.5 text-[15px] leading-relaxed text-text-muted">
            {suggestion}
          </p>
        )}
      </div>
    </div>
  );
}
