/**
 * Trezor. Sbírka je v IndexedDB uložená zašifrovaná — i kdyby se někdo dostal
 * k profilu prohlížeče, bez hesla z toho nic nedostane.
 *
 * Klíč do IndexedDB je id účtu, takže dva účty na jednom počítači se nevidí.
 * A i kdyby si jeden přečetl blok toho druhého, je zašifrovaný jeho klíčem.
 */
import { seal, open, type Sealed } from "../auth/crypto";
import { EMPTY_COLLECTION, type Collection } from "./types";

const DB_NAME = "pokefolio";
const DB_VERSION = 1;
const STORE = "vault";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB se nepodařilo otevřít."));
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadCollection(accountId: string, key: CryptoKey): Promise<Collection> {
  const sealed = await idbGet<Sealed>(accountId);
  if (!sealed) return structuredClone(EMPTY_COLLECTION);
  try {
    const data = await open<Collection>(key, sealed);
    return { ...structuredClone(EMPTY_COLLECTION), ...data };
  } catch {
    // Dešifrování selhalo. Buď je blok cizí, nebo poškozený — v obou případech
    // je jediná bezpečná odpověď "nemám co ukázat", ne "začnu od nuly a přepíšu to".
    throw new Error(
      "Uložená sbírka nejde dešifrovat tímhle klíčem. " +
        "Buď patří jinému účtu, nebo bylo heslo změněno mimo aplikaci.",
    );
  }
}

export async function saveCollection(
  accountId: string,
  key: CryptoKey,
  data: Collection,
): Promise<void> {
  const next: Collection = { ...data, updatedAt: new Date().toISOString() };
  await idbPut(accountId, await seal(key, next));
}

export async function hasVault(accountId: string): Promise<boolean> {
  return (await idbGet<Sealed>(accountId)) !== undefined;
}

/** Export do souboru — nešifrovaný, protože si ho ukládáš sám k sobě. */
export function downloadExport(collection: Collection, username: string): void {
  const blob = new Blob([JSON.stringify(collection, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pokefolio-${username}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
