import "server-only";

import webpush from "web-push";

import { db } from "@/lib/db";
import {
  dueWorkMessage,
  nudgeMessage,
  NUDGE_URL,
  shouldNudge,
  shouldSendDueWork,
  type NudgeKind,
} from "@/lib/nudge";

/**
 * Sending the nudges.
 *
 * Server-only, and deliberately incapable of saying anything interesting: the
 * payload is a fixed question with no numbers in it, because the server has no
 * numbers. That is not a limitation to apologise for, it means a notification
 * on a lock screen can't show a grade or a sleep total to whoever picks the
 * phone up.
 *
 * Endpoints that come back gone are marked rather than deleted, so a browser
 * that reappears can be told apart from one that never existed.
 */

let configured = false;

function configure(): boolean {
  if (configured) return true;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(
    // A contact for the push service if something goes wrong. Not a student's.
    `mailto:${process.env.EMAIL_FROM ?? "noreply@insight.app"}`,
    publicKey,
    privateKey,
  );
  configured = true;
  return true;
}

/// Today's date in a timezone, as the YYYY-MM-DD the entries are keyed on.
function dateKey(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/**
 * Ask everyone who hasn't logged today.
 *
 * The only thing read is whether a row exists. Nothing is decrypted, and
 * nothing could be, the server has no key.
 */
/**
 * The evening "what's due tomorrow" reminder.
 *
 * Separate from `sendNudges` because it is a different shape of thing: those
 * ask a student for a number and skip anyone who already answered, this one
 * tells them something and skips anyone with nothing to be told.
 *
 * **What the server can and cannot see here matters.** A due date is plaintext
 *, the dashboard has to order by it without decrypting every row, so counting
 * what falls tomorrow is free. Whether a thing has been *handed in* is not: it
 * lives in the encrypted payload. The one proxy available is a graded outcome,
 * whose `assignmentId` is a plain foreign key, so work that has come back
 * marked can be excluded.
 *
 * That leaves "submitted but not yet marked" counted as still due. For work due
 * tomorrow that is usually right, and where it is wrong it errs toward
 * reminding, which is the safe direction for a reminder and the reason the
 * wording says "3 due tomorrow" rather than "3 you still need to do".
 */
export async function sendDueWorkNudges(): Promise<number> {
  if (!configure()) return 0;

  const subscriptions = await db.pushSubscription.findMany({
    where: { failedAt: null, dueWorkNudge: true },
    include: {
      user: {
        select: { id: true, school: { select: { timezone: true } } },
      },
    },
  });

  const now = new Date();
  let sent = 0;

  for (const sub of subscriptions) {
    const timezone = sub.user.school?.timezone ?? "America/Chicago";
    const today = dateKey(now, timezone);

    // Tomorrow in the student's own day, not the server's. A job that runs at
    // 22:00 UTC is already tomorrow in London and still today in Frisco.
    const startOfTomorrow = new Date(`${today}T00:00:00Z`);
    startOfTomorrow.setUTCDate(startOfTomorrow.getUTCDate() + 1);
    const endOfTomorrow = new Date(startOfTomorrow);
    endOfTomorrow.setUTCDate(endOfTomorrow.getUTCDate() + 1);
    const startOfToday = new Date(`${today}T00:00:00Z`);

    const [dueTomorrow, overdue] = await Promise.all([
      db.assignment.count({
        where: {
          userId: sub.user.id,
          dueAt: { gte: startOfTomorrow, lt: endOfTomorrow },
          outcome: null,
          // Ticked off by the student. This is the whole reason completedAt is
          // plaintext: telling someone who has finished three things that three
          // are still due is how a reminder gets turned off for good.
          completedAt: null,
        },
      }),
      // Only the last fortnight. A term's worth of never-submitted work is a
      // conversation with a teacher, not a push notification, and "43 overdue"
      // every evening is the kind of number people mute.
      db.assignment.count({
        where: {
          userId: sub.user.id,
          dueAt: {
            gte: new Date(startOfToday.getTime() - 14 * 86_400_000),
            lt: startOfToday,
          },
          outcome: null,
          completedAt: null,
        },
      }),
    ]);

    if (!shouldSendDueWork(dueTomorrow, overdue)) continue;

    const message = dueWorkMessage(dueTomorrow, overdue);

    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify({ ...message, url: NUDGE_URL, kind: "DUE_WORK" }),
      );
      sent++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.pushSubscription.update({
          where: { id: sub.id },
          data: { failedAt: new Date() },
        });
      }
    }
  }

  return sent;
}

export async function sendNudges(kind: NudgeKind): Promise<number> {
  if (!configure()) return 0;

  const subscriptions = await db.pushSubscription.findMany({
    where: { failedAt: null },
    include: {
      user: {
        select: {
          id: true,
          school: { select: { timezone: true } },
        },
      },
    },
  });

  const now = new Date();
  let sent = 0;

  for (const sub of subscriptions) {
    const timezone = sub.user.school?.timezone ?? "America/Chicago";
    const today = dateKey(now, timezone);
    const forDate = new Date(`${today}T00:00:00Z`);

    const logged =
      kind === "SLEEP"
        ? await db.sleepEntry.findFirst({
            where: { userId: sub.user.id, forDate },
            select: { id: true },
          })
        : await db.screenTimeEntry.findFirst({
            where: { userId: sub.user.id, forDate },
            select: { id: true },
          });

    const enabled = kind === "SLEEP" ? sub.sleepNudge : sub.screenTimeNudge;

    if (
      !shouldNudge({
        subscribed: true,
        enabled,
        alreadyLogged: Boolean(logged),
        failed: false,
      })
    ) {
      continue;
    }

    // How many days back the gap runs, so the wording can firm up. Counted
    // from row existence alone.
    const since = new Date(forDate);
    since.setUTCDate(since.getUTCDate() - 14);
    const recent =
      kind === "SLEEP"
        ? await db.sleepEntry.count({
            where: { userId: sub.user.id, forDate: { gte: since, lt: forDate } },
          })
        : await db.screenTimeEntry.count({
            where: { userId: sub.user.id, forDate: { gte: since, lt: forDate } },
          });
    const missedDays = recent === 0 ? 14 : 0;

    const message = nudgeMessage(kind, missedDays);

    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify({ ...message, url: NUDGE_URL, kind }),
      );
      sent++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      // 404 and 410 mean the browser is gone for good. Anything else is
      // temporary and worth trying again tomorrow.
      if (status === 404 || status === 410) {
        await db.pushSubscription.update({
          where: { id: sub.id },
          data: { failedAt: new Date() },
        });
      }
    }
  }

  return sent;
}
