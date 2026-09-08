import {
  createEncryptionSetup,
  unlock,
  changePassword,
  seal,
  open,
  checkPassword,
  createRecoveryKey,
  recoverWithKey,
  generateRecoveryCode,
  normalizeRecoveryCode,
  WrongPasswordError,
  WrongRecoveryKeyError,
} from "../crypto.ts";

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) {
    pass++;
    console.log("  ok  ", name);
  } else {
    fail++;
    console.log("  FAIL", name);
  }
};

const PASSWORD = "copper lantern drifting harbor";
const SESSION = {
  location: "LIBRARY",
  noise: "QUIET",
  stress: 3,
  cram: false,
  minutes: 47,
};

console.log("setup + round trip");
const t0 = Date.now();
const { setup, dek } = await createEncryptionSetup(PASSWORD);
console.log(`  (key derivation took ${Date.now() - t0}ms)`);

ok("salt is stored", typeof setup.salt === "string" && setup.salt.length > 0);
ok("iterations recorded", setup.iterations === 600000);
ok(
  "setup contains no plaintext password",
  !JSON.stringify(setup).includes(PASSWORD),
);

const sealed = await seal(dek, SESSION);
ok("ciphertext differs from plaintext", !sealed.cipher.includes("LIBRARY"));
const back = await open(dek, sealed);
ok("round trip preserves value", JSON.stringify(back) === JSON.stringify(SESSION));

console.log("\nfresh IV per row");
const a = await seal(dek, SESSION);
const b = await seal(dek, SESSION);
ok("same value seals to different ciphertext", a.cipher !== b.cipher);
ok("IVs differ", a.iv !== b.iv);

console.log("\nunlocking");
const dek2 = await unlock(PASSWORD, setup);
const viaUnlocked = await open(dek2, sealed);
ok(
  "data unlocks on a new session",
  JSON.stringify(viaUnlocked) === JSON.stringify(SESSION),
);

let threw = null;
try {
  await unlock("copper lantern drifting harbour", setup);
} catch (e) {
  threw = e;
}
ok("wrong password throws WrongPasswordError", threw instanceof WrongPasswordError);

console.log("\nchanging password");
const NEW = "seventeen violet kettles arguing";
const setup2 = await changePassword(PASSWORD, NEW, setup);
const dek3 = await unlock(NEW, setup2);
const stillReadable = await open(dek3, sealed);
ok(
  "data sealed under the old password still opens",
  JSON.stringify(stillReadable) === JSON.stringify(SESSION),
);
ok("salt was rotated", setup2.salt !== setup.salt);

let oldThrew = null;
try {
  await unlock(PASSWORD, setup2);
} catch (e) {
  oldThrew = e;
}
ok("old password no longer works", oldThrew instanceof WrongPasswordError);

console.log("\ntampering");
const tampered = { ...sealed, cipher: sealed.cipher.slice(0, -6) + "AAAAAA" };
let tamperThrew = false;
try {
  await open(dek, tampered);
} catch {
  tamperThrew = true;
}
ok("modified ciphertext fails to open (AES-GCM auth)", tamperThrew);

console.log("\npassword quality");
ok("rejects short", !checkPassword("hunter2").ok);
ok("accepts four words as strong", checkPassword("copper lantern drifting harbor").score === 3);
ok("accepts long single string", checkPassword("Xk9!qzmvb2LPwe4tRn").score >= 2);

console.log("\nrecovery codes");
const code = generateRecoveryCode();
ok("five groups of five", /^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/.test(code));
ok(
  "excludes the letters that get misread as digits",
  !/[ILOU]/.test(code),
);
ok(
  "two codes in a row differ",
  generateRecoveryCode() !== generateRecoveryCode(),
);
ok(
  "normalizing is idempotent on its own output",
  normalizeRecoveryCode(normalizeRecoveryCode(code)) ===
    normalizeRecoveryCode(code),
);
ok(
  "lower case, spaces and missing dashes all normalize the same",
  normalizeRecoveryCode(code.toLowerCase().replace(/-/g, " ")) ===
    normalizeRecoveryCode(code),
);
// The four substitutions Crockford defines. A student who writes down an O
// and types it back must land on the zero that was actually generated.
ok("O reads as zero", normalizeRecoveryCode("O") === "0");
ok("I and L read as one", normalizeRecoveryCode("IL") === "11");
ok("U reads as V", normalizeRecoveryCode("U") === "V");

console.log("\nrecovery round trip");
// A fresh account, some data sealed under it, then the password is forgotten.
const fresh = await createEncryptionSetup(PASSWORD);
const sealedBefore = await seal(fresh.dek, SESSION);

const recovered = await recoverWithKey(
  fresh.code,
  "totally different passphrase here",
  fresh.setup,
  fresh.recovery,
);

ok(
  "the recovered key opens data sealed before recovery",
  JSON.stringify(await open(recovered.dek, sealedBefore)) ===
    JSON.stringify(SESSION),
);
ok(
  "the new password unlocks the account",
  await unlock("totally different passphrase here", recovered.setup)
    .then(() => true)
    .catch(() => false),
);
ok(
  "the old password no longer does",
  await unlock(PASSWORD, recovered.setup)
    .then(() => false)
    .catch((e) => e instanceof WrongPasswordError),
);

// The used code is retired. This is the property that keeps a screenshot of an
// old key from being a permanent way in.
let usedAgain = null;
try {
  await recoverWithKey(
    fresh.code,
    "another passphrase entirely",
    recovered.setup,
    recovered.recovery,
  );
} catch (e) {
  usedAgain = e;
}
ok("the used code stops working", usedAgain instanceof WrongRecoveryKeyError);
ok("a fresh code is issued in its place", recovered.code !== fresh.code);
ok(
  "and that one works",
  await recoverWithKey(
    recovered.code,
    "third passphrase",
    recovered.setup,
    recovered.recovery,
  )
    .then((r) => open(r.dek, sealedBefore))
    .then((v) => JSON.stringify(v) === JSON.stringify(SESSION))
    .catch(() => false),
);

let wrongCode = null;
try {
  await recoverWithKey(
    generateRecoveryCode(),
    "whatever",
    recovered.setup,
    recovered.recovery,
  );
} catch (e) {
  wrongCode = e;
}
ok("a wrong code is reported as wrong", wrongCode instanceof WrongRecoveryKeyError);

console.log("\nreissuing a recovery key");
const reissued = await createRecoveryKey(PASSWORD, setup);
ok(
  "issued from the password, it opens the same data",
  await recoverWithKey("x", "y", setup, reissued.recovery)
    .then(() => false)
    .catch((e) => e instanceof WrongRecoveryKeyError),
);
ok(
  "and the real code recovers the original key",
  await recoverWithKey(reissued.code, "brand new passphrase", setup, reissued.recovery)
    .then((r) => open(r.dek, sealed))
    .then(() => true)
    .catch(() => false),
);

let wrongPw = null;
try {
  await createRecoveryKey("not the password", setup);
} catch (e) {
  wrongPw = e;
}
ok("a wrong password can't mint a key", wrongPw instanceof WrongPasswordError);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
