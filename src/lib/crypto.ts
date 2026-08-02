/**
 * Client-side encryption.
 *
 * Everything in this file runs in the browser. The password never leaves the
 * device, which is the entire point — and also why there is no password reset.
 *
 * Two-key design:
 *
 *   password --PBKDF2--> KEK --wraps--> DEK --encrypts--> the student's data
 *
 * The data key is random and never derived from anything the student types.
 * Only its wrapped form reaches the server. Changing a password therefore
 * re-wraps one 32-byte key instead of re-encrypting a year of study logs.
 *
 * AES-GCM throughout, which authenticates as well as encrypts: a wrong
 * password fails to decrypt rather than silently producing garbage.
 */

/// OWASP's floor for PBKDF2-SHA256 as of 2023. Costs roughly half a second on
/// a mid-range laptop, which is the point — it is what makes a short
/// password expensive to attack offline.
export const PBKDF2_ITERATIONS = 600_000;
export const KDF_NAME = "PBKDF2-SHA256";

/// Encrypted under the KEK so a wrong password can be reported as such,
/// rather than surfacing as "your data is corrupt".
const VERIFIER_PLAINTEXT = "insight-verifier-v1";

export class WrongPasswordError extends Error {
  constructor() {
    super("That password doesn't match.");
    this.name = "WrongPasswordError";
  }
}

/// Everything the server stores about a student's encryption setup. None of it
/// is secret on its own: a salt is public by design, and the wrapped key is
/// useless without the password.
export type EncryptionSetup = {
  kdf: string;
  iterations: number;
  salt: string;
  wrappedDek: string;
  wrapIv: string;
  verifierCipher: string;
  verifierIv: string;
};

export type Sealed = { cipher: string; iv: string };

// --- encoding helpers -------------------------------------------------------

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < view.length; i++) s += String.fromCharCode(view[i]);
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

// --- key derivation ---------------------------------------------------------

/// Stretch the password into a key-encryption key. Deliberately slow.
async function deriveKek(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    utf8.encode(password.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/// Create a fresh setup for a student who has just chosen a password.
/// Returns both the record to persist and the unlocked data key to use now.
export async function createEncryptionSetup(
  password: string,
): Promise<{ setup: EncryptionSetup; dek: CryptoKey }> {
  const salt = randomBytes(16);
  const kek = await deriveKek(password, salt, PBKDF2_ITERATIONS);

  // The data key is random, not derived. That is what lets the password
  // change without touching a single encrypted row.
  const dekBytes = randomBytes(32);

  const wrapIv = randomBytes(12);
  const wrappedDek = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: wrapIv as unknown as BufferSource },
    kek,
    dekBytes as unknown as BufferSource,
  );

  const verifierIv = randomBytes(12);
  const verifierCipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: verifierIv as unknown as BufferSource },
    kek,
    utf8.encode(VERIFIER_PLAINTEXT) as unknown as BufferSource,
  );

  return {
    setup: {
      kdf: KDF_NAME,
      iterations: PBKDF2_ITERATIONS,
      salt: toBase64(salt),
      wrappedDek: toBase64(wrappedDek),
      wrapIv: toBase64(wrapIv),
      verifierCipher: toBase64(verifierCipher),
      verifierIv: toBase64(verifierIv),
    },
    dek: await importDek(dekBytes),
  };
}

/// Non-extractable so that once unlocked, no script can read the key material
/// back out — it can only be used to encrypt and decrypt.
async function importDek(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw as unknown as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/// Unlock with a password. Throws WrongPasswordError if it doesn't match.
export async function unlock(
  password: string,
  setup: EncryptionSetup,
): Promise<CryptoKey> {
  const kek = await deriveKek(
    password,
    fromBase64(setup.salt),
    setup.iterations,
  );

  // Check the verifier first, so a mismatch is reported as a wrong password
  // rather than as unreadable data.
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(setup.verifierIv) as unknown as BufferSource,
      },
      kek,
      fromBase64(setup.verifierCipher) as unknown as BufferSource,
    );
    if (fromUtf8.decode(plain) !== VERIFIER_PLAINTEXT) {
      throw new WrongPasswordError();
    }
  } catch {
    throw new WrongPasswordError();
  }

  const dekBytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(setup.wrapIv) as unknown as BufferSource },
    kek,
    fromBase64(setup.wrappedDek) as unknown as BufferSource,
  );

  return importDek(new Uint8Array(dekBytes));
}

