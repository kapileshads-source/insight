/**
 * Client-side encryption.
 *
 * Everything in this file runs in the browser. The password never leaves the
 * device, which is the entire point, and also why there is no password reset.
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
/// a mid-range laptop, which is the point, it is what makes a short
/// password expensive to attack offline.
export const PBKDF2_ITERATIONS = 600_000;
export const KDF_NAME = "PBKDF2-SHA256";

/// Encrypted under the KEK so a wrong password can be reported as such,
/// rather than surfacing as "your data is corrupt".
const VERIFIER_PLAINTEXT = "insight-verifier-v1";

/// WebCrypto only exists in a secure context. Localhost and HTTPS qualify;
/// a plain-http LAN address does not, which is exactly how someone testing
/// from their phone on the school wifi would hit it. Without this check the
/// failure is `crypto.subtle is undefined` thrown from inside key derivation
/// and surfaced as a generic "something went wrong", the student retypes
/// their password five times and concludes the app is broken.
export function cryptoAvailable(): boolean {
  return (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.subtle !== "undefined"
  );
}

export class UnsupportedBrowserError extends Error {
  constructor() {
    super(
      "This browser can't encrypt your data. Insight needs a secure connection, open it over https, or use localhost rather than an IP address.",
    );
    this.name = "UnsupportedBrowserError";
  }
}

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

/**
 * Create a fresh setup for a student who has just chosen a password.
 *
 * Returns the record to persist, the unlocked data key to use now, and a
 * recovery code to show them once. The recovery key is minted here rather than
 * offered later on purpose: an account that has never had one is an account
 * where forgetting the password destroys the data, and "we'll set that up
 * later" is a sentence nobody comes back from.
 */
export async function createEncryptionSetup(password: string): Promise<{
  setup: EncryptionSetup;
  recovery: RecoverySetup;
  code: string;
  dek: CryptoKey;
}> {
  if (!cryptoAvailable()) throw new UnsupportedBrowserError();

  // The data key is random, not derived. That is what lets the password
  // change without touching a single encrypted row.
  const dekBytes = randomBytes(32);

  return {
    setup: await rewrapUnder(password, dekBytes),
    ...(await wrapForRecovery(dekBytes)),
    dek: await importDek(dekBytes),
  };
}

/// Non-extractable so that once unlocked, no script can read the key material
/// back out, it can only be used to encrypt and decrypt.
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
  if (!cryptoAvailable()) throw new UnsupportedBrowserError();

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

// --- recovery ---------------------------------------------------------------

/**
 * A recovery key: a second, independent way into the same data key.
 *
 * This is what makes "I forgot my password" survivable. Without it the honest
 * answer is that the data is gone, because the server genuinely cannot read
 * it, that is the whole architecture, not a missing feature. The usual fix is
 * for the provider to keep an escrow copy of the key, which would mean Insight
 * could read a student's gradebook whenever it liked, and the privacy pages
 * say in as many words that it cannot.
 *
 * So the escrow is given to the student instead. A random code is generated in
 * their browser, a second copy of the DEK is wrapped under it, and only that
 * wrapped copy is stored. Anyone holding the code can open the data; nobody
 * else can, this server included. It is the same design 1Password and Signal
 * use, and it has the same catch: a code nobody wrote down is worth nothing.
 *
 * The code is shown exactly once, at the moment it is made. Storing it, mailing
 * it, or letting it be fetched again would each re-create the escrow this is
 * meant to avoid.
 */

/// Crockford's base32, which drops I, L, O and U. A student is going to write
/// this on paper and type it back weeks later, and 0/O and 1/I are the two
/// mistakes that guarantee they get it wrong exactly when it matters.
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// Five groups of five. 25 characters of a 32-symbol alphabet is 125 bits,
/// which is past the point where guessing is the attack anyone would pick.
const CODE_GROUPS = 5;
const CODE_GROUP_LENGTH = 5;

export class WrongRecoveryKeyError extends Error {
  constructor() {
    super("That recovery key doesn't match.");
    this.name = "WrongRecoveryKeyError";
  }
}

/// What the server stores so a recovery key can be used later. Useless without
/// the code itself, exactly like `wrappedDek` is useless without the password.
export type RecoverySetup = {
  recoverySalt: string;
  recoveryWrappedDek: string;
  recoveryWrapIv: string;
  recoveryVerifierCipher: string;
  recoveryVerifierIv: string;
};

/// Generated from the CSPRNG with rejection sampling rather than `% 32`.
/// The alphabet is exactly 32 long so the modulo would in fact be uniform
/// here, but writing it the biased way invites someone to change the alphabet
/// later and silently weaken the code.
export function generateRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < CODE_GROUPS; g++) {
    let group = "";
    while (group.length < CODE_GROUP_LENGTH) {
      const byte = randomBytes(1)[0];
      // 256 is 8 × 32, so every byte maps evenly and nothing is rejected.
      // The guard is here for whoever shortens the alphabet.
      if (byte >= 256 - (256 % CODE_ALPHABET.length)) continue;
      group += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }
    groups.push(group);
  }
  return groups.join("-");
}

/// Accepts what a person actually types: lower case, missing dashes, spaces,
/// and the four letters Crockford maps back to digits. Being strict here would
/// mean rejecting a correct key because it was typed in lower case, at the one
/// moment a student has no other way in.
export function normalizeRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
    .replace(/U/g, "V")
    .replace(/[^0-9A-Z]/g, "");
}

