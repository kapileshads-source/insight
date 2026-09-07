import "server-only";

import {
  hasGradebook,
  isStillLoginPage,
  loginErrorText,
  verificationToken,
} from "./hac-session";

/**
 * Signing into Home Access Center on a student's behalf.
 *
 * HAC has no API. It is an ASP.NET form, so this is a two-step POST: fetch the
 * login page for its anti-forgery token, then post the token and the
 * credentials back with the cookie jar it handed out.
 *
 * ## Why this exists at all, given the extension
 *
 * The browser extension reads HAC with the session the student already has, and
 * needs no password — which is strictly better, and stays the recommended path.
 * It only exists on desktop Chrome. A student on a phone therefore had no way
 * to see their real gradebook, which for a Frisco student is most of the point
 * of the app.
 *
 * ## The rules, which are the whole reason this is acceptable
 *
 * - **Never in a URL.** The credentials go in a POST body. The public project
 *   that does this puts them in a query string, where they land in access logs,
 *   browser history and referrer headers.
 * - **Never in an error.** Every failure below returns a fixed reason code. A
 *   password must not reach a log line, a stack trace, or a Vercel function
 *   log, and the easiest way to guarantee that is to never put it in a string
 *   that anything else formats.
 * - **The server still cannot read the gradebook.** It fetches the page and
 *   hands it to the student's browser to parse and encrypt. It has no key, so
 *   holding the HTML in memory for the length of one request is the most it
 *   can ever do with it.
 */

const ORIGIN = "https://hac.friscoisd.org";
const LOGIN_URL = `${ORIGIN}/HomeAccess/Account/LogOn?ReturnUrl=%2fHomeAccess%2f`;

/**
 * Where the classwork actually is, in the order worth trying.
 *
 * **The content URL comes first now, and that reordering is the point.** What
 * a browser shows at `/HomeAccess/Classes/Classwork` is a wrapper around an
 * iframe; the tables live at `Content/Student/Assignments.aspx`. Fetching the
 * wrapper server-side returns a shell with no gradebook in it — a perfectly
 * valid 200 containing nothing to parse.
 *
 * The previous order took the first 200 it got, which was always the shell. So
 * a successful login produced an empty sync, and the missing grades looked like
 * a storage bug for a day.
 *
 * Both are still tried, because a campus or a future version may serve the
 * tables from either, and `hasGradebook` decides which answer was real rather
 * than the status code.
 */
const CLASSWORK_URLS = [
  `${ORIGIN}/HomeAccess/Content/Student/Assignments.aspx`,
  `${ORIGIN}/HomeAccess/Classes/Classwork`,
];

/// A browser string. HAC has been observed to behave differently without one,
/// and this is reconnaissance rather than deception: the request really is on
/// behalf of a student who could make it themselves.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

export type HacLoginResult =
  /// `from` is the address that actually produced a gradebook. Reported
  /// because "which page did we get" has now been the answer twice, and
  /// guessing at it cost a day each time.
  | { ok: true; html: string; from: string }
  | {
      ok: false;
      reason: HacFailure;
      /// HAC's own words, when it gave any. Quoted to the student because the
      /// school's wording names the person to ask; never acted on.
      detail?: string;
    };

/// Fixed codes rather than messages. Nothing derived from the credentials can
/// end up in one of these.
export type HacFailure =
  | "BAD_CREDENTIALS"
  | "UNREACHABLE"
  | "BLOCKED"
  | "NO_CLASSWORK";

/// Cookies, kept in memory for exactly one login. Deliberately not a persistent
/// session store: a stored HAC cookie is a second credential to protect, and
/// re-logging in costs one extra request a few times a day.
function jarFrom(response: Response, jar: Map<string, string>) {
  // `getSetCookie` is the only way to see more than one; a plain get() joins
  // them into a single unusable string.
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const index = pair.indexOf("=");
    if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1));
  }
}

