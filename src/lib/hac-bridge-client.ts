/**
 * Talking to the extension's HAC bridge from the page.
 *
 * The extension injects a content script into this site; it shares the page's
 * `window` but not its JavaScript world, so `postMessage` is the only channel.
 * Every request carries an id because two can be in flight and a reply landing
 * against the wrong one would be worse than no reply.
 */

export type HacFetch =
  | { ok: true; html: string }
  /// The student isn't signed into HAC in this browser. HAC answers with the
  /// login page and a 200, so this is detected by content, not status.
  | { ok: false; reason: "signed-out" }
  /// The extension is installed but hasn't been given access to HAC yet.
  /// Granting needs a user gesture inside the extension, so this has to be
  /// done from its popup rather than from here.
  | { ok: false; reason: "needs-permission" }
  | { ok: false; reason: "no-extension" }
  | { ok: false; reason: string };

const CHANNEL = "insight-hac";

/// How long to wait before deciding the extension isn't there. Long enough for
/// a slow HAC, short enough that a student isn't left watching a spinner.
const TIMEOUT_MS = 20_000;

export function requestHacPage(timeoutMs = TIMEOUT_MS): Promise<HacFetch> {
  if (typeof window === "undefined") {
    return Promise.resolve({ ok: false, reason: "no-extension" });
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise<HacFetch>((resolve) => {
    let settled = false;

    const finish = (result: HacFetch) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
      resolve(result);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.channel !== CHANNEL) return;
      if (data.direction !== "response" || data.id !== id) return;

      finish(
        data.ok
          ? { ok: true, html: String(data.html ?? "") }
          : { ok: false, reason: String(data.reason ?? "failed") },
      );
    };

    // No bridge means nothing is listening and no reply will ever come, which
    // is indistinguishable from a slow one until the clock runs out.
    const timer = window.setTimeout(
      () => finish({ ok: false, reason: "no-extension" }),
      timeoutMs,
    );

    window.addEventListener("message", onMessage);
    window.postMessage(
      { channel: CHANNEL, direction: "request", id },
      window.location.origin,
    );
  });
}