/**
 * Wrap the data key under a fresh recovery code.
 *
 * Takes the raw key bytes rather than a `CryptoKey`, because the imported DEK
 * is deliberately non-extractable, there is no way to read it back out of an
 * unlocked session. So this is called at two moments only, both of which have
 * the bytes in hand: creating an account, and recovering with an old code.
 */
async function wrapForRecovery(
  dekBytes: Uint8Array,
): Promise<{ code: string; recovery: RecoverySetup }> {
  const code = generateRecoveryCode();
  const salt = randomBytes(16);
  // The same KDF cost as a password. A 125-bit code does not need stretching
  // to resist guessing, but the cost is paid once, in a flow a student runs
  // approximately never, and matching the password path means there is one
  // derivation function to audit rather than two.
  const kek = await deriveKek(normalizeRecoveryCode(code), salt, PBKDF2_ITERATIONS);

  const wrapIv = randomBytes(12);
  const wrapped = await crypto.subtle.encrypt(
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
    code,
    recovery: {
      recoverySalt: toBase64(salt),
      recoveryWrappedDek: toBase64(wrapped),
      recoveryWrapIv: toBase64(wrapIv),
      recoveryVerifierCipher: toBase64(verifierCipher),
      recoveryVerifierIv: toBase64(verifierIv),
    },
  };
}

/// Make a recovery key for an account that has one already or has none, using
/// the current password to get at the data key. Issuing a new one replaces the
/// old, which is what a student expects from "I lost the paper".
export async function createRecoveryKey(
  password: string,
  setup: EncryptionSetup,
): Promise<{ code: string; recovery: RecoverySetup }> {
  if (!cryptoAvailable()) throw new UnsupportedBrowserError();
  return wrapForRecovery(await unwrapDekBytes(password, setup));
}

/**
 * Recover with a code: hand back the data key *and* a fresh setup under a new
 * password, plus a new recovery key.
 *
 * The old code is retired in the same step. A recovery key that still worked
 * after being used would sit in a screenshot or a notes app indefinitely, and
 * the student has no way to tell whether anyone else read it, which is
 * precisely the situation they are in when they reach for it.
 */
export async function recoverWithKey(
  inputCode: string,
  newPassword: string,
  setup: EncryptionSetup,
  recovery: RecoverySetup,
): Promise<{
  dek: CryptoKey;
  setup: EncryptionSetup;
  recovery: RecoverySetup;
  code: string;
}> {
  if (!cryptoAvailable()) throw new UnsupportedBrowserError();

  const code = normalizeRecoveryCode(inputCode);
  const kek = await deriveKek(
    code,
    fromBase64(recovery.recoverySalt),
    setup.iterations,
  );

  // Verifier first, so a mistyped code reads as a mistyped code.
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(recovery.recoveryVerifierIv) as unknown as BufferSource,
      },
      kek,
      fromBase64(recovery.recoveryVerifierCipher) as unknown as BufferSource,
    );
    if (fromUtf8.decode(plain) !== VERIFIER_PLAINTEXT) {
      throw new WrongRecoveryKeyError();
    }
  } catch {
    throw new WrongRecoveryKeyError();
  }

  const dekBytes = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(recovery.recoveryWrapIv) as unknown as BufferSource,
      },
      kek,
      fromBase64(recovery.recoveryWrappedDek) as unknown as BufferSource,
    ),
  );

  return {
    dek: await importDek(dekBytes),
    setup: await rewrapUnder(newPassword, dekBytes),
    ...(await wrapForRecovery(dekBytes)),
  };
}

/// Shared by `changePassword` and `recoverWithKey`: the same data key, wrapped
/// under a new password with a fresh salt and IVs.
async function rewrapUnder(
  password: string,
  dekBytes: Uint8Array | ArrayBuffer,
): Promise<EncryptionSetup> {
  const salt = randomBytes(16);
  const kek = await deriveKek(password, salt, PBKDF2_ITERATIONS);

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
    kdf: KDF_NAME,
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    wrappedDek: toBase64(wrappedDek),
    wrapIv: toBase64(wrapIv),
    verifierCipher: toBase64(verifierCipher),
    verifierIv: toBase64(verifierIv),
  };
}

/// The raw data key, given the password that wraps it.
async function unwrapDekBytes(
  password: string,
  setup: EncryptionSetup,
): Promise<Uint8Array> {
  const kek = await deriveKek(
    password,
    fromBase64(setup.salt),
    setup.iterations,
  );
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: fromBase64(setup.wrapIv) as unknown as BufferSource,
        },
        kek,
        fromBase64(setup.wrappedDek) as unknown as BufferSource,
      ),
    );
  } catch {
    throw new WrongPasswordError();
  }
}

/// Re-wrap the existing data key under a new password. Stored rows are
/// untouched, because the key that encrypted them hasn't changed.
export async function changePassword(
  currentPassword: string,
  newPassword: string,
  setup: EncryptionSetup,
): Promise<EncryptionSetup> {
  return rewrapUnder(
    newPassword,
    await unwrapDekBytes(currentPassword, setup),
  );
}

// --- payload sealing --------------------------------------------------------

/// Encrypt a value into the ciphertext/iv pair every table stores.
/// A fresh IV per row, which AES-GCM requires, reusing one would leak.
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
/// mode we care about is "too weak to protect a year of data", and the copy
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
