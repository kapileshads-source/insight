import { db } from "@/lib/db";
import { authenticateDevice } from "@/lib/device-tokens";
import { fail, ok, preflight } from "@/lib/device-api";

/**
 * Start a session from a paired device — in practice, the phone.
 *
 * The website has always owned session state and every other client follows.
 * This is the one exception, and it's the whole reason the phone app exists:
 * starting a session should be possible from the thing already in your hand.
 */

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return preflight();
}

export async function POST(request: Request) {
  const device = await authenticateDevice(request.headers.get("authorization"));
  if (!device) return fail("Unauthorised", 401);

  // One running session at a time. A student who left one open on a laptop and
  // starts another from their phone should resume it, not accumulate a second
  // that reads as a fourteen-hour study block.
  const running = await db.studySession.findFirst({
    where: { userId: device.userId, endedAt: null },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true, focusModeActive: true },
  });

  if (running) {
    return ok({
      session: {
        id: running.id,
        startedAt: running.startedAt.toISOString(),
        focusMode: running.focusModeActive,
      },
      resumed: true,
    });
  }

  // Focus Mode starts with the session, as it does on the website: making a
  // student switch it on separately means the one who most needs it is the one
  // who won't bother.
  const created = await db.studySession.create({
    data: { userId: device.userId, startedAt: new Date(), focusModeActive: true },
    select: { id: true, startedAt: true, focusModeActive: true },
  });

  return ok({
    session: {
      id: created.id,
      startedAt: created.startedAt.toISOString(),
      focusMode: created.focusModeActive,
    },
    resumed: false,
  });
}
