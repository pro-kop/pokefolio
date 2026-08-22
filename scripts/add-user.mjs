#!/usr/bin/env node
/**
 * Přidá účet do public/users.json.
 *
 *   npm run adduser
 *
 * Heslo se nikam neukládá — ani do repa, ani na disk. Do users.json jde jen
 * sůl a ověřovací otisk, ze kterých heslo zpětně nezískáš (jen hrubou silou
 * přes 600 tisíc iterací PBKDF2 na každý pokus).
 *
 * Heslo je zároveň šifrovací klíč ke sbírce. Když ho ztratíš, data jsou pryč.
 * Ulož si ho do správce hesel, ne na papírek vedle klávesnice.
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomBytes, pbkdf2Sync, createHash } from "node:crypto";
import { Writable } from "node:stream";
import readline from "node:readline";

const USERS = new URL("../public/users.json", import.meta.url);
const ITERATIONS = 600_000;

// ---------------------------------------------------------------- vstup
// Jedno readline rozhraní pro celý skript. Kdyby se pro každou otázku
// vytvářelo nové, přišel by se zavřením toho předchozího o už načtený vstup.
const interactive = process.stdin.isTTY === true;

let muted = false;
const out = new Writable({
  write(chunk, encoding, callback) {
    if (!muted) process.stdout.write(chunk, encoding);
    callback();
  },
});

// Neinteraktivní běh (roura, CI) čte celý vstup dopředu — jinak by readline
// zavřel rozhraní hned po první odpovědi, jakmile stream skončí.
const piped = interactive
  ? null
  : (await new Promise((resolve) => {
      let buf = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (c) => (buf += c));
      process.stdin.on("end", () => resolve(buf));
    }))
      .split(/\r?\n/)
      .filter((l, i, all) => i < all.length - 1 || l !== "");

const rl = interactive
  ? readline.createInterface({ input: process.stdin, output: out, terminal: true })
  : null;

function ask(question) {
  if (!interactive) {
    const line = piped.shift();
    if (line === undefined) fail("Chybí vstup — skript čekal další odpověď.");
    if (!muted) process.stdout.write(question + line + "\n");
    return Promise.resolve(line.trim());
  }
  return new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())));
}

/** Otázka se vypíše napřímo, odpověď se schová ztlumením výstupu readline. */
async function askHidden(question) {
  process.stdout.write(question);
  muted = true;
  const answer = await ask("");
  muted = false;
  process.stdout.write("\n");
  return answer;
}

function fail(message) {
  rl?.close();
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------- kryptografie
// Musí přesně odpovídat src/auth/crypto.ts, jinak se v prohlížeči nepřihlásíš.
function deriveMaster(password, saltB64, iterations) {
  return pbkdf2Sync(Buffer.from(password, "utf8"), Buffer.from(saltB64, "base64"), iterations, 32, "sha256");
}

function makeVerifier(master) {
  return createHash("sha256")
    .update(Buffer.concat([master, Buffer.from("pokefolio-verify-v1", "utf8")]))
    .digest("base64");
}

// ---------------------------------------------------------------- běh
console.log("\n  Pokéfolio — nový účet\n  ─────────────────────\n");

const username = (await ask("  Uživatelské jméno: ")).toLowerCase();
if (!/^[a-z0-9._-]{2,32}$/.test(username)) {
  fail("Jméno může obsahovat jen malá písmena, číslice, tečku, podtržítko a pomlčku (2–32 znaků).");
}

const users = existsSync(USERS) ? JSON.parse(await readFile(USERS, "utf8")) : { version: 1, users: [] };
if (users.users.some((u) => u.username === username)) {
  fail(`Účet "${username}" už existuje. Smaž ho z public/users.json, pokud ho chceš přepsat.`);
}

const password = await askHidden("  Heslo (nezobrazuje se): ");
const again = await askHidden("  Heslo znovu: ");
rl?.close();

if (password !== again) fail("Hesla se neshodují.");
if (password.length < 12) {
  fail(
    "Heslo musí mít aspoň 12 znaků.\n" +
      "    Ověřovací otisk je ve veřejném repu — krátké heslo se dá zkusit prolomit offline.\n" +
      "    Ideálně použij vygenerované heslo ze správce hesel nebo čtyři náhodná slova.",
  );
}

const salt = randomBytes(16).toString("base64");
process.stdout.write("\n  Odvozuji klíč (600 000 iterací, chvíli to trvá)… ");
const master = deriveMaster(password, salt, ITERATIONS);
const verifier = makeVerifier(master);
console.log("hotovo\n");

users.users.push({
  id: `u_${username}`,
  username,
  label: username,
  salt,
  iterations: ITERATIONS,
  verifier,
  createdAt: new Date().toISOString().slice(0, 10),
});

await writeFile(USERS, JSON.stringify(users, null, 2) + "\n");

console.log(`  ✓ Účet "${username}" zapsán do public/users.json\n`);
console.log("  Zbývá:");
console.log("    1) ulož si heslo do správce hesel — je to zároveň šifrovací klíč");
console.log(`    2) git add public/users.json && git commit -m "účet: ${username}" && git push\n`);
