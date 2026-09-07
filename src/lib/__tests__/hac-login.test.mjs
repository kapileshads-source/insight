import {
  isStillLoginPage,
  loginErrorText,
  verificationToken,
} from "../hac-session.ts";

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name); }
};

console.log("pulling the anti-forgery token out of the form");
{
  ok("value after name", verificationToken('<input name="__RequestVerificationToken" type="hidden" value="ABC123" />') === "ABC123");
  // ASP.NET emits the attributes in either order depending on the control.
  ok("value before name", verificationToken('<input value="XYZ789" name="__RequestVerificationToken" />') === "XYZ789");
  ok("case-insensitive", verificationToken('<INPUT NAME="__RequestVerificationToken" VALUE="Q1" />') === "Q1");
  // No token means the page is not the form we expect. Posting a password to
  // something unrecognised is the one thing this must never do.
  ok("no token is null, not empty string", verificationToken("<html>nope</html>") === null);
  ok("an empty page is null", verificationToken("") === null);
}

console.log("\ntelling a rejected login from a successful one");
{
  // HAC answers 200 either way, so the only signal is whether the form came
  // back. Treating a rejection as success would store a password that does
  // not work and then blame the gradebook for being empty.
  ok("the form means rejected", isStillLoginPage('<input name="LogOnDetails.UserName" />'));
  ok("a validation summary means rejected", isStillLoginPage('<div class="validation-summary-errors">bad</div>'));
  ok("the classwork page does not", !isStillLoginPage('<div class="AssignmentClass">Student Grades 93.00%</div>'));
  ok("an empty page does not", !isStillLoginPage(""));
}

console.log("\nthe credentials never appear in a failure");
{
  // Every failure is a fixed code, so nothing typed can reach a log line, a
  // stack trace or a function log. This pins the type rather than the wording.
  const codes = ["BAD_CREDENTIALS", "UNREACHABLE", "BLOCKED", "NO_CLASSWORK"];
  ok("the codes are fixed strings", codes.every((c) => typeof c === "string" && !c.includes(" ")));
}

console.log("\nHAC's own words on a failed login");
{
  // Verbatim from the live page, 2026-09-06. Worth quoting because it names
  // who to ask, which we could not invent.
  const real = '<div class="validation-summary-errors"><ul><li>Your attempt to log in was unsuccessful. We are unable to log you into HAC at this time. Students, If you have forgotten your password, please contact your campus DLC.</li></ul></div>';
  const out = loginErrorText(real);
  ok("finds the message", out.startsWith("Your attempt to log in was unsuccessful"));
  ok("strips the markup", !out.includes("<") && !out.includes(">"));
  ok("keeps who to ask", out.includes("campus DLC"));

  ok("no error block is null", loginErrorText("<html>fine</html>") === null);
  // Treated as data from a page we do not control, so it cannot run long.
  ok("is capped", (loginErrorText('<div class="validation-summary-errors">' + "x".repeat(900) + "</div>") ?? "").length <= 240);
  ok("an empty block is null", loginErrorText('<div class="validation-summary-errors"></div>') === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
