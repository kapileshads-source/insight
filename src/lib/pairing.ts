import type { EncryptionSetup } from "@/lib/crypto";

/**
 * The pairing code a phone gets, which is not the one a laptop gets.
 *
 * The extension and the desktop apps only ever *add*, they count sites and
 * apps and post them, and the pairing screen says so in as many words:
 * pairing grants the ability to add, never to read. That is only true because
 * a device token cannot reach anything encrypted.
 *
 * A phone is a different thing. It shows you your own data and lets you log
 * from bed, so it needs the key. The obvious way to give it one, an endpoint
 * that hands out key material to a bearer token, would quietly make that
 * sentence false for every device, and would mean a stolen token could pull
 * down the wrapped key and grind at the password offline.
 *
 * So the material travels inside the pairing code instead. It is assembled in
 * the browser, which is already signed in and already holds it, and it never
 * becomes something the server will hand out. A stolen device token still
 * gets exactly what it got before: the ability to add.
 *
 * None of what's inside is a secret on its own. A salt is public by design and
 * the wrapped key is useless without the password, which is not in here, and
 * never leaves the student's head. But the code is long and it is worth
 * treating as private, so the UI says to paste it once and not to share it.
 */

export type PhonePairing = {
  /// Bumped if the shape changes, so an old app fails loudly rather than
  /// misreading a field.
  v: 1;
  base: string;
  token: string;
  setup: EncryptionSetup;
};

/// Base64url, so it survives being pasted into anything, no padding to lose,
/// no characters a text field will helpfully autocorrect.
export function encodePhonePairing(pairing: PhonePairing): string {
  const json = JSON.stringify(pairing);
  const bytes = new TextEncoder().encode(json);

  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodePhonePairing(code: string): PhonePairing | null {
  try {
    const normalised = code.trim().replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalised);

    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as PhonePairing;

    // Checked field by field rather than trusted: this is the one input that
    // arrives by being typed, and half a code pasted is the likely failure.
    if (parsed?.v !== 1) return null;
    if (typeof parsed.base !== "string" || !parsed.base) return null;
    if (typeof parsed.token !== "string" || !parsed.token) return null;

    const s = parsed.setup;
    if (
      !s ||
      typeof s.salt !== "string" ||
      typeof s.wrappedDek !== "string" ||
      typeof s.wrapIv !== "string" ||
      typeof s.verifierCipher !== "string" ||
      typeof s.verifierIv !== "string" ||
      typeof s.iterations !== "number" ||
      s.iterations < 1
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}
