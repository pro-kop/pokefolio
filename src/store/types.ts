export interface Lot {
  /** Datum nákupu, ISO YYYY-MM-DD. */
  date: string;
  qty: number;
  /** Cena za kus v EUR, bez poplatků. */
  unitCost: number;
  /** Poštovné a poplatky za celý nákup, v EUR. */
  fees?: number;
  source?: string;
  note?: string;
}

export interface Holding {
  id: string;
  /** Cardmarket idProduct — jediná vazba mezi tvou sbírkou a trhem. */
  productId: number;
  /** Uložený název, ať jde položka zobrazit i než se načte katalog. */
  name: string;
  kind: 0 | 1;
  condition?: "NM" | "EX" | "GD" | "LP" | "PL" | "PO";
  lots: Lot[];
  tags?: string[];
}

export interface Collection {
  version: 1;
  holdings: Holding[];
  /** Produkty sledované bez vlastnictví — hvězdička v katalogu. */
  watchlist: number[];
  settings: {
    currency: "EUR" | "CZK";
    radar: {
      minSpreadPct: number;
      minDrop30Pct: number;
      minPriceEur: number;
      minScore: number;
    };
  };
  /** Token pro zálohu do Gistu. Uložený uvnitř šifrovaného bloku, ne vedle něj. */
  backup?: {
    gistId?: string;
    token?: string;
    auto: boolean;
    lastSyncedAt?: string;
  };
  updatedAt: string;
}

export const EMPTY_COLLECTION: Collection = {
  version: 1,
  holdings: [],
  watchlist: [],
  settings: {
    currency: "EUR",
    radar: { minSpreadPct: 15, minDrop30Pct: 8, minPriceEur: 10, minScore: 40 },
  },
  updatedAt: new Date().toISOString(),
};

/** Průměrná pořizovací cena za kus včetně poplatků. */
export function avgCost(h: Holding): number {
  const qty = totalQty(h);
  if (!qty) return 0;
  const spent = h.lots.reduce((s, l) => s + l.qty * l.unitCost + (l.fees ?? 0), 0);
  return spent / qty;
}

export function totalQty(h: Holding): number {
  return h.lots.reduce((s, l) => s + l.qty, 0);
}

export function invested(h: Holding): number {
  return h.lots.reduce((s, l) => s + l.qty * l.unitCost + (l.fees ?? 0), 0);
}
