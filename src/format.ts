export type Currency = "EUR" | "CZK";

const eur2 = new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const eur0 = new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const czk0 = new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 });
const czk2 = new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 });

const dateLong = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "long", year: "numeric" });
const dateShort = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric" });
const dateMed = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
const timeShort = new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit" });

/** Kurz se doplní po načtení fx.json; do té doby se koruny nenabízejí. */
let rate: number | null = null;
export function setRate(czk: number | null): void {
  rate = czk;
}
export function getRate(): number | null {
  return rate;
}

export function money(v: number, currency: Currency, decimals: 0 | 2 = 2): string {
  if (currency === "CZK" && rate) return (decimals === 0 ? czk0 : czk2).format(v * rate);
  return (decimals === 0 ? eur0 : eur2).format(v);
}

export function signedMoney(v: number, currency: Currency, decimals: 0 | 2 = 2): string {
  return (v >= 0 ? "+" : "−") + money(Math.abs(v), currency, decimals);
}

export function pct(v: number, digits = 1): string {
  return (v >= 0 ? "+" : "−") + Math.abs(v * 100).toFixed(digits).replace(".", ",") + " %";
}

export function dir(v: number): "up" | "down" | "flat" {
  return v > 0.0005 ? "up" : v < -0.0005 ? "down" : "flat";
}

export function dirColor(v: number): string {
  const d = dir(v);
  return d === "up" ? "var(--up)" : d === "down" ? "var(--down)" : "var(--ink-2)";
}

export const fmtDate = (iso: string): string => (iso ? dateLong.format(new Date(iso)) : "—");
export const fmtDateShort = (iso: string): string => (iso ? dateShort.format(new Date(iso)) : "");
export const fmtDateMed = (iso: string): string => (iso ? dateMed.format(new Date(iso)) : "—");
export const fmtTime = (iso: string): string => (iso ? timeShort.format(new Date(iso)) : "");

export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}
