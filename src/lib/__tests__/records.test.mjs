import {
  formatMinutes,
  minutesToTimeValue,
  nightLength,
  parseTimeToMinutes,
} from "../records.ts";

/**
 * Times are stored as minutes from midnight, and a bedtime crosses midnight
 * while a wake time doesn't. Plain subtraction gives a negative night, which
 * would have told a student they slept minus four hours.
 */

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

console.log("reading what a time input gives us");
ok("a normal evening time", parseTimeToMinutes("23:20") === 1400);
ok("midnight is zero", parseTimeToMinutes("00:00") === 0);
ok("a morning time", parseTimeToMinutes("06:45") === 405);
ok("a single-digit hour", parseTimeToMinutes("6:45") === 405);
ok("surrounding space is fine", parseTimeToMinutes(" 07:00 ") === 420);

ok("empty is rejected", parseTimeToMinutes("") === null);
ok("a 25th hour is rejected", parseTimeToMinutes("25:00") === null);
ok("a 61st minute is rejected", parseTimeToMinutes("10:61") === null);
ok("words are rejected", parseTimeToMinutes("bedtime") === null);
ok("seconds are rejected", parseTimeToMinutes("10:30:00") === null);

console.log("\nand giving it back unchanged");
for (const value of ["00:00", "06:45", "23:20", "12:00"]) {
  ok(`${value} survives a round trip`,
    minutesToTimeValue(parseTimeToMinutes(value)) === value.padStart(5, "0"));
}

console.log("\nnights that cross midnight");
ok("11:20pm to 6:45am is 7h 25m",
  nightLength(1400, 405) === 445);
ok("10pm to 6am is eight hours",
  nightLength(22 * 60, 6 * 60) === 480);
ok("a night that doesn't cross midnight still works",
  nightLength(1 * 60, 9 * 60) === 480);
ok("midnight to 7am",
  nightLength(0, 7 * 60) === 420);
ok("no night is ever negative",
  [[1400, 405], [23 * 60, 60], [0, 1], [1439, 0]]
    .every(([s, w]) => nightLength(s, w) > 0));

console.log("\nand shown back to a human");
ok("evening reads as PM", formatMinutes(1400) === "11:20 PM");
ok("midnight reads as 12 AM", formatMinutes(0) === "12:00 AM");
ok("noon reads as 12 PM", formatMinutes(720) === "12:00 PM");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
