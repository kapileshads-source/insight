/**
 * Insight extension, service worker.
 *
 * Two jobs, both of which only happen while a study session is running:
 * count seconds per site, and redirect blocked ones while Focus Mode is on.
 *
 * The hard constraint is that this thing runs on a student's laptop all day
 * and must be trustworthy while doing so. So:
 *
 *   - Nothing is recorded when no session is running. Not "recorded and
 *     discarded", the timer simply doesn't accumulate.
 *   - Only hostnames are kept, never full URLs. Which page they read is not
 *     ours, and truncating at the host makes that true by construction
 *     rather than by promise.
 *   - Nothing is stored beyond the current session's tally, which is flushed
 *     and cleared every minute.
 *
 * Manifest V3 service workers are killed aggressively when idle, so all state
 * lives in chrome.storage and every wake-up re-reads it. Anything held in a
 * module variable is gone by the next alarm.
 */

const POLL_ALARM = "insight-poll";
const POLL_MINUTES = 1;

// --- storage helpers --------------------------------------------------------

async function getState() {
  const s = await chrome.storage.local.get([
    "apiBase",
    "token",
    "session",
    "blocklist",
    "tally",
    "blocked",
    "activeHost",
    "activeSince",
    "lastError",
  ]);
  return {
    apiBase: s.apiBase ?? "",
    token: s.token ?? "",
    session: s.session ?? null,
    blocklist: s.blocklist ?? [],
    tally: s.tally ?? {},
    blocked: s.blocked ?? [],
    activeHost: s.activeHost ?? null,
    activeSince: s.activeSince ?? null,
    lastError: s.lastError ?? null,
  };
}

const setState = (patch) => chrome.storage.local.set(patch);

// --- time accounting --------------------------------------------------------

/// Close out the currently focused site and add its seconds to the tally.
///
/// Called on every tab or window change. Elapsed time is measured against a
/// stored timestamp rather than counted by a ticker, so a sleeping laptop or a
/// suspended worker doesn't invent or lose minutes.
async function closeCurrentSlice() {
  const { session, activeHost, activeSince, tally } = await getState();
  if (!session || !activeHost || !activeSince) return;

  const seconds = Math.floor((Date.now() - activeSince) / 1000);
  if (seconds > 0 && seconds < 6 * 60 * 60) {
    tally[activeHost] = (tally[activeHost] ?? 0) + seconds;
    await setState({ tally });
  }
  await setState({ activeHost: null, activeSince: null });
}

function hostOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isBlocked(host, blocklist) {
  if (!host) return false;
  return blocklist.some((b) => host === b || host.endsWith(`.${b}`));
}

/// Point the tab at our own page rather than closing it.
///
/// Closing a tab loses whatever was in it and feels punitive. A page that
/// explains itself and offers a way back is the difference between a tool and
/// a nuisance, and a nuisance gets uninstalled.
async function enforceFocusMode(tabId, host) {
  const target = chrome.runtime.getURL(
    `blocked.html?site=${encodeURIComponent(host)}`,
  );
  await chrome.tabs.update(tabId, { url: target });

  const { blocked } = await getState();
  blocked.push({ site: host, overrideUsed: false });
  await setState({ blocked });
}

async function handleActiveTab(tab) {
  if (!tab?.url) return;

  const { session, blocklist } = await getState();
  await closeCurrentSlice();

  // No session, no recording. This is the guarantee the privacy page makes.
  if (!session) return;

  const host = hostOf(tab.url);
  if (!host) return;

  if (session.focusMode && isBlocked(host, blocklist)) {
    await enforceFocusMode(tab.id, host);
    return;
  }

  await setState({ activeHost: host, activeSince: Date.now() });
}

// --- events -----------------------------------------------------------------

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await handleActiveTab(tab);
  } catch {
    // Tab vanished between the event and the lookup. Nothing to do.
  }
});

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) {
    await handleActiveTab(tab);
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  // Chrome lost focus entirely, they've switched to another app, so stop
  // counting rather than crediting the last site with the whole lunch break.
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await closeCurrentSlice();
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  if (tab) await handleActiveTab(tab);
});

// --- sync -------------------------------------------------------------------

async function poll() {
  const { apiBase, token } = await getState();
  if (!apiBase || !token) return;

  try {
    const res = await fetch(`${apiBase}/api/devices/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      // Revoked or wrong token. Say so plainly in the popup rather than
      // failing silently and looking like the extension simply stopped.
      //
      // The token is also dropped, which it was not before. A 401 here is
      // definitive, it means the stored token hashes to nothing on the
      // server, so retrying it cannot ever succeed, and this polls every
      // fifteen seconds. An unpaired browser left open was filling the
      // production logs with a rejected request four times a minute,
      // indefinitely, drowning everything worth reading.
      //
      // Clearing it stops the loop at `!token` above until the student pairs
      // again, which the popup now tells them to do.
      await setState({
        session: null,
        token: null,
        lastError: "This device was unpaired. Pair it again from Insight.",
      });
      return;
    }
    if (!res.ok) return;

    const data = await res.json();
    const previous = (await getState()).session;

    await setState({
      session: data.session,
      blocklist: data.blocklist ?? [],
      lastError: null,
    });

    // Session just ended, flush whatever is left before the id stops being
    // valid, otherwise the last minute of every session is lost.
    if (previous && !data.session) {
      await closeCurrentSlice();
      await flush(previous.id);
    }
  } catch {
    await setState({ lastError: "Can't reach Insight. Retrying." });
  }
}

/// Send the tally and clear it. Clearing only on success means a dropped
/// connection delays the data rather than destroying it.
async function flush(sessionIdOverride) {
  const { apiBase, token, session, tally, blocked } = await getState();
  const sessionId = sessionIdOverride ?? session?.id;
  if (!apiBase || !token || !sessionId) return;

  const domains = Object.entries(tally)
    .map(([domain, seconds]) => ({ domain, seconds }))
    .filter((d) => d.seconds > 0);

  if (domains.length === 0 && blocked.length === 0) return;

  try {
    const res = await fetch(`${apiBase}/api/devices/activity`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId, domains, blocked }),
    });
    if (res.ok) await setState({ tally: {}, blocked: [] });
  } catch {
    // Keep the tally and try again next minute.
  }
}

chrome.alarms.create(POLL_ALARM, { periodInMinutes: POLL_MINUTES });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== POLL_ALARM) return;

  // Roll the open slice into the tally first, so a site left focused for an
  // hour reports steadily rather than all at once when they finally switch.
  await closeCurrentSlice();
  const { session } = await getState();
  if (session) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab) {
      const host = hostOf(tab.url ?? "");
      if (host) await setState({ activeHost: host, activeSince: Date.now() });
    }
  }

  await flush();
  await poll();
});

// Messages from the popup and the block page.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "override") {
      const { blocked } = await getState();
      blocked.push({ site: message.site, overrideUsed: true });
      await setState({ blocked });
      await flush();
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "poll-now") {
      await poll();
      sendResponse({ ok: true });
      return;
    }
    sendResponse({ ok: false });
  })();
  return true;
});
