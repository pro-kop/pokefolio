/**
 * Kryptografie přihlášení.
 *
 * Přihlášení tady není brána, ale klíč. Aplikace heslo neporovnává proto,
 * aby někoho nepustila dál — porovnává ho, aby ti řekla, že jsi ho napsal
 * špatně. Skutečná ochrana je v tom, že sbírka je zašifrovaná klíčem
 * odvozeným z hesla: bez hesla nejsou data čitelná ani pro toho, kdo si
 * stáhne celé úložiště.
 *
 * Musí přesně odpovídat scripts/add-user.mjs.
 */

const enc = new TextEncoder();

const VERIFY_INFO = "pokefolio-verify-v1";
const DATA_INFO = "pokefolio-data-v1";

export function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** PBKDF2-SHA256 → 32 bajtů hlavního klíče. Tady se spálí ten výpočetní čas. */
export async function deriveMaster(
  password: string,
  saltB64: string,
  iterations: number,
): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromB64(saltB64) as BufferSource, iterations, hash: "SHA-256" },
    base,
    256,
  );
  return new Uint8Array(bits);
}

/** Otisk, který je jako jediný veřejný. Heslo z něj nejde spočítat zpět. */
export async function verifierOf(master: Uint8Array): Promise<string> {
  const info = enc.encode(VERIFY_INFO);
  const joined = new Uint8Array(master.length + info.length);
  joined.set(master, 0);
  joined.set(info, master.length);
  const hash = await crypto.subtle.digest("SHA-256", joined as BufferSource);
  return toB64(hash);
}

/** Šifrovací klíč sbírky. Odvozený jinou cestou než verifier, ať jeden neprozradí druhý. */
export async function dataKeyOf(master: Uint8Array, saltB64: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", master as BufferSource, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: fromB64(saltB64) as BufferSource,
      info: enc.encode(DATA_INFO),
    },
    base,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

/** Porovnání v konstantním čase — ať se z rychlosti odpovědi nedá nic vyčíst. */
export function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface Sealed {
  v: 1;
  iv: string;
  ct: string;
}

export async function seal(key: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    enc.encode(JSON.stringify(value)),
  );
  return { v: 1, iv: toB64(iv), ct: toB64(ct) };
}

export async function open<T>(key: CryptoKey, sealed: Sealed): Promise<T> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(sealed.iv) as BufferSource },
    key,
    fromB64(sealed.ct) as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

/** Export klíče do sessionStorage (jen na dobu života záložky, jen na přání). */
export async function exportKey(key: CryptoKey): Promise<string> {
  return toB64(await crypto.subtle.exportKey("raw", key));
}

export async function importKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", fromB64(raw) as BufferSource, "AES-GCM", true, [
    "encrypt",
    "decrypt",
  ]);
}
