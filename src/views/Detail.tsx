import { useMemo, useState } from "react";
import { useApp } from "../app/state";
import { AreaChart } from "../charts/AreaChart";
import { Card, CardHead, Delta, Icon, Note, Ranges, Tag, Thumb, icons } from "../components/ui";
import { fmtDateMed, money, pct, signedMoney } from "../format";
import { RANGE_LABELS, changeOver, startIndex, valueHolding, type RangeKey } from "../calc/portfolio";
import { HoldingForm } from "./HoldingForm";

const RANGES: RangeKey[] = ["7D", "1M", "YTD", "1R", "MAX"];

export function DetailView({ id, onBack }: { id: number; onBack: () => void }) {
  const { market, collection, currency, historyReady, update } = useApp();
  const [range, setRange] = useState<RangeKey>("1R");
  const [editing, setEditing] = useState(false);

  const holding = collection.holdings.find((h) => h.productId === id) ?? null;
  const valued = holding ? valueHolding(holding, market) : null;
  const price = market.price(id);
  const kind = market.kind(id);
  const radar = market.radar.items.find((i) => i.id === id) ?? null;
  const watched = collection.watchlist.includes(id);

  const series = useMemo(
    () => (historyReady ? market.series(id) : { dates: [], trend: [], low: [] }),
    [historyReady, market, id],
  );

  const from = startIndex(series.dates, range);
  const change = changeOver(series.dates, series.trend, "1M");

  const markers = useMemo(() => {
    if (!holding) return [];
    return holding.lots
      .map((l) => ({ index: series.dates.findIndex((d) => d >= l.date), value: l.unitCost, label: "Nákup" }))
      .filter((m) => m.index >= 0);
  }, [holding, series.dates]);

  const yearTrend = series.trend.filter((v): v is number => v !== null).slice(-365);

  return (
    <>
      <button className="btn" style={{ marginBottom: 18 }} onClick={onBack}>
        <Icon path={icons.arrowLeft} size={13} width={2.2} />
        Zpět
      </button>

      <div className="detail-head">
        <Thumb kind={kind} big />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 className="detail-title">{market.name(id)}</h1>
          <div className="detail-meta">
            <Tag kind={kind} />
            <span className="num">Cardmarket #{id}</span>
            {holding ? (
              <>
                <span>·</span>
                <span style={{ color: "var(--brand-3)" }}>V portfoliu</span>
              </>
            ) : null}
            <span>·</span>
            <a href={market.cardmarketUrl(id)} target="_blank" rel="noreferrer noopener" style={{ color: "var(--brand-2)" }}>
              Otevřít na Cardmarketu
            </a>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="num" style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-.04em" }}>
            {price.trend !== null ? money(price.trend, currency) : "—"}
          </div>
          {series.dates.length > 1 && <div style={{ marginTop: 5 }}>{<Delta value={change.pct} />}</div>}
        </div>
      </div>

      <div className="detail-cols">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Card>
            <CardHead title="Vývoj ceny">
              <Ranges value={range} onChange={setRange} keys={RANGES} />
            </CardHead>
            <div className="card-body">
              {series.dates.length > 1 ? (
                <>
                  <AreaChart
                    dates={series.dates}
                    from={from}
                    height={262}
                    series={[
                      { label: "Trend", values: series.trend, color: "#7b6cf6", fill: true },
                      { label: "Nejnižší nabídka", values: series.low, color: "#139575" },
                    ]}
                    markers={markers.filter((m) => m.index >= from)}
                    format={(v) => money(v, currency, 0)}
                  />
                  <div className="legend" style={{ marginTop: 12 }}>
                    <span>
                      <i style={{ background: "#7b6cf6" }} />
                      Trend (obchodovaná cena)
                    </span>
                    <span>
                      <i style={{ background: "#139575" }} />
                      Nejnižší nabídka
                    </span>
                    {markers.some((m) => m.index >= from) && (
                      <span>
                        <i style={{ background: "#e8529e" }} />
                        Tvůj nákup
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="empty" style={{ padding: "44px 20px" }}>
                  {market.isTracked(id)
                    ? "Historie se teprve sbírá. Graf naskočí po druhém běhu denní dávky."
                    : "Tenhle produkt zatím není ve sledované množině, takže se mu neukládá historie. Přidej si ho do sbírky nebo mezi sledované."}
                </div>
              )}
            </div>
          </Card>

          {series.dates.length > 1 && (
            <Card>
              <CardHead title="Výkonnost podle období" />
              <div className="card-body">
                <div className="perf-grid">
                  {RANGES.map((k) => {
                    const c = changeOver(series.dates, series.trend, k);
                    return (
                      <div className="perf-cell" key={k}>
                        <div className="eyebrow">{RANGE_LABELS[k]}</div>
                        <div
                          className="num"
                          style={{ fontSize: 19, fontWeight: 600, color: c.pct >= 0 ? "var(--up)" : "var(--down)" }}
                        >
                          {pct(c.pct)}
                        </div>
                        <div className="num" style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                          {signedMoney(c.abs, currency)} / ks
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}

          {holding && (
            <Card>
              <CardHead title="Nákupy">
                <button className="btn" style={{ padding: "6px 13px", fontSize: 12 }} onClick={() => setEditing(true)}>
                  Upravit
                </button>
              </CardHead>
              <div className="table-scroll">
                <table className="data" style={{ minWidth: 520 }}>
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Ks</th>
                      <th>Cena / ks</th>
                      <th>Poštovné</th>
                      <th>Celkem</th>
                      <th>Dnes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holding.lots.map((l, i) => {
                      const spent = l.qty * l.unitCost + (l.fees ?? 0);
                      const now = price.trend !== null ? l.qty * price.trend : 0;
                      const diff = now - spent;
                      return (
                        <tr key={i} style={{ cursor: "default" }}>
                          <td className="num">{fmtDateMed(l.date)}</td>
                          <td className="num">{l.qty}</td>
                          <td className="num">{money(l.unitCost, currency)}</td>
                          <td className="num" style={{ color: "var(--ink-3)" }}>
                            {money(l.fees ?? 0, currency)}
                          </td>
                          <td className="num">{money(spent, currency)}</td>
                          <td className={`num ${diff >= 0 ? "pl-pos" : "pl-neg"}`}>
                            {signedMoney(diff, currency)} ({pct(spent ? diff / spent : 0)})
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {valued ? (
            <Card>
              <CardHead title="Tvoje pozice" />
              <div className="card-body">
                <Kv k="Kusů" v={String(valued.qty)} />
                <Kv k="Průměrný nákup" v={money(valued.avgCost, currency)} />
                <Kv k="Investováno" v={money(valued.invested, currency)} />
                <Kv k="Tržní hodnota" v={money(valued.value, currency)} big />
                <Kv
                  k="Zisk / ztráta"
                  v={`${signedMoney(valued.profit, currency)} (${pct(valued.profitPct)})`}
                  big
                  cls={valued.profit >= 0 ? "pl-pos" : "pl-neg"}
                />
              </div>
            </Card>
          ) : (
            <Card>
              <div className="card-body">
                <p style={{ fontSize: 13, color: "var(--ink-2)", margin: "0 0 14px" }}>
                  Tenhle produkt nemáš ve sbírce.
                </p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="btn btn-primary" onClick={() => setEditing(true)}>
                    <Icon path={icons.plus} size={14} width={2.4} />
                    Přidat do sbírky
                  </button>
                  <button
                    className="btn"
                    onClick={() =>
                      update((d) => ({
                        ...d,
                        watchlist: watched ? d.watchlist.filter((w) => w !== id) : [...d.watchlist, id],
                      }))
                    }
                  >
                    {watched ? "★ Sledováno" : "☆ Sledovat"}
                  </button>
                </div>
              </div>
            </Card>
          )}

          <Card>
            <CardHead title="Tržní data" />
            <div className="card-body">
              <Kv k="Trend" v={price.trend !== null ? money(price.trend, currency) : "—"} />
              <Kv
                k="Nejnižší nabídka"
                v={price.low !== null ? money(price.low, currency) : "—"}
                style={{ color: "var(--up)" }}
              />
              {price.trend && price.low ? (
                <Kv k="Rozdíl low vs. trend" v={pct(-(price.trend - price.low) / price.trend)} />
              ) : null}
              <Kv k="Průměr 7 dní" v={price.avg7 !== null ? money(price.avg7, currency) : "—"} />
              <Kv k="Průměr 30 dní" v={price.avg30 !== null ? money(price.avg30, currency) : "—"} />
              {yearTrend.length > 20 && (
                <>
                  <Kv k="Roční minimum" v={money(Math.min(...yearTrend), currency)} />
                  <Kv k="Roční maximum" v={money(Math.max(...yearTrend), currency)} />
                </>
              )}
            </div>
          </Card>

          {radar && (
            <Card>
              <div className="card-head">
                <h2>Signály radaru</h2>
                <div className="spacer" />
                <span
                  className="num"
                  style={{ fontSize: 19, fontWeight: 700, color: radar.score >= 70 ? "var(--up)" : "var(--brand-2)" }}
                >
                  {radar.score}
                </span>
              </div>
              <div className="card-body">
                <div className="opp-signals" style={{ padding: 0 }}>
                  {radar.signals.map((s, i) => (
                    <span key={i} className={`signal ${s.c}`}>
                      {s.t}
                    </span>
                  ))}
                </div>
                <div style={{ marginTop: 14 }}>
                  <Note>
                    Skóre se počítá ze čtyř složek: sleva low vůči trendu (36 b.), propad za 30 dní
                    (26 b.), blízkost ročnímu minimu (24 b.) a týdenní obrat vzhůru (14 b.).
                  </Note>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {editing && (
        <HoldingForm
          existing={holding ?? undefined}
          preset={{ id, name: market.name(id), kind }}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}

function Kv({
  k,
  v,
  big = false,
  cls = "",
  style,
}: {
  k: string;
  v: string;
  big?: boolean;
  cls?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className={`v ${big ? "big" : ""} ${cls}`} style={style}>
        {v}
      </span>
    </div>
  );
}
