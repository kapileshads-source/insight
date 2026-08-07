/**
 * Which desktop OS a visitor is on, from their User-Agent.
 *
 * Done on the server from the request header rather than in the browser after
 * hydration: reading `navigator` during render would make the server and
 * client markup disagree, and doing it in an effect means the page renders
 * once with the wrong answer and then corrects itself in front of the reader.
 *
 * It only ever decides which download to put first. Getting it wrong shows
 * someone two buttons in an unhelpful order, so this guesses cheerfully and
 * never blocks anything.
 */

export type DesktopOs = "windows" | "mac" | "other";

export function detectOs(userAgent: string | null | undefined): DesktopOs {
  if (!userAgent) return "other";

  // Before the Windows check: a Windows phone is nobody's laptop, and
  // Android's UA contains "Linux" rather than either of these.
  if (/iPhone|iPad|iPod|Android/i.test(userAgent)) return "other";

  if (/Windows/i.test(userAgent)) return "windows";

  // Chrome and Safari on modern macOS still say "Mac OS X".
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "mac";

  return "other";
}
