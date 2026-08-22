/**
 * Postaví vyhledávací index katalogu z veřejných souborů Cardmarketu.
 * Běží týdně — katalog se mění jen při vydání nové edice.
 *
 * Výstup: public/data/catalog.json
 *   { generatedAt, count, products: [[id, name, expansionId, kind], ...] }
 *   kind: 0 = single, 1 = sealed
 *
 * Sloupcové pole místo objektů: u 130 tisíc produktů je to rozdíl
 * mezi ~4 MB a ~18 MB. Pages to servírují gzipnuté, takže po drátě jde
 * řádově pár set kB.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { SOURCES, getJson, assertShape, checks } from "./lib/sources.mjs";

const OUT_DIR = new URL("../public/data/", import.meta.url);

console.log("→ stahuji katalog karet…");
const singles = await getJson(SOURCES.singles);
assertShape("singles", singles, checks.productList);

console.log("→ stahuji katalog sealed produktů…");
const nonsingles = await getJson(SOURCES.nonsingles);
assertShape("nonsingles", nonsingles, checks.productList);

const products = [];
const categories = new Map();

for (const [list, kind] of [
  [singles.products, 0],
  [nonsingles.products, 1],
]) {
  for (const p of list) {
    if (!p.idProduct || !p.name) continue;
    products.push([p.idProduct, p.name, p.idExpansion ?? 0, kind]);
    if (p.idCategory && p.categoryName && !categories.has(p.idCategory)) {
      categories.set(p.idCategory, p.categoryName);
    }
  }
}

products.sort((a, b) => a[0] - b[0]);

await mkdir(OUT_DIR, { recursive: true });
await writeFile(
  new URL("catalog.json", OUT_DIR),
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: "cardmarket-product-catalogue",
    count: products.length,
    categories: Object.fromEntries(categories),
    products,
  }),
);

console.log(
  `✓ katalog: ${products.length} produktů ` +
    `(${singles.products.length} karet, ${nonsingles.products.length} sealed), ` +
    `${categories.size} kategorií`,
);
