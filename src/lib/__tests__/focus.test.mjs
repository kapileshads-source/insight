import { readFileSync } from "node:fs";
import {
  FOCUS_ON_SHORTCUT,
  FOCUS_OFF_SHORTCUT,
  shortcutUrl,
} from "../focus.ts";

/// iOS won't let anything but Shortcuts set a Focus, so the handshake is a
/// shortcut the student names by hand. If the web app and the iPhone app ever
/// disagree about that name, the buttons open Shortcuts and find nothing —
/// and a student who set it up once would reasonably decide the feature is
/// broken rather than that two files drifted apart.

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name); }
};

console.log("the url is one Shortcuts will accept");
ok("scheme and action", shortcutUrl("Insight Study On").startsWith("shortcuts://run-shortcut?name="));
ok("spaces are encoded", shortcutUrl("Insight Study On").endsWith("Insight%20Study%20On"));
ok("an ampersand can't start a second parameter",
  shortcutUrl("Study & Chill").endsWith("Study%20%26%20Chill"));

console.log("\nthe two apps agree on the names");
{
  // Read out of the Swift rather than duplicated here, so this fails when
  // someone edits one side.
  const swift = readFileSync("ios/Sources/Focus.swift", "utf8");
  const onName = /onShortcut\s*=\s*"([^"]+)"/.exec(swift)?.[1];
  const offName = /offShortcut\s*=\s*"([^"]+)"/.exec(swift)?.[1];

  ok("the iPhone app's names were found", Boolean(onName && offName));
  ok(`"on" matches (${FOCUS_ON_SHORTCUT})`, onName === FOCUS_ON_SHORTCUT);
  ok(`"off" matches (${FOCUS_OFF_SHORTCUT})`, offName === FOCUS_OFF_SHORTCUT);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
