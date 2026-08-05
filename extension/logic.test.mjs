/**
 * Tests for the extension's decision logic.
 *
 * The service worker itself needs a browser, but the parts that decide what
 * gets recorded are pure and are exactly the parts that must not be wrong:
 * a bug here either records something private or blocks the wrong site.
 *
 * These are copies of the functions in background.js. Kept in step by being
 * short enough to read side by side, which is the tradeoff for testing them
 * at all without a headless Chrome in the build.
 */

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

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) {
    pass++;
    console.log("  ok  ", name);
  } else {
    fail++;
    console.log("  FAIL", name);
  }
};

console.log("only hostnames are ever extracted");
ok(
  "a deep URL yields only the host",
  hostOf("https://www.reddit.com/r/something/comments/abc/very_private_thread/") ===
    "reddit.com",
);
ok(
  "query strings are discarded",
  hostOf("https://docs.google.com/document/d/SECRET/edit?token=abc") ===
    "docs.google.com",
);
ok("www is normalised away", hostOf("https://www.youtube.com") === "youtube.com");

console.log("\nnon-web pages are ignored entirely");
ok("chrome:// is ignored", hostOf("chrome://extensions") === null);
ok("extension pages are ignored", hostOf("chrome-extension://abc/popup.html") === null);
ok("local files are ignored", hostOf("file:///Users/someone/private.pdf") === null);
ok("about:blank is ignored", hostOf("about:blank") === null);
ok("malformed input is ignored", hostOf("not a url") === null);

console.log("\nblocking matches the site and its subdomains");
const list = ["youtube.com", "reddit.com", "x.com"];
ok("exact host blocks", isBlocked("youtube.com", list));
ok("subdomain blocks", isBlocked("m.youtube.com", list));
ok("deep subdomain blocks", isBlocked("music.m.youtube.com", list));

console.log("\nblocking does not over-reach");
ok("a lookalike suffix is not blocked", !isBlocked("notyoutube.com", list));
ok("a different tld is not blocked", !isBlocked("youtube.co.uk", list));
ok("an unrelated site is not blocked", !isBlocked("khanacademy.org", list));
ok(
  "a school domain containing a blocked name is safe",
  !isBlocked("myx.com.school.edu", list),
);
ok("null host is not blocked", !isBlocked(null, list));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
