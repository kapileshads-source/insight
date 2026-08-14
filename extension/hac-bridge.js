/**
 * Lets the Insight page ask for the student's own HAC gradebook.
 *
 * The point of routing this through the extension is that it needs *no
 * credentials at all*. The student is already logged into HAC in this browser;
 * this fetches a page they are already authorised to see, using the session
 * cookie that is already there. Nothing is typed, nothing is stored, and no
 * password touches anything we wrote.
 *
 * A web page can't do this itself — HAC sends no CORS headers, so the browser
 * would fetch it and refuse to let the page read it. An extension with a host
 * permission can. That permission is the whole reason this file exists.
 *
 * The extension deliberately does not parse the HTML and does not send it
 * anywhere. It hands the page back to the tab, which holds the encryption key
 * and encrypts before storing — the same path every other record takes. In
 * particular this must never go to PendingDeviceData, which is plaintext for
 * six hours: acceptable for "youtube.com", not for a grade.
 */

const HAC_ORIGIN = "https://hac.friscoisd.org";
const ASSIGNMENTS_URL = `${HAC_ORIGIN}/HomeAccess/Content/Student/Assignments.aspx`;

/// The page asks by posting to itself; this content script is the only thing
/// listening. Replies carry the same id so two requests can't be confused.
window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  const request = event.data;
  if (!request || request.channel !== "insight-hac" || !request.id) return;
  if (request.direction !== "request") return;

  chrome.runtime.sendMessage(
    { type: "hac-fetch", url: request.url || ASSIGNMENTS_URL },
    (response) => {
      const failure = chrome.runtime.lastError
        ? { ok: false, reason: "extension-unavailable" }
        : null;

      window.postMessage(
        {
          channel: "insight-hac",
          direction: "response",
          id: request.id,
          ...(failure ?? response ?? { ok: false, reason: "no-response" }),
        },
        window.location.origin,
      );
    },
  );
});

// Tells the page the bridge is present at all, so it can offer the button
// only when it would work rather than after it fails.
window.postMessage(
  { channel: "insight-hac", direction: "ready" },
  window.location.origin,
);
