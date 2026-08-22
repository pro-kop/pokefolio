/**
 * Veřejné zdroje dat.
 *
 * Cardmarket od června 2024 publikuje ceník i katalog ke stažení pro všechny,
 * bez API klíče. Číslo 6 v názvech souborů je Cardmarket id hry Pokémon.
 *   https://www.cardmarket.com/en/Pokemon/Data/Download
 */
export const CM_BASE = "https://downloads.s3.cardmarket.com/productCatalog";

export const SOURCES = {
  priceGuide: `${CM_BASE}/priceGuide/price_guide_6.json`,
  singles: `${CM_BASE}/productList/products_singles_6.json`,
  nonsingles: `${CM_BASE}/productList/products_nonsingles_6.json`,
  fx: "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=CZK",
};

const UA = "pokefolio/1.0 (osobni sberatelska aplikace; +https://github.com/pro-kop/pokefolio)";

/** Stažení JSON s opakováním — dávka nesmí spadnout na jednom výpadku sítě. */
export async function getJson(url, { retries = 3, timeoutMs = 120_000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { "user-agent": UA, accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = await res.json();
      clearTimeout(timer);
      return json;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        const wait = attempt * 4000;
        console.warn(`  ! ${url} selhalo (${err.message}), zkouším znovu za ${wait / 1000} s`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw new Error(`Nepodařilo se stáhnout ${url}: ${lastErr?.message}`);
}

/**
 * Kontrola, že zdroj vypadá, jak čekáme. Když Cardmarket změní formát,
 * chceme hlasitou chybu — ne tiše commitnutá nesmyslná data.
 */
export function assertShape(name, value, check) {
  const problem = check(value);
  if (problem) {
    throw new Error(
      `Zdroj "${name}" má neočekávanou strukturu: ${problem}\n` +
        `Cardmarket pravděpodobně změnil formát. Zkontroluj ${SOURCES[name] ?? name} ` +
        `a uprav scripts/lib/sources.mjs, než dávka poběží dál.`,
    );
  }
}

export const checks = {
  priceGuide: (d) => {
    if (!d || typeof d !== "object") return "není objekt";
    if (!Array.isArray(d.priceGuides)) return "chybí pole priceGuides";
    if (d.priceGuides.length < 1000) return `jen ${d.priceGuides.length} položek, čekáme desetitisíce`;
    const first = d.priceGuides[0];
    for (const key of ["idProduct", "trend", "low"]) {
      if (!(key in first)) return `první položce chybí pole ${key}`;
    }
    return null;
  },
  productList: (d) => {
    if (!d || typeof d !== "object") return "není objekt";
    if (!Array.isArray(d.products)) return "chybí pole products";
    if (d.products.length < 100) return `jen ${d.products.length} produktů`;
    const first = d.products[0];
    for (const key of ["idProduct", "name", "idCategory", "idExpansion"]) {
      if (!(key in first)) return `prvnímu produktu chybí pole ${key}`;
    }
    return null;
  },
};

/** Dnešek v ISO (YYYY-MM-DD) podle UTC — dávka běží v UTC. */
export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function num(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
