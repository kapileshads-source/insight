import {
  dueWorkMessage,
  nudgeMessage,
  shouldNudge,
  shouldSendDueWork,
} from "../nudge.ts";

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name); }
};

const audience = (over) => ({
  subscribed: true, enabled: true, alreadyLogged: false, failed: false, ...over,
});

console.log("who gets asked");
{
  ok("someone who hasn't logged", shouldNudge(audience()) === true);
  ok("not someone who has", shouldNudge(audience({ alreadyLogged: true })) === false);
  ok("not an unsubscribed device", shouldNudge(audience({ subscribed: false })) === false);
  // Either can be switched off without unsubscribing the device.
  ok("not one that switched this off", shouldNudge(audience({ enabled: false })) === false);
  // A browser that was uninstalled returns 404 or 410; retrying forever is
  // both useless and rude.
  ok("not a dead endpoint", shouldNudge(audience({ failed: true })) === false);
}

console.log("\nwhat it says");
{
  const first = nudgeMessage("SLEEP", 0);
  const later = nudgeMessage("SLEEP", 3);
  ok("asks plainly the first time", first.body.includes("five seconds"));
  ok("says how long it has been", later.body.startsWith("4 mornings"));
  ok("titles stay short for a lock screen", first.title.length <= 30);
  ok("bodies do too", later.body.length <= 80);

  const evening = nudgeMessage("SCREEN_TIME", 0);
  ok("the evening one is about the phone", evening.title.includes("Phone"));
  ok("and says where to find it", evening.body.includes("Screen Time"));

  // Same rule as the dashboard card: it may say how long it has been, and why
  // that matters, but it never tells anyone off.
  const banned = ["should", "must", "failed", "you didn't", "again!", "!"];
  for (const kind of ["SLEEP", "SCREEN_TIME"]) {
    for (const missed of [0, 1, 5, 13]) {
      const { title, body } = nudgeMessage(kind, missed);
      const text = `${title} ${body}`.toLowerCase();
      ok(`${kind} at ${missed} stays civil`, !banned.some((w) => text.includes(w)));
    }
  }

  // A lock-screen notification must never show a number to whoever picks the
  // phone up — the server has none to put in it anyway.
  for (const kind of ["SLEEP", "SCREEN_TIME"]) {
    const { body } = nudgeMessage(kind, 0);
    ok(`${kind} carries no personal number`, !/\d+(\.\d+)?\s*(hours|hrs|minutes|mins|%)/.test(body));
  }
}

console.log("\nthe due-work reminder only fires when there is something to say");
{
  // A reminder that fires every evening saying "0 due" trains people to swipe
  // it away, and then the one that mattered gets swiped too.
  ok("nothing due, nothing late, no push", shouldSendDueWork(0, 0) === false);
  ok("something due fires", shouldSendDueWork(1, 0) === true);
  ok("something late fires", shouldSendDueWork(0, 1) === true);
}

console.log("\nand counts what is due, never what is undone");
{
  // Whether a thing has been handed in is encrypted; the server can only see
  // that a due date is tomorrow. "3 you still need to do" would sometimes be
  // a lie, "3 due tomorrow" is true either way.
  const m = dueWorkMessage(3, 0);
  const said = `${m.title} ${m.body}`.toLowerCase();
  ok("says what is due", m.title.includes("3 due tomorrow"));
  ok("does not claim the work is undone", !said.includes("need to do") && !said.includes("still have"));

  ok("one is grammatical", dueWorkMessage(1, 0).body.includes("One thing"));
  ok("overdue alone reads as overdue", dueWorkMessage(0, 2).title.includes("2 past"));
  ok("both are mentioned together", dueWorkMessage(2, 1).body.includes("1 past its date"));
  // Never tells anyone off — the same rule the other two nudges follow.
  ok("late work is not scolded", dueWorkMessage(0, 4).body.includes("Still worth handing in"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
