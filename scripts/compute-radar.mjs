/**
 * Přepočítá skóre příležitostí. Běží po každé denní dávce, aby prohlížeč
 * nemusel křoupat historii tisíců produktů.
 *
 * Skóre 0–100 se skládá ze čtyř složek:
 *   36 b.  sleva nejnižší nabídky vůči trendu   (nasycení na 22 %)
 *   26 b.  propad trendu za 30 dní              (nasycení na −18 %)
 *   24 b.  blízkost ročnímu minimu
 *   14 b.  týdenní obrat vzhůru po propadu
 *
 * Skóre neříká „kup". Říká „tady se něco děje, mrkni na to".
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const DATA = new URL("../public/data/", import.meta.url);
const HISTORY = new URL("history/", DATA);
const TOP_N = 400;
const SPARK_DAYS = 90;

const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));

const meta = await readJson(new URL("meta.json", DATA));
const latest = await readJson(new URL("latest.json", DATA));
const tracked = await readJson(new URL("tracked.json", DATA));

const names = new Map(tracked.products.map(([id, name, exp, kind]) => [id, { name, exp, kind }]));

// ------------------------------------------------- poskládání řad z měsíců
const months = meta.months.slice(-14);
/** id → { dates: [], trend: [], low: [] } */
const series = new Map();

for (const m of months) {
  const url = new URL(`${m}.json`, HISTORY);
  if (!existsSync(url)) continue;
  const file = await readJson(url);
  const days = Object.keys(file.days).sort();
  for (const day of days) {
    const row = file.days[day];
    file.ids.forEach((id, i) => {
      const t = row.trend?.[i] ?? null;
      const l = row.low?.[i] ?? null;
      if (t === null && l === null) return;
      let s = series.get(id);
      if (!s) series.set(id, (s = { dates: [], trend: [], low: [] }));
      s.dates.push(day);
      s.trend.push(t);
      s.low.push(l);
    });
  }
}

const dayCount = new Set(
  [...series.values()].flatMap((s) => s.dates),
).size;
const warmingUp = dayCount < 14;

// ------------------------------------------------------------------ pomůcky
/** Hodnota přibližně N dní zpět; historie může mít díry, tak hledáme nejbližší. */
function valueDaysAgo(s, arr, days) {
  if (!s.dates.length) return null;
  const target = new Date(s.dates[s.dates.length - 1]);
  target.setUTCDate(target.getUTCDate() - days);
  const key = target.toISOString().slice(0, 10);
  let best = null;
  for (let i = s.dates.length - 1; i >= 0; i--) {
    if (s.dates[i] <= key) {
      best = arr[i];
      if (best !== null) return best;
    }
  }
  for (let i = 0; i < arr.length; i++) if (arr[i] !== null) return arr[i];
  return null;
}

function change(s, days) {
  const now = lastNonNull(s.trend);
  const then = valueDaysAgo(s, s.trend, days);
  if (now === null || then === null || !then) return 0;
  return (now - then) / then;
}

function lastNonNull(arr) {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== null) return arr[i];
  return null;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const pctText = (v) => (v >= 0 ? "+" : "−") + Math.abs(v * 100).toFixed(1).replace(".", ",") + " %";

// ------------------------------------------------------------------- skóre
const idx = new Map(latest.ids.map((id, i) => [id, i]));
const items = [];

for (const [id, s] of series) {
  const i = idx.get(id);
  if (i === undefined) continue;

  const trend = latest.trend[i] ?? lastNonNull(s.trend);
  const low = latest.low[i] ?? lastNonNull(s.low);
  if (!trend || !low) continue;

  const spread = (trend - low) / trend;
  const d7 = change(s, 7);
  const d30 = change(s, 30);
  const d90 = change(s, 90);

  const lowYear = s.low.filter((v) => v !== null).slice(-365);
  const lowMin = lowYear.length ? Math.min(...lowYear) : low;
  const lowMax = lowYear.length ? Math.max(...lowYear) : low;
  const nearLow = lowMax > lowMin ? (lowMax - low) / (lowMax - lowMin) : 0;

  let score = clamp01(spread / 0.22) * 36;
  if (!warmingUp) {
    score += clamp01(-d30 / 0.18) * 26;
    score += clamp01(nearLow) * 24;
    score += d30 < 0 ? clamp01(d7 / 0.04) * 14 : 0;
  }

  const signals = [];
  if (spread >= 0.15) signals.push({ t: `Low je ${Math.round(spread * 100)} % pod trendem`, c: "hot" });
  else if (spread >= 0.10) signals.push({ t: `Low je ${Math.round(spread * 100)} % pod trendem`, c: "" });
  if (!warmingUp) {
    if (d30 <= -0.08) signals.push({ t: `Propad ${pctText(d30)} za 30 dní`, c: "" });
    if (low <= lowMin * 1.015 && lowYear.length > 20) signals.push({ t: "Nové roční minimum", c: "warn" });
    else if (nearLow >= 0.85 && lowYear.length > 20) signals.push({ t: "Spodních 15 % ročního rozpětí", c: "" });
    if (d7 > 0.02 && d30 < 0) signals.push({ t: "Obrat trendu vzhůru", c: "hot" });
  }
  const avg30 = latest.avg30?.[i] ?? null;
  if (!warmingUp && avg30 && low < avg30 * 0.95) {
    signals.push({ t: "Pod 30denním průměrem prodejů", c: "" });
  }
  if (!signals.length) signals.push({ t: "Bez výrazného signálu", c: "" });

  const m = names.get(id) ?? { name: `#${id}`, exp: 0, kind: 0 };
  items.push({
    id,
    name: m.name,
    exp: m.exp,
    kind: m.kind,
    trend,
    low,
    avg7: latest.avg7?.[i] ?? null,
    avg30: latest.avg30?.[i] ?? null,
    spread: Math.round(spread * 1000) / 1000,
    d7: Math.round(d7 * 1000) / 1000,
    d30: Math.round(d30 * 1000) / 1000,
    d90: Math.round(d90 * 1000) / 1000,
    nearLow: Math.round(nearLow * 100) / 100,
    score: Math.round(Math.min(score, 99)),
    signals,
    spark: s.trend.slice(-SPARK_DAYS).filter((v) => v !== null),
  });
}

items.sort((a, b) => b.score - a.score);

await writeFile(
  new URL("radar.json", DATA),
  JSON.stringify({
    date: latest.date,
    warmingUp,
    daysOfHistory: dayCount,
    evaluated: items.length,
    items: items.slice(0, TOP_N),
  }),
);

console.log(
  warmingUp
    ? `✓ radar: ${items.length} produktů, ale historie má teprve ${dayCount} dní — ` +
        `skóre zatím počítá jen slevu vůči trendu. Za dva týdny naskočí zbytek.`
    : `✓ radar: ${items.length} vyhodnoceno, ${items.filter((i) => i.score >= 55).length} se skóre 55+`,
);
