/**
 * Reading HAC's login form, without touching the network.
 *
 * Separate from `hac-login.ts` purely so it is testable. That file is marked
 * `server-only`, which is correct — it handles a decrypted password and must
 * never be bundled for a browser — and also means a test runner cannot import
 * it. These two functions are where the actual judgement lives, so they live
 * where they can be checked.
 */

/// The anti-forgery token, out of the login form. ASP.NET emits the attributes
/// in either order depending on the control, so both are matched.
export function verificationToken(html: string): string | null {
  const match =
    html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/i) ??
    html.match(/value="([^"]+)"[^>]*name="__RequestVerificationToken"/i);
  return match ? match[1] : null;
}

/**
 * Whether we are still looking at the login form.
 *
 * This is the only way to tell a rejected password from an accepted one: HAC
 * answers 200 either way and simply re-renders the form. Reading a rejection
 * as success would store a password that does not work, and then blame the
 * gradebook for being empty.
 */
export function isStillLoginPage(html: string): boolean {
  return (
    /name="LogOnDetails\.UserName"/i.test(html) ||
    /class="[^"]*validation-summary-errors/i.test(html) ||
    // The exact string HAC renders on a rejected password. Checked because a
    // bad login answers 200 with the form re-rendered, so status alone says
    // nothing — this is the one failure that silently breaks everything
    // downstream if it is read as success.
    /invalid user name or password/i.test(html)
  );
}

/**
 * Whether a page actually contains a gradebook.
 *
 * **A 200 is not the same as data.** What a browser shows at
 * `/HomeAccess/Classes/Classwork` is a wrapper around an iframe; the tables
 * live at `Content/Student/Assignments.aspx`. Fetched server-side, the wrapper
 * returns a perfectly valid page with no courses in it — so taking the first
 * 200 as success produced a login that worked, a sync that reported no error,
 * and zero classes read. That cost a day of looking in the wrong place.
 *
 * Bound to the same markers the parser reads, so "we accepted this page" and
 * "the parser can do something with it" cannot drift apart.
 */
export function hasGradebook(html: string): boolean {
  return (
    /class="[^"]*AssignmentClass/i.test(html) ||
    /class="[^"]*sg-header-heading/i.test(html) ||
    /Student\s+Grades/i.test(html)
  );
}

/**
 * HAC's own explanation of a failed login.
 *
 * Worth surfacing because it is far more useful than anything we could write:
 * the real page says "contact your campus DLC to reset your password", which
 * tells a student exactly who to go to. We do not know their district's
 * procedures and should not invent them.
 *
 * **Treated as data, never as instruction.** It is text from a page we do not
 * control, so tags are stripped, whitespace collapsed and the result capped —
 * it is quoted to the student as the school's words, and nothing acts on it.
 */
export function loginErrorText(html: string): string | null {
  const match = html.match(
    /class="[^"]*validation-summary-errors[^"]*"[^>]*>([\s\S]{0,600}?)<\/div>/i,
  );
  if (!match) return null;

  const text = match[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length < 8) return null;
  return text.slice(0, 240);
}