/// Re-wrap the existing data key under a new password. Stored rows are
/// untouched, because the key that encrypted them hasn't changed.
export async function changePassword(
  currentPassword: string,
  newPassword: string,
  setup: EncryptionSetup,
): Promise<EncryptionSetup> {
  const kek = await deriveKek(
    currentPassword,
    fromBase64(setup.salt),
    setup.iterations,
  );

  let dekBytes: ArrayBuffer;
  try {
    dekBytes = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(setup.wrapIv) as unknown as BufferSource,
      },
      kek,
      fromBase64(setup.wrappedDek) as unknown as BufferSource,
    );
  } catch {
    throw new WrongPasswordError();
  }

  const salt = randomBytes(16);
  const newKek = await deriveKek(newPassword, salt, PBKDF2_ITERATIONS);

  const wrapIv = randomBytes(12);
  const wrappedDek = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: wrapIv as unknown as BufferSource },
    newKek,
    dekBytes,
  );

  const verifierIv = randomBytes(12);
  const verifierCipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: verifierIv as unknown as BufferSource },
    newKek,
    utf8.encode(VERIFIER_PLAINTEXT) as unknown as BufferSource,
  );

  return {
    kdf: KDF_NAME,
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    wrappedDek: toBase64(wrappedDek),
    wrapIv: toBase64(wrapIv),
    verifierCipher: toBase64(verifierCipher),
    verifierIv: toBase64(verifierIv),
  };
}

// --- payload sealing --------------------------------------------------------

/// Encrypt a value into the ciphertext/iv pair every table stores.
/// A fresh IV per row, which AES-GCM requires — reusing one would leak.
export async function seal(dek: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = randomBytes(12);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    dek,
    utf8.encode(JSON.stringify(value)) as unknown as BufferSource,
  );
  return { cipher: toBase64(cipher), iv: toBase64(iv) };
}

export async function open<T>(dek: CryptoKey, sealed: Sealed): Promise<T> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(sealed.iv) as unknown as BufferSource },
    dek,
    fromBase64(sealed.cipher) as unknown as BufferSource,
  );
  return JSON.parse(fromUtf8.decode(plain)) as T;
}

// --- password quality -----------------------------------------------------

export type PasswordCheck = {
  ok: boolean;
  score: 0 | 1 | 2 | 3;
  message: string;
};

/// A deliberately plain check. This password cannot be reset, so the failure
/// mode we care about is "too weak to protect a year of data" — and the copy
/// has to say that to a fifteen-year-old without lecturing.
export function checkPassword(p: string): PasswordCheck {
  const trimmed = p.trim();

  if (trimmed.length < 10) {
    return {
      ok: false,
      score: 0,
      message: "Needs to be at least 10 characters.",
    };
  }

  const variety =
    Number(/[a-z]/.test(trimmed)) +
    Number(/[A-Z]/.test(trimmed)) +
    Number(/\d/.test(trimmed)) +
    Number(/[^A-Za-z0-9]/.test(trimmed));
  const words = trimmed.split(/\s+/).filter(Boolean).length;

  // Four random words beat a short scrambled string, and people actually
  // remember them, which matters more here than anywhere else in the app.
  if (words >= 4 || trimmed.length >= 20) {
    return { ok: true, score: 3, message: "Strong." };
  }
  if (trimmed.length >= 14 && variety >= 2) {
    return { ok: true, score: 2, message: "Good." };
  }
  return {
    ok: true,
    score: 1,
    message: "Works, but a few random words would be stronger and easier to remember.",
  };
}
