import {
  dateKey,
  hourIn,
  inWindow,
  OVERDUE_AFTER,
  routineDue,
  routineWording,
  SCREEN_TIME_WINDOW,
  SLEEP_WINDOW,
} from "../routine.ts";

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

const TZ = "America/Chicago";
/// A local wall-clock time in Frisco, expressed as the instant it really is.
const at = (day, hour) => new Date(`2026-09-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:30:00-05:00`);

const due = (over) =>
  routineDue({ now: at(15, 8), timezone: TZ, sleepLogged: [], screenTimeLogged: [], ...over });

console.log("the student's own clock, not the server's");
{
  // The server runs in UTC. 11 PM in Frisco is already tomorrow there, and
  // filing a night's sleep under the wrong date silently shifts every
  // correlation by a day.
  const lateEvening = new Date("2026-09-15T23:30:00-05:00");
  ok("the date is the student's", dateKey(lateEvening, TZ) === "2026-09-15");
  ok("so is the hour", hourIn(lateEvening, TZ) === 23);
}

console.log("\nwhen each one is asked");
{
  ok("sleep in the morning", due({ now: at(15, 8) }).some((t) => t.kind === "SLEEP"));
  ok("not sleep at night", !due({ now: at(15, 21) }).some((t) => t.kind === "SLEEP"));
  // After early afternoon a student is guessing, and a guessed number is worse
  // than a gap because the engine can't tell it from a measured one.
  ok("not sleep in the late afternoon", !due({ now: at(15, 16) }).some((t) => t.kind === "SLEEP"));

  ok("phone time in the evening", due({ now: at(15, 21) }).some((t) => t.kind === "SCREEN_TIME"));
  ok("not phone time at breakfast", !due({ now: at(15, 8) }).some((t) => t.kind === "SCREEN_TIME"));

  // 1 AM asks about phone time and not sleep: the night hasn't happened yet.
  const oneAM = due({ now: at(15, 1) });
  ok("1 AM asks about the phone, not the night ahead", oneAM.length === 1 && oneAM[0].kind === "SCREEN_TIME");

  // Two questions at once is a form, and a form gets dismissed as a unit.
  for (let hour = 0; hour < 24; hour++) {
    const tasks = due({ now: at(15, hour) });
    ok(`${hour}:30 asks at most one thing`, tasks.length <= 1);
  }
}

console.log("\nwhich day the answer belongs to");
{
  const screen = due({ now: at(15, 1) }).find((t) => t.kind === "SCREEN_TIME");
  // Past midnight, the evening being asked about is yesterday's.
  ok("phone time after midnight is yesterday's", screen.forDate === "2026-09-14");
  const evening = due({ now: at(15, 21) }).find((t) => t.kind === "SCREEN_TIME");
  ok("phone time in the evening is today's", evening.forDate === "2026-09-15");
  const sleep = due({ now: at(15, 8) }).find((t) => t.kind === "SLEEP");
  ok("sleep is filed under the morning it's asked", sleep.forDate === "2026-09-15");
}

console.log("\nalready answered");
{
  ok("logged sleep isn't asked again", !due({ sleepLogged: ["2026-09-15"] }).some((t) => t.kind === "SLEEP"));
  ok("yesterday's sleep doesn't count for today", due({ sleepLogged: ["2026-09-14"] }).some((t) => t.kind === "SLEEP"));
  ok(
    "logged phone time isn't asked again",
    !routineDue({ now: at(15, 21), timezone: TZ, sleepLogged: [], screenTimeLogged: ["2026-09-15"] })
      .some((t) => t.kind === "SCREEN_TIME"),
  );
}

console.log("\ncounting the days it has been missed");
{
  ok("the first ask is not a miss", due({ sleepLogged: ["2026-09-14"] })[0].missedDays === 0);
  ok("one missed morning", due({ sleepLogged: ["2026-09-13"] })[0].missedDays === 1);
  ok("three missed mornings", due({ sleepLogged: ["2026-09-11"] })[0].missedDays === 3);
  ok("nothing ever logged still counts", due({ sleepLogged: [] })[0].missedDays === 14);
  ok("a fortnight is the most it looks back", due({ sleepLogged: [] })[0].missedDays <= 14);

  ok("not overdue on the first ask", due({ sleepLogged: ["2026-09-14"] })[0].overdue === false);
  ok("overdue after two", due({ sleepLogged: ["2026-09-12"] })[0].overdue === true);
  ok("the threshold is what it says", OVERDUE_AFTER === 2);
}

console.log("\nwindows that run past midnight");
{
  ok("evening is inside", inWindow(21, SCREEN_TIME_WINDOW));
  ok("1 AM is inside", inWindow(1, SCREEN_TIME_WINDOW));
  ok("4 AM is outside", !inWindow(4, SCREEN_TIME_WINDOW));
  ok("noon is outside", !inWindow(12, SCREEN_TIME_WINDOW));
  ok("a plain window still works", inWindow(8, SLEEP_WINDOW) && !inWindow(20, SLEEP_WINDOW));
}

console.log("\nit firms up without telling anyone off");
{
  const first = routineWording({ kind: "SLEEP", forDate: "x", missedDays: 0, overdue: false });
  const later = routineWording({ kind: "SLEEP", forDate: "x", missedDays: 3, overdue: true });

  ok("the first ask is light", first.detail.includes("guess is fine"));
  ok("later it says how many", later.detail.startsWith("4 mornings"));
  // It gives the reason rather than an instruction. A tracker that scolds is
  // a tracker that gets uninstalled, and then it measures nothing at all.
  ok("and gives a reason, not an order", later.detail.includes("seven things"));

  const banned = ["should", "must", "failed", "you didn't", "again!"];
  for (const kind of ["SLEEP", "SCREEN_TIME"]) {
    for (const missed of [0, 1, 5]) {
      const { title, detail } = routineWording({ kind, forDate: "x", missedDays: missed, overdue: missed >= 2 });
      const text = `${title} ${detail}`.toLowerCase();
      ok(`${kind} at ${missed} missed stays civil`, !banned.some((w) => text.includes(w)));
    }
  }
}

console.log("\nthe ask stays inside its own window");
{
  // Every hour of the day, so a window that quietly swallows the whole clock
  // can't slip through. The morning ask and the evening ask must never both
  // be live, and there must be hours where neither is.
  const hours = [];
  for (let hour = 0; hour < 24; hour++) {
    hours.push(due({ now: at(15, hour) }).map((t) => t.kind).join("") || "-");
  }
  ok("there are quiet hours", hours.includes("-"));
  ok("mornings ask about sleep", hours[8] === "SLEEP");
  ok("evenings ask about the phone", hours[21] === "SCREEN_TIME");
  ok("never both in one hour", hours.every((h) => h === "-" || h === "SLEEP" || h === "SCREEN_TIME"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
