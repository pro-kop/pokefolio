/**
 * Načítání tržních dat. Všechno jsou statické soubory z repa, které
 * GitHub Pages servírují gzipnuté — žádné API, žádné klíče, funguje offline
 * z cache prohlížeče.
 */
const BASE = `${import.meta.env.BASE_URL}data/`;

export interface Meta {
  date: string;
  sourceCreatedAt: string;
  trackedCount: number;
  pricedToday: number;
  catalogCount: number;
  months: string[];
  updatedAt: string;
}

export interface Latest {
  date: string;
  ids: number[];
  trend: (number | null)[];
  low: (number | null)[];
  avg7: (number | null)[];
  avg30: (number | null)[];
}

export interface Tracked {
  date: string;
  /** [id, název, idExpansion, kind] */
  products: [number, string, number, 0 | 1][];
}

export interface RadarItem {
  id: number;
  name: string;
  exp: number;
  kind: 0 | 1;
  trend: number;
  low: number;
  avg7: number | null;
  avg30: number | null;
  spread: number;
  d7: number;
  d30: number;
  d90: number;
  nearLow: number;
  score: number;
  signals: { t: string; c: string }[];
  spark: number[];
}

export interface Radar {
  date: string;
  warmingUp: boolean;
  daysOfHistory: number;
  evaluated: number;
  items: RadarItem[];
}

export interface Fx {
  base: "EUR";
  czk: number | null;
  date: string;
}

export interface Catalog {
  generatedAt: string;
  count: number;
  categories: Record<string, string>;
  /** [id, název, idExpansion, kind] */
  products: [number, string, number, 0 | 1][];
}

export interface Series {
  dates: string[];
  trend: (number | null)[];
  low: (number | null)[];
}

interface MonthFile {
  month: string;
  ids: number[];
  days: Record<string, { trend: (number | null)[]; low: (number | null)[] }>;
}

async function get<T>(file: string): Promise<T> {
  const res = await fetch(`${BASE}${file}`, { cache: "default" });
  if (!res.ok) throw new Error(`Data ${file} se nepodařilo načíst (HTTP ${res.status}).`);
  return res.json() as Promise<T>;
}

export class Market {
  readonly meta: Meta;
  readonly latest: Latest;
  readonly radar: Radar;
  readonly fx: Fx;

  private readonly index = new Map<number, number>();
  private readonly names = new Map<number, { name: string; exp: number; kind: 0 | 1 }>();
  private readonly months = new Map<string, MonthFile>();
  private catalogPromise: Promise<Catalog> | null = null;
  private historyPromise: Promise<void> | null = null;

  private constructor(meta: Meta, latest: Latest, tracked: Tracked, radar: Radar, fx: Fx) {
    this.meta = meta;
    this.latest = latest;
    this.radar = radar;
    this.fx = fx;
    latest.ids.forEach((id, i) => this.index.set(id, i));
    for (const [id, name, exp, kind] of tracked.products) this.names.set(id, { name, exp, kind });
  }

  static async load(): Promise<Market> {
    const [meta, latest, tracked, radar, fx] = await Promise.all([
      get<Meta>("meta.json"),
      get<Latest>("latest.json"),
      get<Tracked>("tracked.json"),
      get<Radar>("radar.json").catch(
        (): Radar => ({ date: "", warmingUp: true, daysOfHistory: 0, evaluated: 0, items: [] }),
      ),
      get<Fx>("fx.json").catch((): Fx => ({ base: "EUR", czk: null, date: "" })),
    ]);
    return new Market(meta, latest, tracked, radar, fx);
  }

  price(id: number): { trend: number | null; low: number | null; avg7: number | null; avg30: number | null } {
    const i = this.index.get(id);
    if (i === undefined) return { trend: null, low: null, avg7: null, avg30: null };
    return {
      trend: this.latest.trend[i],
      low: this.latest.low[i],
      avg7: this.latest.avg7?.[i] ?? null,
      avg30: this.latest.avg30?.[i] ?? null,
    };
  }

  name(id: number): string {
    return this.names.get(id)?.name ?? `Produkt #${id}`;
  }

  kind(id: number): 0 | 1 {
    return this.names.get(id)?.kind ?? 0;
  }

  isTracked(id: number): boolean {
    return this.index.has(id);
  }

  /** Historie se stahuje až když ji někdo chce vidět. */
  async history(): Promise<void> {
    if (!this.historyPromise) {
      this.historyPromise = (async () => {
        const wanted = this.meta.months.slice(-14);
        const files = await Promise.all(
          wanted.map((m) => get<MonthFile>(`history/${m}.json`).catch(() => null)),
        );
        files.forEach((f, i) => {
          if (f) this.months.set(wanted[i], f);
        });
      })();
    }
    return this.historyPromise;
  }

  /** Řada pro jeden produkt, poskládaná napříč měsíčními soubory. */
  series(id: number): Series {
    const out: Series = { dates: [], trend: [], low: [] };
    for (const month of [...this.months.keys()].sort()) {
      const file = this.months.get(month)!;
      const col = file.ids.indexOf(id);
      if (col < 0) continue;
      for (const day of Object.keys(file.days).sort()) {
        const row = file.days[day];
        out.dates.push(day);
        out.trend.push(row.trend?.[col] ?? null);
        out.low.push(row.low?.[col] ?? null);
      }
    }
    return out;
  }

  /** Všechna data dne pro sadu produktů — pro výpočet hodnoty portfolia v čase. */
  dailyMatrix(ids: number[]): { dates: string[]; values: Map<number, (number | null)[]> } {
    const dates: string[] = [];
    const values = new Map<number, (number | null)[]>();
    for (const id of ids) values.set(id, []);

    for (const month of [...this.months.keys()].sort()) {
      const file = this.months.get(month)!;
      const cols = new Map(ids.map((id) => [id, file.ids.indexOf(id)]));
      for (const day of Object.keys(file.days).sort()) {
        dates.push(day);
        const row = file.days[day];
        for (const id of ids) {
          const c = cols.get(id)!;
          values.get(id)!.push(c < 0 ? null : (row.trend?.[c] ?? null));
        }
      }
    }
    return { dates, values };
  }

  catalog(): Promise<Catalog> {
    if (!this.catalogPromise) this.catalogPromise = get<Catalog>("catalog.json");
    return this.catalogPromise;
  }

  cardmarketUrl(id: number): string {
    // Cardmarket přesměruje z id na správnou stránku produktu.
    return `https://www.cardmarket.com/en/Pokemon/Products/Singles?idProduct=${id}`;
  }
}
