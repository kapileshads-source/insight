"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  UnsupportedBrowserError,
  WrongPasswordError,
  cryptoAvailable,
  open as openSealed,
  seal,
  unlock as deriveKey,
  type Sealed,
} from "@/lib/crypto";
import { forgetKey, recallKey, rememberKey } from "@/lib/key-store";
import { fetchEncryptionSetup } from "@/app/actions/crypto";

export type CryptoStatus =
  | "checking" // looking for a remembered key
  | "locked" // setup exists, needs the password
  | "unlocked"
  | "no-setup" // account hasn't been through the password step yet
  | "unsupported" // no WebCrypto in this context
  | "error"; // couldn't determine which of the above applies

type CryptoContextValue = {
  status: CryptoStatus;
  /// Decrypt a stored payload. Throws if called while locked, which is a bug
  /// rather than a user-facing state — every caller sits behind UnlockGate.
  reveal: <T>(sealed: Sealed) => Promise<T>;
  /// Encrypt a value for storage.
  conceal: (value: unknown) => Promise<Sealed>;
  unlock: (password: string, remember: boolean) => Promise<void>;
  lock: () => Promise<void>;
  /// Adopt a key generated during signup, so a student who has just chosen a
  /// password isn't immediately asked for it again.
  adopt: (dek: CryptoKey, remember: boolean) => Promise<void>;
};

const CryptoContext = createContext<CryptoContextValue | null>(null);

export function CryptoProvider({ children }: { children: React.ReactNode }) {
  // Held in memory only. Client-side navigation preserves it; a hard refresh
  // does not, unless the student opted into remembering it on this device.
  const [dek, setDek] = useState<CryptoKey | null>(null);
  const [status, setStatus] = useState<CryptoStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Everything below is wrapped, because the only state worse than an
      // error is no state at all. This function reaches the network, and
      // without a catch a rejected promise leaves `status` on "checking"
      // forever — which the gate renders as an entirely blank page, with no
      // message and no way out.
      try {
        if (!cryptoAvailable()) {
          if (!cancelled) setStatus("unsupported");
          return;
        }

        const remembered = await recallKey();
        if (cancelled) return;
        if (remembered) {
          setDek(remembered);
          setStatus("unlocked");
          return;
        }

        const setup = await fetchEncryptionSetup();
        if (cancelled) return;
        setStatus(setup ? "locked" : "no-setup");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const unlock = useCallback(async (password: string, remember: boolean) => {
    const setup = await fetchEncryptionSetup();
    if (!setup) throw new Error("No encryption set up on this account.");

    // Throws WrongPasswordError on a mismatch, which the screen reports as
    // such rather than as a generic failure.
    const key = await deriveKey(password, setup);

    if (remember) await rememberKey(key);
    setDek(key);
    setStatus("unlocked");
  }, []);

  const adopt = useCallback(async (key: CryptoKey, remember: boolean) => {
    if (remember) await rememberKey(key);
    setDek(key);
    setStatus("unlocked");
  }, []);

  const lock = useCallback(async () => {
    await forgetKey();
    setDek(null);
    setStatus("locked");
  }, []);

  const reveal = useCallback(
    async <T,>(sealed: Sealed): Promise<T> => {
      if (!dek) throw new Error("Locked: no key available to decrypt with.");
      return openSealed<T>(dek, sealed);
    },
    [dek],
  );

  const conceal = useCallback(
    async (value: unknown): Promise<Sealed> => {
      if (!dek) throw new Error("Locked: no key available to encrypt with.");
      return seal(dek, value);
    },
    [dek],
  );

  const value = useMemo(
    () => ({ status, reveal, conceal, unlock, lock, adopt }),
    [status, reveal, conceal, unlock, lock, adopt],
  );

  return (
    <CryptoContext.Provider value={value}>{children}</CryptoContext.Provider>
  );
}

export function useCrypto(): CryptoContextValue {
  const ctx = useContext(CryptoContext);
  if (!ctx) throw new Error("useCrypto must be used inside CryptoProvider");
  return ctx;
}

export { WrongPasswordError, UnsupportedBrowserError };
