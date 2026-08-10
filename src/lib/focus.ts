/**
 * The Focus shortcut handshake.
 *
 * iOS won't let any app — native or web — turn on a Focus. Only Shortcuts can,
 * and only when the student runs one. What we get is a URL: tapping it opens
 * Shortcuts, asks once, and runs the shortcut they made.
 *
 * So the deal is that the student creates two shortcuts with these exact
 * names, and Insight offers a button that runs them. It's a tap rather than
 * automatic — nothing we control runs on the phone at the moment a session
 * starts, so nothing else is possible from a web page.
 *
 * **These names must match `ios/Sources/Focus.swift`.** A student who sets up
 * the shortcuts for one and finds the other silently does nothing would
 * reasonably conclude the feature is broken.
 */

export const FOCUS_ON_SHORTCUT = "Insight Study On";
export const FOCUS_OFF_SHORTCUT = "Insight Study Off";

export function shortcutUrl(name: string): string {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(name)}`;
}
