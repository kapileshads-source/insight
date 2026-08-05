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

  const fail = (message) => {
    $("pairError").textContent = message;
    $("pairError").classList.remove("hidden");
  };

  // Verified before it's saved, so a mistyped code fails here rather than
  // looking connected and silently never recording anything.
  //
  // The three stages below are caught separately. Wrapping them together
  // blamed a failed storage write on the network, which sent you looking at
  // the wrong thing — the same mistake as any error message that guesses.
  let res;
  try {
    res = await fetch(`${apiBase}/api/devices/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    fail(`Couldn't reach ${apiBase} — ${e?.message ?? "network error"}`);
    return;
  }

  if (res.status === 401) {
    fail("That code wasn't accepted. Generate a new one on the website.");
    return;
  }
  if (!res.ok) {
    fail(`The server answered ${res.status}. Check the address is right.`);
    return;
  }

  try {
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
  } catch (e) {
    fail(`Connected, but couldn't save it — ${e?.message ?? "storage error"}`);
    return;
  }

  await render();
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
