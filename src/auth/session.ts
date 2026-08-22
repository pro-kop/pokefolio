import { deriveMaster, verifierOf, dataKeyOf, sameSecret, exportKey, importKey } from "./crypto";

export interface Account {
  id: string;
  username: string;
  label?: string;
  salt: string;
  iterations: number;
  verifier: string;
  createdAt?: string;
}

export interface Session {
  account: Account;
  key: CryptoKey;
}

const SESSION_KEY = "pokefolio.session";

export async function loadAccounts(): Promise<Account[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}users.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error("Seznam účtů se nepodařilo načíst.");
  const data = await res.json();
  return Array.isArray(data) ? data : (data.users ?? []);
}

export class LoginError extends Error {}

export async function login(username: string, password: string): Promise<Session> {
  const accounts = await loadAccounts();
  const wanted = username.trim().toLowerCase();
  const account = accounts.find((a) => a.username.toLowerCase() === wanted);

  // Odvození proběhne i u neexistujícího účtu, aby špatné jméno a špatné
  // heslo trvaly stejně dlouho a nešlo z toho vyčíst, které účty existují.
  const target = account ?? {
    id: "u_none",
    username: wanted,
    salt: "AAAAAAAAAAAAAAAAAAAAAA==",
    iterations: 600_000,
    verifier: "",
  };

  const master = await deriveMaster(password, target.salt, target.iterations);
  const verifier = await verifierOf(master);

  if (!account || !sameSecret(verifier, account.verifier)) {
    throw new LoginError("Nesprávné jméno nebo heslo.");
  }

  const key = await dataKeyOf(master, account.salt);
  return { account, key };
}

/** Volitelné: klíč přežije obnovení stránky, ale jen v téhle záložce. */
export async function rememberInTab(session: Session): Promise<void> {
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ account: session.account, key: await exportKey(session.key) }),
    );
  } catch {
    /* soukromé okno nebo zakázané úložiště — nevadí, jen se bude přihlašovat znovu */
  }
}

export async function restoreFromTab(): Promise<Session | null> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { account: Account; key: string };
    return { account: parsed.account, key: await importKey(parsed.key) };
  } catch {
    return null;
  }
}

export function forgetTab(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* nevadí */
  }
}
