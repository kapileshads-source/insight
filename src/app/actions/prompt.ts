"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/user";
import { decidePrompt, localDateKey, type PeriodSlot } from "@/lib/schedule";

export type PromptState =
  | { show: false }
  | { show: true; kind: "PERIODIC"; sequence: number }
  | { show: true; kind: "POST_TERM" };

/// Should the "anything else not in Canvas?" prompt appear right now?
///
/// The interval is per campus: high schools ask once a block, middle schools
/// once every two periods. Those land close together in practice — a 90-minute
/// block against two 47-minute periods — which is why one rule covers both.
export async function shouldPrompt(): Promise<PromptState> {
  const user = await getOrCreateUser();
  if (!user?.schoolId) return { show: false };

  const school = await db.school.findUnique({ where: { id: user.schoolId } });
  if (!school) return { show: false };

  const now = new Date();
  const todayKey = localDateKey(now, school.timezone);
  const today = new Date(`${todayKey}T00:00:00Z`);

  const [override, districtDay, term] = await Promise.all([
    db.scheduleOverride.findUnique({
      where: { schoolId_date: { schoolId: school.id, date: today } },
    }),
    db.districtCalendarDay.findUnique({ where: { date: today } }),
    // The term containing today, or the most recent one if the year has
    // ended — the post-term prompt needs an end date to compare against.
    db.term.findFirst({
      where: { schoolId: school.id, startDate: { lte: today } },
      orderBy: { startDate: "desc" },
    }),
  ]);

  if (!term) return { show: false };

  const resolved = override ?? districtDay;
  const pastTermEnd = today > term.endDate;

  // Outside the school day there are no periods to count, but the one
  // post-term prompt still needs to fire.
  if (!pastTermEnd && (!resolved || resolved.dayType == null)) {
    return { show: false };
  }

  const dayType =
    school.type === "MIDDLE" ? "ALL" : (resolved?.dayType ?? "ALL");

  const periods = await db.period.findMany({
    where: {
      schoolId: school.id,
      dayType,
      variant: resolved?.variant ?? "REGULAR",
    },
    orderBy: { sequence: "asc" },
  });

  const slots: PeriodSlot[] = periods.map((p) => ({
    sequence: p.sequence,
    number: p.number,
    label: p.label,
    startMinutes: p.startMinutes,
    endMinutes: p.endMinutes,
    isInstructional: p.isInstructional,
  }));

  const state = await db.promptState.findUnique({
    where: { userId_termId: { userId: user.id, termId: term.id } },
  });

  const decision = decidePrompt({
    now,
    timezone: school.timezone,
    periods: slots,
    promptInterval: school.promptInterval,
    termEndDate: term.endDate,
    state: state
      ? {
          lastPromptedOn: state.lastPromptedOn,
          lastPromptedSequence: state.lastPromptedSequence,
          postTermPromptShown: state.postTermPromptShown,
        }
      : null,
  });

  if (!decision.shouldPrompt) return { show: false };
  return decision.kind === "POST_TERM"
    ? { show: true, kind: "POST_TERM" }
    : { show: true, kind: "PERIODIC", sequence: decision.sequence };
}

/// Record that the prompt was shown, so it doesn't reappear until the interval
/// has passed. Called whether the student answers or dismisses — being asked
/// is what counts, not what they did about it.
export async function markPrompted(
  kind: "PERIODIC" | "POST_TERM",
  sequence?: number,
): Promise<{ ok: boolean }> {
  const user = await getOrCreateUser();
  if (!user?.schoolId) return { ok: false };

  const now = new Date();
  const school = await db.school.findUnique({ where: { id: user.schoolId } });
  if (!school) return { ok: false };

  const today = new Date(`${localDateKey(now, school.timezone)}T00:00:00Z`);
  const term = await db.term.findFirst({
    where: { schoolId: school.id, startDate: { lte: today } },
    orderBy: { startDate: "desc" },
  });
  if (!term) return { ok: false };

  await db.promptState.upsert({
    where: { userId_termId: { userId: user.id, termId: term.id } },
    update:
      kind === "POST_TERM"
        ? { postTermPromptShown: true }
        : { lastPromptedOn: today, lastPromptedSequence: sequence ?? null },
    create: {
      userId: user.id,
      termId: term.id,
      ...(kind === "POST_TERM"
        ? { postTermPromptShown: true }
        : { lastPromptedOn: today, lastPromptedSequence: sequence ?? null }),
    },
  });

  revalidatePath("/dashboard");
  return { ok: true };
}
