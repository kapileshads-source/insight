import {
  createEncryptionSetup,
  unlock,
  changePassword,
  seal,
  open,
  checkPassword,
  WrongPasswordError,
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
