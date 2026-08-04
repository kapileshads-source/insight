/**
 * Optional on-device storage for the unlocked data key.
 *
 * A CryptoKey is structured-cloneable, so IndexedDB can hold one directly and
 * a non-extractable key stays non-extractable across the round trip. No script
 * can read the raw bytes back out — it can only be used to encrypt and decrypt.
 *
 * This is off by default and always will be. Half of these students are on a
 * shared family laptop or a school Chromebook, and "stay unlocked" on a shared
 * machine means the next person to open the browser reads a year of someone
 * else's sleep and grades. It is offered, explained, and opt-in.
 */

const DB_NAME = "insight-keys";
const STORE = "keys";
const RECORD = "dek";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function available(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function rememberKey(key: CryptoKey): Promise<void> {
  if (!available()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(key, RECORD);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Private browsing and some locked-down profiles reject IndexedDB writes.
    // Failing to remember is not worth interrupting the student over — they
    // are already unlocked for this session.
  }
}

export async function recallKey(): Promise<CryptoKey | null> {
  if (!available()) return null;
  try {
    const db = await openDb();
    const key = await new Promise<CryptoKey | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(RECORD);
      req.onsuccess = () => resolve((req.result as CryptoKey) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return key;
  } catch {
    return null;
  }
}

export async function forgetKey(): Promise<void> {
  if (!available()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(RECORD);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // Nothing to do — the key either wasn't there or can't be reached.
  }
}
