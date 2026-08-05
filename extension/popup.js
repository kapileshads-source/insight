/**
 * Popup: pair the browser, then show whether a session is running.
 *
 * Deliberately small. The extension has no dashboard and no settings of its
 * own — the website owns all of that. This exists to answer two questions:
 * am I connected, and am I recording right now.
 */

const $ = (id) => document.getElementById(id);

function trimBase(url) {
  return url.trim().replace(/\/+$/, "");
}

async function render() {
  const { apiBase, token, session, lastError } = await chrome.storage.local.get([
    "apiBase",
    "token",
    "session",
    "lastError",
  ]);

  const paired = Boolean(apiBase && token);
  $("paired").classList.toggle("hidden", !paired);
  $("unpaired").classList.toggle("hidden", paired);
  if (!paired) return;

  if (session) {
    $("dot").className = "dot on";
    $("state").textContent = session.focusMode
      ? "Studying, Focus Mode on"
      : "Studying";
    const started = new Date(session.startedAt);
    const mins = Math.max(0, Math.floor((Date.now() - started.getTime()) / 60000));
    $("detail").textContent = `Started ${mins} minute${mins === 1 ? "" : "s"} ago.`;
  } else {
    $("dot").className = "dot off";
    $("state").textContent = "Not studying";
    $("detail").textContent = "Start a session on Insight and this turns on.";
  }

  $("error").classList.toggle("hidden", !lastError);
  if (lastError) $("error").textContent = lastError;
}

$("pair").addEventListener("click", async () => {
  const apiBase = trimBase($("apiBase").value);
  const token = $("token").value.trim();

  if (!apiBase || !token) {
    $("pairError").textContent = "Both fields are needed.";
    $("pairError").classList.remove("hidden");
    return;
  }

  // Verified before it's saved, so a mistyped code fails here rather than
  // looking connected and silently never recording anything.
  try {
    const res = await fetch(`${apiBase}/api/devices/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      $("pairError").textContent = "That code wasn't accepted. Generate a new one.";
      $("pairError").classList.remove("hidden");
      return;
    }
    if (!res.ok) throw new Error("bad response");

    const data = await res.json();
    await chrome.storage.local.set({
      apiBase,
      token,
      session: data.session,
      blocklist: data.blocklist ?? [],
      tally: {},
      blocked: [],
      lastError: null,
    });
    await render();
  } catch {
    $("pairError").textContent = "Couldn't reach that address. Check it and try again.";
    $("pairError").classList.remove("hidden");
  }
});

$("unpair").addEventListener("click", async () => {
  // Clears everything, including any tally not yet sent. Unpairing should
  // leave nothing behind on the machine.
  await chrome.storage.local.clear();
  await render();
});

chrome.runtime.sendMessage({ type: "poll-now" }, () => {
  // Response ignored; render reads storage either way.
  void chrome.runtime.lastError;
  render();
});

render();
