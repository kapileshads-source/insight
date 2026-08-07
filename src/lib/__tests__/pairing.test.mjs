import { encodePhonePairing, decodePhonePairing } from "../pairing.ts";

/// The phone's pairing code is the one input that arrives by being typed or
/// pasted, so half of one is the likely failure — and a half-read code that
/// decoded to something plausible would be much worse than one that's refused.

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log("  ok  ", name); }
  else { fail++; console.log("  FAIL", name); }
};

const setup = {
  kdf: "PBKDF2-SHA256",
  iterations: 600000,
  salt: "c2FsdHNhbHRzYWx0c2E=",
  wrappedDek: "d3JhcHBlZGRla3dyYXBwZWQ=",
  wrapIv: "aXZpdml2aXZpdml2aXY=",
  verifierCipher: "dmVyaWZpZXJjaXBoZXI=",
  verifierIv: "dmVyaWZpZXJpdg==",
};

const pairing = {
  v: 1,
  base: "https://insight-study-sleep.vercel.app",
  token: "a-token-that-looks-like-this",
  setup,
};

console.log("a code survives the round trip");
{
  const code = encodePhonePairing(pairing);
  const back = decodePhonePairing(code);

  ok("it decodes", back !== null);
  ok("the address survives", back.base === pairing.base);
  ok("the token survives", back.token === pairing.token);
  ok("the salt survives", back.setup.salt === setup.salt);
  ok("the iteration count survives", back.setup.iterations === 600000);
}

console.log("\nit is safe to paste anywhere");
{
  const code = encodePhonePairing(pairing);
  ok("no padding to lose", !code.includes("="));
  ok("no + or / to mangle", !code.includes("+") && !code.includes("/"));
  ok("surrounding whitespace is forgiven",
    decodePhonePairing(`\n  ${code}  \n`) !== null);
}

console.log("\nand a broken one is refused rather than half-read");
{
  const code = encodePhonePairing(pairing);

  ok("half a code", decodePhonePairing(code.slice(0, code.length / 2)) === null);
  ok("empty", decodePhonePairing("") === null);
  ok("not base64 at all", decodePhonePairing("paste failed sorry") === null);
  ok("valid base64 of the wrong thing",
    decodePhonePairing(btoa("hello there")) === null);

  const older = { ...pairing, v: 0 };
  ok("a version this app doesn't know",
    decodePhonePairing(encodePhonePairing(older)) === null);

  const noToken = { ...pairing, token: "" };
  ok("a code with no token", decodePhonePairing(encodePhonePairing(noToken)) === null);

  const noSalt = { ...pairing, setup: { ...setup, salt: undefined } };
  ok("a code missing key material",
    decodePhonePairing(encodePhonePairing(noSalt)) === null);

  const zeroIterations = { ...pairing, setup: { ...setup, iterations: 0 } };
  ok("a code claiming zero iterations",
    decodePhonePairing(encodePhonePairing(zeroIterations)) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
