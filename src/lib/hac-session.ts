/**
 * Reading HAC's login form, without touching the network.
 *
 * Separate from `hac-login.ts` purely so it is testable. That file is marked
 * `server-only`, which is correct, it handles a decrypted password and must
 * never be bundled for a browser, and also means a test runner cannot import
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
    // nothing, this is the one failure that silently breaks everything
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
 * returns a perfectly valid page with no courses in it, so taking the first
 * 200 as success produced a login that worked, a sync that reported no error,
 * and zero classes read. That cost a day of looking in the wrong place.
 *
 * Bound to the same markers the parser reads, so "we accepted this page" and
 * "the parser can do something with it" cannot drift apart.
 */
export function hasGradebook(html: string): boolean {
  // Bound to the containers `hac-dom.ts` actually walks, not to text that
  // happens to appear near them.
  //
  // The first version also accepted any page containing the words "Student
  // Grades", which is looser than the parser is: a page could pass this check
  // and still yield zero courses, which is a worse failure than rejecting it,
  // because it looks like an empty gradebook rather than a wrong page.
  return (
    /class="[^"]*AssignmentClass/i.test(html) ||
    /class="[^"]*sg-content-grid/i.test(html)
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
 * control, so tags are stripped, whitespace collapsed and the result capped,
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

/**
 * Whether a page is the transcript.
 *
 * Bound to the ASP.NET control ids the transcript parser reads, which are the
 * only thing on that page unique to it. Note the fragility tier this sits in:
 * `plnMain_*` ids are generated from the control tree and change when the page
 * is rebuilt, but they fail *loudly*, which is why binding to them is safe
 * here in a way that positional cell indices never are.
 */
export function hasTranscript(html: string): boolean {
  return (
    /plnMain_rpTranscriptGroup_lblYearValue_0/i.test(html) ||
    /plnMain_rpTranscriptGroup_tblCumGPAInfo/i.test(html)
  );
}

/**
 * The address of the frame a HAC page keeps its content in.
 *
 * Confirmed from a real browser's frame tree, 2026-09-07:
 *
 *     top
 *       hac.friscoisd.org/HomeAccess/Classes/Classwork   ← 30KB wrapper
 *         sg-legacy-iframe (Assignments)                 ← the gradebook
 *
 * So the page a student looks at is a shell, and the tables are one hop
 * further in. Fetching the wrapper gives a valid 200 with no courses on it,
 * and `Content/Student/Assignments.aspx` fetched directly returns a 5KB stub
 * rather than the content, which is how this looked like four different bugs
 * in a row.
 *
 * Named `sg-legacy-iframe`, but matched loosely: any frame is a candidate, and
 * one whose name or source mentions the page we want is preferred. A named
 * guess that silently picks the analytics frame would be worse than no guess.
 */
export function frameSource(html: string, hint = "assignment"): string | null {
  const frames = [...html.matchAll(/<iframe\b[^>]*>/gi)].map((m) => m[0]);
  if (frames.length === 0) return null;

  const srcOf = (tag: string): string | null => {
    const m = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    return m ? m[1] : null;
  };

  const wanted = hint.toLowerCase();
  const preferred =
    frames.find((f) => {
      const src = (srcOf(f) ?? "").toLowerCase();
      return src.includes(wanted) || /sg-legacy-iframe/i.test(f);
    }) ?? frames[0];

  const src = srcOf(preferred);
  if (!src) return null;
  // Only same-origin paths are followed. An absolute URL to somewhere else is
  // an analytics or vendor frame, and this must not go chasing it.
  if (/^https?:\/\//i.test(src)) return null;
  return src;
}
