/**
 * The page a blocked site is replaced with.
 *
 * The override is deliberately available, and deliberately slightly slow.
 * Your plan calls for a soft commitment rather than a hard lock, because a
 * hard lock just gets the extension uninstalled — and an uninstalled extension
 * records nothing at all. Three seconds is enough to interrupt the reflex
 * without becoming a punishment.
 */

const params = new URLSearchParams(location.search);
const site = params.get("site") ?? "";

if (site) document.getElementById("site").textContent = site;

document.getElementById("back").addEventListener("click", () => {
  history.length > 1 ? history.back() : window.close();
});

const overrideButton = document.getElementById("override");
let countdown = null;

overrideButton.addEventListener("click", () => {
  if (countdown !== null) return;

  let remaining = 3;
  overrideButton.textContent = `Opening in ${remaining}…`;

  countdown = setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      overrideButton.textContent = `Opening in ${remaining}…`;
      return;
    }

    clearInterval(countdown);
    countdown = null;

    // Recorded before navigating away, so the session's distraction figures
    // reflect what actually happened.
    chrome.runtime.sendMessage({ type: "override", site }, () => {
      void chrome.runtime.lastError;
      location.href = `https://${site}`;
    });
  }, 1000);
});
