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

export type DesktopOs = "windows" | "mac" | "android" | "other";

/// Whether to offer the Focus shortcut, which only exists on Apple's phones.
///
/// An iPad running iPadOS claims to be a Macintosh and is missed by this. That
/// costs an iPad user a button they'd have liked, which is a great deal better
/// than showing every Mac user a button that does nothing.
export function isIOS(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return /iPhone|iPad|iPod/i.test(userAgent);
}

export function detectOs(userAgent: string | null | undefined): DesktopOs {
  if (!userAgent) return "other";

  // Android before everything else: its UA contains "Linux", and Chrome on a
  // Chromebook looks similar enough to be worth deciding deliberately.
  if (/Android/i.test(userAgent)) return "android";

  // An iPhone can run none of these.
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "other";

  if (/Windows/i.test(userAgent)) return "windows";

  // Chrome and Safari on modern macOS still say "Mac OS X".
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "mac";

  return "other";
}
