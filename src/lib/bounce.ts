/**
 * The name of whatever app bounced a student here.
 *
 * It arrives in a query string that anyone can write, and it gets rendered
 * back to the reader — so it is treated as hostile text rather than as a
 * label we chose. React escapes it, but a 4,000-character "app name" or one
 * full of newlines would still wreck the page, and a link dressed up as an
 * app name would be a neat way to make Insight's own domain deliver someone
 * else's message.
 *
 * Kept deliberately narrow: letters, digits, spaces and the handful of marks
 * real app names use. "TikTok", "X", "Call of Duty: Mobile". Anything else and
 * we say nothing rather than saying something strange.
 */

const MAX_LENGTH = 40;

export function cleanAppName(input: string | undefined | null): string | null {
  if (!input) return null;

  // Rejected outright rather than collapsed. A newline turned into a space
  // would let two lines of someone else's writing arrive as one plausible
  // "app name", and the point of this function is that what we render came
  // from a phone rather than from whoever wrote the link.
  if (/[\r\n\t\u0000-\u001f\u007f]/.test(input)) return null;

  const collapsed = input.replace(/ +/g, " ").trim();
  if (collapsed.length === 0 || collapsed.length > MAX_LENGTH) return null;

  // No scheme-like text, so "https://elsewhere.example" can't be presented as
  // the name of an app on someone's phone.
  if (/[:/\\<>]/.test(collapsed)) return null;

  return /^[\p{L}\p{N}][\p{L}\p{N} '&+.!-]*$/u.test(collapsed) ? collapsed : null;
}
