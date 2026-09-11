/**
 * The shapes that live inside `payloadCipher` on each table.
 *
 * These types exist only in the browser. The server stores the JSON encrypted
 * and has no idea what fields are in it, which is also why adding a field here
 * needs no migration.
 */

export const LOCATIONS = [
  "LIBRARY",
  "HOME",
  "CLASSROOM",
  "COFFEE_SHOP",
  "OTHER",
] as const;
export type Location = (typeof LOCATIONS)[number];

export const LOCATION_LABELS: Record<Location, string> = {
  LIBRARY: "Library",
  HOME: "Home",
  CLASSROOM: "Classroom",
  COFFEE_SHOP: "Coffee shop",
  OTHER: "Somewhere else",
};

// Four options. Fewer and there's nothing to correlate against; more and
// nobody picks consistently, which is the same as having no data.
export const NOISE_LEVELS = ["SILENT", "QUIET", "SOME", "LOUD"] as const;
export type NoiseLevel = (typeof NOISE_LEVELS)[number];

export const NOISE_LABELS: Record<NoiseLevel, string> = {
  SILENT: "Silent",
  QUIET: "Quiet",
  SOME: "Some noise",
  LOUD: "Loud",
};

export type SessionPayload = {
  subject?: string;
  location?: Location;
  noise?: NoiseLevel;
  /// 1–5, self-reported.
  stress?: number;
  wasCram?: boolean;
  /// Minutes, derived from the timestamps at stop time and stored so the
  /// insight engine doesn't recompute it for every row on every load.
  durationMinutes: number;
};

export type SleepPayload = {
  hours: number;
};

export type ScreenTimePayload = {
  minutes: number;
  /// What OCR originally read, kept so a misparse can be diagnosed later.
  ocrRawValue?: string;
  editedByUser?: boolean;
};

export type OutcomePayload = {
  /// Free text, "Unit 6 test", since a Canvas assignment may not exist.
  label?: string;
  subject?: string;
  pointsEarned: number;
  pointsPossible: number;
  /// Denormalised because every comparison in the insight engine is between
  /// assessments with different point totals.
  percentage: number;
};

export type ProfilePayload = {
  /// Minutes from midnight, so "11:20 PM" is 1400 and comparisons are integer
  /// arithmetic, the same reason bell schedules are stored this way.
  usualSleepMinutes?: number;
  usualWakeMinutes?: number;
  usualNoise?: NoiseLevel;
  usualLocation?: Location;
};

/// "23:20" -> 1400. Null for anything an `<input type="time">` wouldn't emit.
export function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/// 1400 -> "23:20", which is what an `<input type="time">` wants back.
export function minutesToTimeValue(minutes: number): string {
  const clamped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/// How long a night is, in minutes, given a bedtime and a wake time.
///
/// Bedtimes cross midnight and wake times don't, so plain subtraction gives a
/// negative night, which would have shown a student sleeping minus four
/// hours. Wrapping is the normal case here, not the edge case.
export function nightLength(sleepMinutes: number, wakeMinutes: number): number {
  const raw = wakeMinutes - sleepMinutes;
  return raw > 0 ? raw : raw + 1440;
}

/// "1400" -> "11:20 PM"
export function formatMinutes(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/// "1h 47m", or "47m" when there are no hours to show.
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