const cookieHeader = (jar: Map<string, string>) =>
  [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

export async function fetchClasswork(
  username: string,
  password: string,
): Promise<HacLoginResult> {
  const jar = new Map<string, string>();

  let form: Response;
  try {
    form = await fetch(LOGIN_URL, {
      headers: { "User-Agent": UA },
      redirect: "manual",
    });
  } catch {
    return { ok: false, reason: "UNREACHABLE" };
  }
  jarFrom(form, jar);

  const loginHtml = await form.text();
  const token = verificationToken(loginHtml);
  if (!token) return { ok: false, reason: "BLOCKED" };

  // Every field the real form posts, in the order it posts them.
  //
  // Read off the live page on 2026-09-06 rather than copied from the
  // third-party parser, which omits `Type`, `LocalLogin` and `SiteCode`. ASP.NET
  // binds the whole model, and a login built from the fields that *look*
  // necessary is how this failed the first time it was tried against a real
  // account. `tempUN` and `tempPW` really are empty decoys, and really are sent.
  const body = new URLSearchParams({
    __RequestVerificationToken: token,
    Type: "Normal",
    LocalLogin: "False",
    SiteCode: "",
    SCKTY00328510CustomEnabled: "False",
    SCKTY00436568CustomEnabled: "False",
    Database: "10",
    VerificationOption: "UsernamePassword",
    "LogOnDetails.UserName": username,
    tempUN: "",
    tempPW: "",
    "LogOnDetails.Password": password,
  });

  let auth: Response;
  try {
    auth = await fetch(LOGIN_URL, {
      method: "POST",
      redirect: "manual",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader(jar),
        Referer: LOGIN_URL,
        Origin: ORIGIN,
        // In the header *as well as* the body. Both are required; sending only
        // the form field fails. This was here, then removed in favour of Origin
        // on the assumption it was belt-and-braces — it is not, and that
        // assumption is a strong candidate for why a verified login stopped
        // returning anything.
        __RequestVerificationToken: token,
      },
      body,
    });
  } catch {
    return { ok: false, reason: "UNREACHABLE" };
  }
  jarFrom(auth, jar);

  // A successful login redirects. A failed one answers 200 with the form again.
  if (auth.status === 200) {
    const page = await auth.text();
    if (isStillLoginPage(page)) {
      return {
        ok: false,
        reason: "BAD_CREDENTIALS",
        detail: loginErrorText(page) ?? undefined,
      };
    }
  }

  // Follow the login through to a real page before asking for anything else.
  //
  // Two things were wrong here, both of them invisible. The POST answers 302
  // and `redirect: "manual"` meant that redirect was never followed, so the
  // session was left half-established — and every subsequent request was made
  // with a cookie jar that had not finished being filled. A working
  // implementation of this same login does exactly this GET, and treats *its*
  // URL as the proof of success rather than the POST's status.
  //
  // That is the better check, too: HAC answers 200 whether the password was
  // right or wrong, so the only reliable signal is where you end up afterwards.
  let landed: Response;
  try {
    landed = await fetch(`${ORIGIN}/HomeAccess/Content/Student/Classes.aspx`, {
      headers: { "User-Agent": UA, Cookie: cookieHeader(jar) },
      redirect: "follow",
    });
  } catch {
    return { ok: false, reason: "UNREACHABLE" };
  }
  jarFrom(landed, jar);

  // Bounced back to the sign-in page means the credentials were refused,
  // whatever the POST appeared to say.
  if (/logon/i.test(landed.url)) {
    return { ok: false, reason: "BAD_CREDENTIALS" };
  }
  const landedHtml = await landed.text();
  if (isStillLoginPage(landedHtml)) {
    return {
      ok: false,
      reason: "BAD_CREDENTIALS",
      detail: loginErrorText(landedHtml) ?? undefined,
    };
  }

  for (const url of CLASSWORK_URLS) {
    try {
      const page = await fetch(url, {
        headers: { "User-Agent": UA, Cookie: cookieHeader(jar) },
        // Followed, not manual. ASP.NET redirects freely once a session is
        // live, and treating a 302 as a failure skipped straight past the
        // page we were asking for.
        redirect: "follow",
      });
      if (page.status !== 200) continue;
      const html = await page.text();
      // Bounced back to the login form means the session did not take.
      if (isStillLoginPage(html)) return { ok: false, reason: "BAD_CREDENTIALS" };
      // A 200 is not the same as a gradebook. The wrapper URL answers 200 with
      // an iframe and nothing else, and taking that as success is what produced
      // a sync that read zero classes without ever reporting an error.
      if (hasGradebook(html)) return { ok: true, html, from: url };
    } catch {
      // Try the other address before giving up.
    }
  }

  return { ok: false, reason: "NO_CLASSWORK" };
}
