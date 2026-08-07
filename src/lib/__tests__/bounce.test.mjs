import { cleanAppName } from "../bounce.ts";

/// The app name arrives in a query string anyone can write and is rendered
/// straight back to the reader. React escapes it, so this isn't about script
/// tags — it's about Insight's own page being used to show someone else's
/// message, or a 4,000-character "app name" wrecking the layout.

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name); }
};

console.log("real app names survive");
ok("a simple one", cleanAppName("Instagram") === "Instagram");
ok("one letter", cleanAppName("X") === "X");
ok("spaces", cleanAppName("Call of Duty") === "Call of Duty");
ok("punctuation apps actually use", cleanAppName("Duolingo!") === "Duolingo!");
ok("an ampersand", cleanAppName("Ben & Jerry") === "Ben & Jerry");
ok("a dot", cleanAppName("Amazon.com") === "Amazon.com");
ok("non-latin letters", cleanAppName("微信") === "微信");
ok("surrounding space is trimmed", cleanAppName("  TikTok  ") === "TikTok");
ok("runs of space collapse", cleanAppName("Apple    Music") === "Apple Music");

console.log("\nanything else is dropped rather than shown");
ok("nothing at all", cleanAppName(undefined) === null);
ok("null", cleanAppName(null) === null);
ok("empty", cleanAppName("") === null);
ok("only whitespace", cleanAppName("   ") === null);
ok("a url", cleanAppName("https://elsewhere.example") === null);
ok("a bare path", cleanAppName("../../etc/passwd") === null);
ok("angle brackets", cleanAppName("<b>hello</b>") === null);
ok("a newline", cleanAppName("Instagram\nSomething else entirely") === null);
ok("something absurdly long", cleanAppName("a".repeat(200)) === null);
ok("a leading symbol", cleanAppName("!!!") === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
