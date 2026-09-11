"use server";

import {
  updatePeriod,
  upsertCalendarDay,
  type AdminResult,
} from "@/app/actions/admin";

// Thin wrappers so the editor imports one module rather than reaching across
// the app for each action. The admin check lives inside the underlying
// functions, not here, a wrapper is not a security boundary.

export async function updatePeriodAction(input: unknown): Promise<AdminResult> {
  return updatePeriod(input);
}

export async function updateCalendarDayAction(
  input: unknown,
): Promise<AdminResult> {
  return upsertCalendarDay(input);
}
