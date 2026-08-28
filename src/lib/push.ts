import "server-only";

import webpush from "web-push";

import { db } from "@/lib/db";
import { nudgeMessage, NUDGE_URL, shouldNudge, type NudgeKind } from "@/lib/nudge";

/**
 * Sending the nudges.
 *
 * Server-only, and deliberately incapable of saying anything interesting: the
 * payload is a fixed question with no numbers in it, because the server has no
 * numbers. That is not a limitation to apologise for — it means a notification
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
 * nothing could be — the server has no key.
 */
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
