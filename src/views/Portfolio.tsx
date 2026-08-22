import { useMemo, useState } from "react";
import { useApp } from "../app/state";
import { Sparkline } from "../charts/Sparkline";
import { Card, Chips, Empty, Icon, Ranges, SearchBox, Thumb, icons } from "../components/ui";
import { dirColor, money, pct, signedMoney } from "../format";
import { changeOver, startIndex, type RangeKey, type Totals, type Valued } from "../calc/portfolio";
import { HoldingForm } from "./HoldingForm";
import type { Holding } from "../store/types";

type SortKey = "name" | "qty" | "avgCost" | "trend" | "low" | "value" | "change" | "profit";
type Filter = "vse" | "sealed" | "single";

const COLS: { key: SortKey | "spark"; label: string; sortable: boolean }[] = [
  { key: "name", label: "Produkt", sortable: true },
  { key: "qty", label: "Ks", sortable: true },
  { key: "avgCost", label: "Ø nákup", sortable: true },
  { key: "trend", label: "Cena (trend)", sortable: true },
  { key: "low", label: "Low", sortable: true },
  { key: "value", label: "Hodnota", sortable: true },
  { key: "change", label: "Změna", sortable: true },
  { key: "spark", label: "Historie", sortable: false },
  { key: "profit", label: "Zisk / ztráta", sortable: true },
];

