"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/user";

export type AdminResult = { ok: true } | { ok: false; error: string };

/// Who may edit district-wide schedule data.
///
/// A list of emails in an environment variable rather than a role column:
/// there are two administrators, they are the people who built this, and a
/// permissions system for an audience of two is machinery nobody needs. It
/// becomes a real check the moment a third person appears.
function admins(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function isAdmin(): Promise<boolean> {
  const user = await getOrCreateUser();
  if (!user) return false;
  const list = admins();
  // Empty list means nobody, not everybody. Getting that backwards would hand
  // the schedule editor to every student.
  if (list.length === 0) return false;
  return list.includes(user.email.toLowerCase());
}

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("Not an administrator");
}

// --- periods ----------------------------------------------------------------

const periodSchema = z.object({
  id: z.string().min(1),
  startMinutes: z.number().int().min(0).max(1439),
  endMinutes: z.number().int().min(1).max(1440),
  label: z.string().max(64).nullable(),
  isInstructional: z.boolean(),
});

export async function updatePeriod(input: unknown): Promise<AdminResult> {
  await requireAdmin();

  const parsed = periodSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Those times didn't parse." };
  if (parsed.data.endMinutes <= parsed.data.startMinutes) {
    return { ok: false, error: "A period has to end after it starts." };
  }

  const { id, ...rest } = parsed.data;
  await db.period.update({ where: { id }, data: rest });

  revalidatePath("/admin/schedules");
  revalidatePath("/dashboard");
  return { ok: true };
}

// --- calendar ---------------------------------------------------------------

const calendarSchema = z.object({
  date: z.iso.date(),
  dayType: z.enum(["ALL", "A", "B"]).nullable(),
  variant: z.enum(["REGULAR", "LATE_ARRIVAL", "EARLY_RELEASE"]),
  note: z.string().max(200).optional(),
});

/// Set what kind of day a date is, district-wide.
///
/// This is the fix path for the five dates the calendar extractor couldn't
/// resolve, and for anything FISD changes mid-year, a bad weather make-up day
/// being invoked, an exam schedule, a late start added in November.
export async function upsertCalendarDay(input: unknown): Promise<AdminResult> {
  await requireAdmin();

  const parsed = calendarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That didn't parse." };

  const date = new Date(`${parsed.data.date}T00:00:00Z`);

  await db.districtCalendarDay.upsert({
    where: { date },
    update: {
      dayType: parsed.data.dayType,
      variant: parsed.data.variant,
      note: parsed.data.note ?? null,
      // Confirming a day is what clears the flag. That is the whole point of
      // moving this out of a hardcoded array: the list now gets shorter.
      needsReview: false,
    },
    create: {
      date,
      dayType: parsed.data.dayType,
      variant: parsed.data.variant,
      note: parsed.data.note ?? null,
    },
  });

  revalidatePath("/admin/schedules");
  revalidatePath("/dashboard");
  return { ok: true };
}

// --- terms ------------------------------------------------------------------

const termSchema = z.object({
  id: z.string().min(1),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
});

export async function updateTerm(input: unknown): Promise<AdminResult> {
  await requireAdmin();

  const parsed = termSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Those dates didn't parse." };
  if (parsed.data.endDate <= parsed.data.startDate) {
    return { ok: false, error: "A term has to end after it starts." };
  }

  await db.term.update({
    where: { id: parsed.data.id },
    data: {
      startDate: new Date(`${parsed.data.startDate}T00:00:00Z`),
      endDate: new Date(`${parsed.data.endDate}T00:00:00Z`),
    },
  });

  revalidatePath("/admin/schedules");
  return { ok: true };
}
