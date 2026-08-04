import { parseDurations } from "../ocr.ts";

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

const best = (t) => parseDurations(t).sort((a, b) => b.minutes - a.minutes)[0];

console.log("iOS Screen Time layouts");
ok("'5h 32m' reads as 332", best("Screen Time\nDaily Average\n5h 32m")?.minutes === 332);
ok(
  "picks the daily total over per-app rows",
  best("Total 6h 12m\nSafari 2h 4m\nTikTok 1h 58m\nMessages 47m")?.minutes ===
    372,
);
ok("bare hours work", best("Daily Average\n7h")?.minutes === 420);

console.log("\nAndroid Digital Wellbeing layouts");
ok(
  "'4 hr 15 min' reads as 255",
  best("Today\n4 hr 15 min\nUnlocks 62")?.minutes === 255,
);
ok("'47 minutes' reads as 47", best("Screen time\n47 minutes")?.minutes === 47);
ok("colon form works", best("Screen time\n3:45")?.minutes === 225);

console.log("\nrejects nonsense");
ok("empty text finds nothing", parseDurations("").length === 0);
ok("prose with no durations finds nothing", parseDurations("Settings Battery Storage").length === 0);
ok(
  "a value over 24 hours is discarded as a misread",
  parseDurations("99h 99m").every((c) => c.minutes <= 1440),
);
ok(
  "clock times that look like durations are still bounded",
  parseDurations("23:59").every((c) => c.minutes <= 1440),
);

console.log("\nalternatives are offered");
{
  const all = parseDurations("Total 6h 12m\nSafari 2h 4m\nMessages 47m");
  ok("more than one candidate returned", all.length >= 3);
  ok("values are de-duplicated", new Set(all.map((c) => c.minutes)).size === all.length);
  ok("each carries the text it matched", all.every((c) => c.raw.length > 0));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