export function PortfolioView({
  valued,
  totals,
  onOpenDetail,
}: {
  valued: Valued[];
  totals: Totals;
  onOpenDetail: (id: number) => void;
}) {
  const { market, currency, historyReady } = useApp();
  const [filter, setFilter] = useState<Filter>("vse");
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<RangeKey>("1M");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "value", dir: -1 });
  const [editing, setEditing] = useState<Holding | null>(null);
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const enriched = valued
      .filter((v) => filter === "vse" || market.kind(v.holding.productId) === (filter === "sealed" ? 1 : 0))
      .filter((v) => !q || v.holding.name.toLowerCase().includes(q))
      .map((v) => {
        const s = historyReady ? market.series(v.holding.productId) : { dates: [], trend: [], low: [] };
        const ch = changeOver(s.dates, s.trend, range);
        return { v, change: ch.pct, spark: s.trend.slice(startIndex(s.dates, range)) };
      });

    const pick = (r: (typeof enriched)[number]): number | string => {
      switch (sort.key) {
        case "name":
          return r.v.holding.name;
        case "qty":
          return r.v.qty;
        case "avgCost":
          return r.v.avgCost;
        case "trend":
          return r.v.trend ?? 0;
        case "low":
          return r.v.low ?? 0;
        case "value":
          return r.v.value;
        case "change":
          return r.change;
        case "profit":
          return r.v.profit;
      }
    };

    return enriched.sort((a, b) => {
      const x = pick(a);
      const y = pick(b);
      if (typeof x === "string" && typeof y === "string") return sort.dir * x.localeCompare(y, "cs");
      return sort.dir * ((x as number) - (y as number));
    });
  }, [valued, filter, query, range, sort, market, historyReady]);

  const shown = useMemo(
    () => ({
      value: rows.reduce((s, r) => s + r.v.value, 0),
      invested: rows.reduce((s, r) => s + r.v.invested, 0),
      units: rows.reduce((s, r) => s + r.v.qty, 0),
    }),
    [rows],
  );

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Portfolio</h1>
          <p>
            Pořizovací cenu zadáváš ručně jednou při nákupu. Aktuální cena se tahá denně
            z Cardmarket price guide — sloupec <b>Cena</b> je trend, tedy cena, za kterou se
            produkt reálně obchoduje, ne ta nejlevnější nabídka.
          </p>
        </div>
        <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setAdding(true)}>
          <Icon path={icons.plus} size={14} width={2.4} />
          Přidat položku
        </button>
      </div>

      {valued.length === 0 ? (
        <Card>
          <Empty title="Sbírka je zatím prázdná">
            <p>
              Přidej první položku — najdeš ji podle názvu v katalogu Cardmarketu a doplníš,
              kolik kusů a za kolik jsi koupil.
            </p>
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              <Icon path={icons.plus} size={14} width={2.4} />
              Přidat položku
            </button>
          </Empty>
        </Card>
      ) : (
        <>
          <div className="filterbar">
            <Chips<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                ["vse", "Vše"],
                ["sealed", "Sealed"],
                ["single", "Singles"],
              ]}
            />
            <SearchBox value={query} onChange={setQuery} placeholder="Hledat v portfoliu…" />
            <div style={{ marginLeft: "auto" }}>
              <Ranges value={range} onChange={setRange} keys={["7D", "1M", "YTD", "1R"]} />
            </div>
          </div>

          <Card>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    {COLS.map((c) => (
                      <th
                        key={c.key}
                        className={c.sortable ? "sortable" : undefined}
                        onClick={
                          c.sortable
                            ? () =>
                                setSort((s) =>
                                  s.key === c.key
                                    ? { key: s.key, dir: (s.dir * -1) as 1 | -1 }
                                    : { key: c.key as SortKey, dir: c.key === "name" ? 1 : -1 },
                                )
                            : undefined
                        }
                      >
                        {c.label}
                        {sort.key === c.key ? <span className="arrow">{sort.dir === 1 ? "▲" : "▼"}</span> : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.v.holding.id} onClick={() => onOpenDetail(r.v.holding.productId)}>
                      <td>
                        <div className="prod-cell">
                          <Thumb kind={market.kind(r.v.holding.productId)} />
                          <div style={{ minWidth: 0 }}>
                            <div className="prod-name">{r.v.holding.name}</div>
                            <div className="prod-sub">
                              #{r.v.holding.productId}
                              {r.v.holding.condition ? ` · ${r.v.holding.condition}` : ""}
                            </div>
                          </div>
                          <button
                            className="icon-btn"
                            style={{ marginLeft: 8 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditing(r.v.holding);
                            }}
                            aria-label={`Upravit ${r.v.holding.name}`}
                          >
                            <Icon path={icons.settings} size={14} width={2} />
                          </button>
                        </div>
                      </td>
                      <td className="num">{r.v.qty}</td>
                      <td className="num" style={{ color: "var(--ink-2)" }}>
                        {money(r.v.avgCost, currency)}
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {r.v.trend !== null ? money(r.v.trend, currency) : "—"}
                      </td>
                      <td className="num" style={{ color: "var(--ink-3)" }}>
                        {r.v.low !== null ? money(r.v.low, currency) : "—"}
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {money(r.v.value, currency)}
                      </td>
                      <td className="num" style={{ color: dirColor(r.change) }}>
                        {r.spark.length > 1 ? pct(r.change) : "—"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Sparkline values={r.spark} color={dirColor(r.change)} />
                      </td>
                      <td className={`num ${r.v.profit >= 0 ? "pl-pos" : "pl-neg"}`} style={{ fontWeight: 600 }}>
                        {signedMoney(r.v.profit, currency)}
                        <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 400 }}>{pct(r.v.profitPct)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>
                      Celkem {rows.length} {rows.length === 1 ? "položka" : rows.length < 5 ? "položky" : "položek"}
                    </td>
                    <td className="num">{shown.units}</td>
                    <td className="num" style={{ color: "var(--ink-3)" }}>
                      {money(shown.invested, currency, 0)}
                    </td>
                    <td />
                    <td />
                    <td className="num">{money(shown.value, currency, 0)}</td>
                    <td />
                    <td />
                    <td className={`num ${shown.value - shown.invested >= 0 ? "pl-pos" : "pl-neg"}`}>
                      {signedMoney(shown.value - shown.invested, currency, 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <p style={{ marginTop: 14, fontSize: 12, color: "var(--ink-3)" }}>
            Celé portfolio: {money(totals.value, currency, 0)} · investováno {money(totals.invested, currency, 0)} ·{" "}
            {signedMoney(totals.profit, currency, 0)} ({pct(totals.profitPct)})
          </p>
        </>
      )}

      {(adding || editing) && (
        <HoldingForm
          existing={editing ?? undefined}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
