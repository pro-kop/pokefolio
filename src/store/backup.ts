/**
 * Záloha do privátního Gistu.
 *
 * Nahrává se šifrovaný blok, ne sbírka. GitHub, kdokoli s odkazem i kdokoli
 * s tokenem uvidí jen base64 šum. Token samotný žije uvnitř šifrované sbírky,
 * takže se na disk taky nedostane v čitelné podobě.
 *
 * Token si vyrob jako fine-grained PAT s jediným oprávněním: Gists → Read and write.
 */
import { seal, open, type Sealed } from "../auth/crypto";
import type { Collection } from "./types";

const FILENAME = "pokefolio-vault.json";
const API = "https://api.github.com";

interface GistResponse {
  id: string;
  files: Record<string, { content?: string; truncated?: boolean; raw_url?: string }>;
  updated_at: string;
}

async function gh(token: string, path: string, init?: RequestInit): Promise<GistResponse> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("GitHub token neplatí nebo mu chybí oprávnění Gists.");
    if (res.status === 404) throw new Error("Gist se nenašel. Zkontroluj jeho id.");
    throw new Error(`GitHub odpověděl ${res.status}. ${text.slice(0, 160)}`);
  }
  return res.json();
}

export async function pushBackup(
  token: string,
  gistId: string | undefined,
  key: CryptoKey,
  collection: Collection,
): Promise<{ gistId: string; at: string }> {
  const sealed = await seal(key, collection);
  const body = JSON.stringify({
    description: "Pokéfolio — šifrovaná záloha sbírky (AES-GCM)",
    public: false,
    files: { [FILENAME]: { content: JSON.stringify(sealed) } },
  });

  const gist = gistId
    ? await gh(token, `/gists/${gistId}`, { method: "PATCH", body })
    : await gh(token, "/gists", { method: "POST", body });

  return { gistId: gist.id, at: gist.updated_at };
}

export async function pullBackup(
  token: string,
  gistId: string,
  key: CryptoKey,
): Promise<Collection> {
  const gist = await gh(token, `/gists/${gistId}`);
  const file = gist.files[FILENAME];
  if (!file) throw new Error(`Gist neobsahuje soubor ${FILENAME}.`);

  let content = file.content ?? "";
  if (file.truncated && file.raw_url) {
    content = await fetch(file.raw_url).then((r) => r.text());
  }

  let sealed: Sealed;
  try {
    sealed = JSON.parse(content) as Sealed;
  } catch {
    throw new Error("Obsah zálohy není platný JSON.");
  }

  try {
    return await open<Collection>(key, sealed);
  } catch {
    throw new Error("Zálohu nejde dešifrovat — heslo nepatří k téhle záloze.");
  }
}
