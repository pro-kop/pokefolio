/**
 * Ocenění a výkonnost.
 *
 * Pozor na past: „hodnota portfolia v čase" a „výnos" nejsou totéž. Když
 * dokoupíš display za 400 €, hodnota skočí o 400 € nahoru — ale to je vklad,
 * ne zisk. Proto se výnos počítá peněžně váženě přes jednotlivé nákupy,
 * ne jako změna celkové hodnoty.
 */
import type { Market } from "../market/load";
import { invested, totalQty, type Holding } from "../store/types";

export type RangeKey = "7D" | "1M" | "3M" | "YTD" | "1R" | "MAX";

export const RANGE_LABELS: Record<RangeKey, string> = {
  "7D": "7 dní",
  "1M": "30 dní",
  "3M": "3 měsíce",
  YTD: "letos",
  "1R": "rok",
  MAX: "celou dobu",
};

export interface Valued {
  holding: Holding;
  qty: number;
  avgCost: number;
  invested: number;
  trend: number | null;
  low: number | null;
  value: number;
  profit: number;
  profitPct: number;
}

export function valueHolding(h: Holding, market: Market): Valued {
  const qty = totalQty(h);
  const inv = invested(h);
  const { trend, low } = market.price(h.productId);
  const value = trend !== null ? qty * trend : 0;
  return {
    holding: h,
    qty,
    avgCost: qty ? inv / qty : 0,
    invested: inv,
    trend,
    low,
    value,
    profit: value - inv,
    profitPct: inv ? (value - inv) / inv : 0,
  };
}

export interface Totals {
  value: number;
  invested: number;
  profit: number;
  profitPct: number;
  items: number;
  units: number;
}

export function totals(valued: Valued[]): Totals {
  const value = valued.reduce((s, v) => s + v.value, 0);
  const inv = valued.reduce((s, v) => s + v.invested, 0);
  return {
    value,
    invested: inv,
    profit: value - inv,
    profitPct: inv ? (value - inv) / inv : 0,
    items: valued.length,
    units: valued.reduce((s, v) => s + v.qty, 0),
  };
}

/** Index prvního dne v zadaném období. */
export function startIndex(dates: string[], range: RangeKey): number {
  if (!dates.length) return 0;
  if (range === "MAX") return 0;
  const last = new Date(dates[dates.length - 1]);
  if (range === "YTD") {
    const jan = `${last.getUTCFullYear()}-01-01`;
    const i = dates.findIndex((d) => d >= jan);
    return i < 0 ? 0 : i;
  }
  const days = { "7D": 7, "1M": 30, "3M": 91, "1R": 365 }[range];
  const target = new Date(last);
  target.setUTCDate(target.getUTCDate() - days);
  const key = target.toISOString().slice(0, 10);
  const i = dates.findIndex((d) => d >= key);
  return i < 0 ? 0 : i;
}

export function changeOver(
  dates: string[],
  values: (number | null)[],
  range: RangeKey,
): { pct: number; abs: number } {
  const i = startIndex(dates, range);
  const from = firstNonNullFrom(values, i);
  const to = lastNonNull(values);
  if (from === null || to === null || !from) return { pct: 0, abs: 0 };
  return { pct: (to - from) / from, abs: to - from };
}

function firstNonNullFrom(arr: (number | null)[], start: number): number | null {
  for (let i = start; i < arr.length; i++) if (arr[i] !== null) return arr[i];
  return null;
}

export function lastNonNull(arr: (number | null)[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== null) return arr[i];
  return null;
}

/** Vyplnění děr poslední známou hodnotou — historie může mít vynechané dny. */
export function forwardFill(values: (number | null)[]): (number | null)[] {
  let last: number | null = null;
  return values.map((v) => (v === null ? last : (last = v)));
}

export interface PortfolioSeries {
  dates: string[];
  /** Tržní hodnota dnešní sestavy sbírky promítnutá do minulosti. */
  value: number[];
  /** Skutečně investovaná částka k danému dni — roste s každým nákupem. */
  cost: number[];
}

export function portfolioSeries(holdings: Holding[], market: Market): PortfolioSeries {
  const ids = [...new Set(holdings.map((h) => h.productId))];
  const { dates, values } = market.dailyMatrix(ids);
  const filled = new Map([...values].map(([id, arr]) => [id, forwardFill(arr)]));

  const value = dates.map((_, i) =>
    holdings.reduce((sum, h) => {
      const price = filled.get(h.productId)?.[i];
      return sum + (price ?? 0) * totalQty(h);
    }, 0),
  );

  const cost = dates.map((day) =>
    holdings.reduce(
      (sum, h) =>
        sum +
        h.lots.reduce((s, l) => (l.date <= day ? s + l.qty * l.unitCost + (l.fees ?? 0) : s), 0),
      0,
    ),
  );

  return { dates, value, cost };
}

/**
 * Peněžně vážený výnos (zjednodušený IRR přes bisekci).
 * Bere v úvahu, kdy jsi peníze vložil — dokup těsně před koncem období
 * nezkreslí výsledek.
 */
export function moneyWeightedReturn(
  holdings: Holding[],
  market: Market,
  fromDate: string,
  startValue: number,
): number | null {
  const endDate = market.meta.date;
  const flows: { date: string; amount: number }[] = [];

  if (startValue > 0) flows.push({ date: fromDate, amount: -startValue });
  for (const h of holdings) {
    for (const l of h.lots) {
      if (l.date > fromDate && l.date <= endDate) {
        flows.push({ date: l.date, amount: -(l.qty * l.unitCost + (l.fees ?? 0)) });
      }
    }
  }

  const endValue = holdings.reduce((s, h) => s + valueHolding(h, market).value, 0);
  flows.push({ date: endDate, amount: endValue });

  if (flows.length < 2 || flows.every((f) => f.amount >= 0)) return null;

  const t0 = new Date(fromDate).getTime();
  const years = (d: string) => (new Date(d).getTime() - t0) / (365.25 * 24 * 3600 * 1000);
  const npv = (rate: number) =>
    flows.reduce((s, f) => s + f.amount / Math.pow(1 + rate, years(f.date)), 0);

  let lo = -0.95;
  let hi = 10;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}
