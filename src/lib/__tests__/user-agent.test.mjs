import { detectOs, isIOS } from "../user-agent.ts";

/// Only decides which download goes first, so a wrong answer is a bad
/// ordering rather than a broken page. These are real strings, because the
/// interesting cases are all ones you wouldn't invent: an iPad claiming to be
/// a Mac, and Android claiming to be Linux.

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

const UA = {
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  ipad:
    "Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  chromebook:
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

console.log("the two that can actually run the apps");
ok("Chrome on Windows", detectOs(UA.windowsChrome) === "windows");
ok("Edge on Windows", detectOs(UA.windowsEdge) === "windows");
ok("Safari on a Mac", detectOs(UA.macSafari) === "mac");
ok("Chrome on a Mac", detectOs(UA.macChrome) === "mac");

console.log("\nphones and tablets are neither, however they describe themselves");
// Both of these contain "Mac OS X", which is the trap.
ok("an iPhone is not a Mac", detectOs(UA.iphone) === "other");
ok("an iPad is not a Mac", detectOs(UA.ipad) === "other");
ok("Android is not a Mac or Windows", detectOs(UA.android) === "other");
ok("a Chromebook is neither", detectOs(UA.chromebook) === "other");

console.log("\nnothing to go on");
ok("missing header", detectOs(null) === "other");
ok("undefined", detectOs(undefined) === "other");
ok("empty string", detectOs("") === "other");
ok("junk", detectOs("curl/8.4.0") === "other");

console.log("\nand whether to offer the Focus shortcut");
ok("an iPhone gets it", isIOS(UA.iphone));
ok("an iPad gets it", isIOS(UA.ipad));
ok("a Mac does not", !isIOS(UA.macSafari));
ok("Windows does not", !isIOS(UA.windowsChrome));
ok("Android does not", !isIOS(UA.android));
ok("nothing to go on", !isIOS(null));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
