/**
 * Denní dávka. Stáhne ceník z Cardmarketu, ořízne ho na sledovanou množinu
 * a připíše jeden řádek do historie.
 *
 * Cardmarket publikuje jen dnešek, žádný archiv — každý vynechaný den je
 * díra, kterou už nikdy nezaplníš. Proto skript raději spadne s hlasitou
 * chybou, než aby commitnul něco podezřelého.
 *
 * Výstupy:
 *   public/data/latest.json           dnešní ceny sledovaných produktů
 *   public/data/tracked.json          názvy sledovaných produktů
 *   public/data/history/YYYY-MM.json  sloupcová historie po měsících
 *   public/data/meta.json             kdy a z čeho
 *   public/data/fx.json               kurz EUR/CZK
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { SOURCES, getJson, assertShape, checks, today, num } from "./lib/sources.mjs";

const DATA = new URL("../public/data/", import.meta.url);
const HISTORY = new URL("history/", DATA);

const readJsonIfExists = async (url) =>
  existsSync(url) ? JSON.parse(await readFile(url, "utf8")) : null;

// ---------------------------------------------------------------- konfigurace
const cfg = JSON.parse(await readFile(new URL("../config/tracking.json", import.meta.url), "utf8"));

const catalog = await readJsonIfExists(new URL("catalog.json", DATA));
if (!catalog) {
  console.error("✗ Chybí public/data/catalog.json — spusť nejdřív: npm run fetch:catalog");
  process.exit(1);
}

/** id → [name, expansionId, kind]  (kind 0 = single, 1 = sealed) */
const meta = new Map(catalog.products.map(([id, name, exp, kind]) => [id, [name, exp, kind]]));

// ------------------------------------------------------------------- stažení
console.log("→ stahuji Cardmarket price guide…");
const guide = await getJson(SOURCES.priceGuide);
assertShape("priceGuide", guide, checks.priceGuide);

const date = today();
console.log(`  ceník vytvořen ${guide.createdAt}, ${guide.priceGuides.length} položek`);

// --------------------------------------------------------- sledovaná množina
// Produkty, které už v tomhle měsíci sledujeme, se sledují dál i kdyby
// spadly pod cenový práh — jinak by se řady trhaly.
const monthFile = new URL(`${date.slice(0, 7)}.json`, HISTORY);
const month = (await readJsonIfExists(monthFile)) ?? { month: date.slice(0, 7), ids: [], days: {} };

const tracked = new Set(month.ids);
for (const id of cfg.extraProductIds ?? []) tracked.add(id);

const priceById = new Map();
for (const row of guide.priceGuides) {
  if (!row.idProduct) continue;
  priceById.set(row.idProduct, row);
}

for (const [id, [, , kind]] of meta) {
  if (tracked.has(id)) continue;
  const row = priceById.get(id);
  if (!row) continue;
  const trend = num(row.trend) ?? num(row.avg7) ?? num(row.avg);
  if (kind === 1) {
    if (cfg.includeAllSealed && trend !== null) tracked.add(id);
  } else if (trend !== null && trend >= (cfg.minSingleTrendEur ?? 30)) {
    tracked.add(id);
  }
}

if (cfg.maxProducts && tracked.size > cfg.maxProducts) {
  console.warn(
    `! sledovaná množina má ${tracked.size} produktů, strop je ${cfg.maxProducts}. ` +
      `Zvyš minSingleTrendEur v config/tracking.json, nebo strop.`,
  );
  // Ořežeme podle ceny sestupně, ať vypadnou ty nejlevnější.
  const sorted = [...tracked].sort(
    (a, b) => (num(priceById.get(b)?.trend) ?? 0) - (num(priceById.get(a)?.trend) ?? 0),
  );
  tracked.clear();
  for (const id of sorted.slice(0, cfg.maxProducts)) tracked.add(id);
}

// ------------------------------------------------------- sestavení dnešních dat
// Pořadí sloupců je dané polem ids v měsíčním souboru; nové produkty se
// přidávají na konec, starší dny je pak prostě nemají (čtou se jako null).
const ids = month.ids.slice();
const index = new Map(ids.map((id, i) => [id, i]));
for (const id of tracked) {
  if (!index.has(id)) {
    index.set(id, ids.length);
    ids.push(id);
  }
}

const trend = new Array(ids.length).fill(null);
const low = new Array(ids.length).fill(null);
const avg7 = new Array(ids.length).fill(null);
const avg30 = new Array(ids.length).fill(null);

let priced = 0;
for (const id of tracked) {
  const row = priceById.get(id);
  if (!row) continue;
  const i = index.get(id);
  trend[i] = num(row.trend) ?? num(row.avg7);
  low[i] = num(row.low);
  avg7[i] = num(row.avg7);
  avg30[i] = num(row.avg30);
  if (trend[i] !== null) priced++;
}

if (priced < ids.length * 0.5) {
  throw new Error(
    `Jen ${priced} z ${ids.length} sledovaných produktů má cenu. ` +
      `To vypadá na rozbitý zdroj — nic se necommitne.`,
  );
}

// ------------------------------------------------------------------- zápis
await mkdir(HISTORY, { recursive: true });

month.ids = ids;
month.days[date] = { trend, low };
await writeFile(monthFile, JSON.stringify(month));

await writeFile(
  new URL("latest.json", DATA),
  JSON.stringify({ date, ids, trend, low, avg7, avg30 }),
);

await writeFile(
  new URL("tracked.json", DATA),
  JSON.stringify({
    date,
    products: ids.map((id) => {
      const m = meta.get(id);
      return m ? [id, m[0], m[1], m[2]] : [id, `#${id}`, 0, 0];
    }),
  }),
);

// kurz — když spadne, není to důvod shodit celou dávku
let fx = { base: "EUR", czk: null, date };
try {
  const res = await getJson(SOURCES.fx, { retries: 2, timeoutMs: 20_000 });
  fx = { base: "EUR", czk: res?.rates?.CZK ?? null, date: res?.date ?? date };
} catch (err) {
  console.warn(`! kurz se nepodařilo stáhnout (${err.message}), nechávám předchozí`);
  const prev = await readJsonIfExists(new URL("fx.json", DATA));
  if (prev) fx = prev;
}
await writeFile(new URL("fx.json", DATA), JSON.stringify(fx));

const months = (await readJsonIfExists(new URL("meta.json", DATA)))?.months ?? [];
const monthKey = date.slice(0, 7);
if (!months.includes(monthKey)) months.push(monthKey);
months.sort();

await writeFile(
  new URL("meta.json", DATA),
  JSON.stringify({
    date,
    sourceCreatedAt: guide.createdAt,
    trackedCount: ids.length,
    pricedToday: priced,
    catalogCount: catalog.count,
    months,
    updatedAt: new Date().toISOString(),
  }),
);

console.log(`✓ ${date}: ${priced}/${ids.length} produktů s cenou, historie má ${months.length} měsíců`);
