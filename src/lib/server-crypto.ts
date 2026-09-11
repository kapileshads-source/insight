import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Server-side encryption, used for exactly one thing: the Canvas access token.
 *
 * Every other student secret is encrypted in the browser under a key we never
 * see. This one can't be, because the server has to call Canvas on the
 * student's behalf, a background sync can't ask them to type a password.
 *
 * So this protects against a stolen database, not against us. That distinction
 * is the whole reason the privacy page names it explicitly rather than hiding
 * behind the word "encrypted".
 */

const ALGORITHM = "aes-256-gcm";

function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to 32 bytes, got ${buf.length}.`,
    );
  }
  return buf;
}

/// Returns the ciphertext with the auth tag appended, plus the IV separately.
/// GCM's tag is what makes a tampered token fail loudly instead of decrypting
/// to garbage that we'd then send to Canvas.
export function encryptToken(plain: string): { cipher: string; iv: string } {
  const iv = randomBytes(12);
  const c = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const tag = c.getAuthTag();

  return {
    cipher: Buffer.concat([encrypted, tag]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decryptToken(cipher: string, iv: string): string {
  const raw = Buffer.from(cipher, "base64");
  const tag = raw.subarray(raw.length - 16);
  const body = raw.subarray(0, raw.length - 16);

  const d = createDecipheriv(ALGORITHM, key(), Buffer.from(iv, "base64"));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8");
}
