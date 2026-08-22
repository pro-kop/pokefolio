import { useMemo, useState } from "react";
import { useApp } from "../app/state";
import { AreaChart } from "../charts/AreaChart";
import { Sparkline } from "../charts/Sparkline";
import { Card, CardHead, Delta, Empty, Icon, Note, Ranges, icons } from "../components/ui";
import { dirColor, money, pct, signedMoney } from "../format";
import {
  RANGE_LABELS,
  changeOver,
  startIndex,
  type PortfolioSeries,
  type RangeKey,
  type Totals,
  type Valued,
} from "../calc/portfolio";
import { OpportunityCard } from "./Radar";

interface Props {
  valued: Valued[];
  totals: Totals;
  series: PortfolioSeries | null;
  onOpenDetail: (id: number) => void;
  onGoRadar: () => void;
}

export function Dashboard({ valued, totals, series, onOpenDetail, onGoRadar }: Props) {
  const { market, currency } = useApp();
  const [range, setRange] = useState<RangeKey>("YTD");
  const [moverRange, setMoverRange] = useState<RangeKey>("7D");

  const change = series ? changeOver(series.dates, series.value, range) : { pct: 0, abs: 0 };
  const from = series ? startIndex(series.dates, range) : 0;

  const movers = useMemo(() => {
    if (!series) return [];
    return valued
      .map((v) => {
        const s = market.series(v.holding.productId);
        const ch = changeOver(s.dates, s.trend, moverRange);
        return { v, ch: ch.pct, spark: s.trend.slice(startIndex(s.dates, moverRange)) };
      })
      .filter((m) => m.spark.length > 1)
      .sort((a, b) => Math.abs(b.ch) - Math.abs(a.ch))
      .slice(0, 7);
  }, [valued, market, moverRange, series]);

  const alloc = useMemo(() => {
    const sealed = valued.filter((v) => market.kind(v.holding.productId) === 1).reduce((s, v) => s + v.value, 0);
    return [
      { label: "Sealed", value: sealed, color: "#7b6cf6", count: valued.filter((v) => market.kind(v.holding.productId) === 1).length },
      { label: "Singles", value: totals.value - sealed, color: "#ce7b29", count: valued.filter((v) => market.kind(v.holding.productId) === 0).length },
    ].filter((s) => s.value > 0);
  }, [valued, totals.value, market]);

  const topRadar = market.radar.items.slice(0, 3);

  if (!valued.length) {
    return (
      <>
        <div className="view-head">
          <div>
            <h1>Přehled</h1>
            <p>Zatím tu není co počítat.</p>
          </div>
        </div>
        <Card>
          <Empty title="Sbírka je prázdná">
            <p>
              Přidej první položku v Portfoliu, nebo si projdi Katalog a označ hvězdičkou, co chceš
              sledovat. Radar funguje i pro produkty, které nevlastníš.
            </p>
          </Empty>
        </Card>
      </>
    );
  }

  return (
    <>
      {market.radar.warmingUp && (
        <Note tone="warn">
          Historie má zatím <b>{market.radar.daysOfHistory} {market.radar.daysOfHistory === 1 ? "den" : "dní"}</b>.
          Cardmarket archiv nepublikuje, takže se sbírá od prvního běhu dávky — grafy a procentní změny
          naskočí postupně, radar začne počítat naplno po dvou týdnech.
        </Note>
      )}

      <Card className="hero">
        <div className="hero-grid">
          <div className="hero-left">
            <div>
              <div className="eyebrow">Hodnota portfolia</div>
              <div className="hero-value">{money(totals.value, currency, 0)}</div>
              {market.fx.czk && (
                <div className="hero-czk">
                  {currency === "EUR"
                    ? `≈ ${Math.round(totals.value * market.fx.czk).toLocaleString("cs-CZ")} Kč`
                    : `≈ ${Math.round(totals.value).toLocaleString("cs-CZ")} €`}{" "}
                  · kurz ECB {market.fx.czk.toFixed(2).replace(".", ",")}
                </div>
              )}
            </div>

            <div>
              {series ? (
                <>
                  <Delta value={change.pct} extra={signedMoney(change.abs, currency, 0)} />
                  <span style={{ fontSize: 11.5, color: "var(--ink-3)", marginLeft: 6 }}>
                    za {RANGE_LABELS[range]}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Načítám historii…</span>
              )}
            </div>

            <div className="mini-rows">
              <div className="mini-row">
                <span className="k">Investováno</span>
                <span className="v">{money(totals.invested, currency, 0)}</span>
              </div>
              <div className="mini-row">
                <span className="k">Nerealizovaný zisk</span>
                <span className={`v ${totals.profit >= 0 ? "pl-pos" : "pl-neg"}`}>
                  {signedMoney(totals.profit, currency, 0)} ({pct(totals.profitPct)})
                </span>
              </div>
              <div className="mini-row">
                <span className="k">Položek / kusů</span>
                <span className="v">
                  {totals.items} / {totals.units}
                </span>
              </div>
            </div>
          </div>

          <div className="hero-right">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="eyebrow">Vývoj hodnoty</div>
              <div style={{ marginLeft: "auto" }}>
                <Ranges value={range} onChange={setRange} />
              </div>
            </div>
            {series && series.dates.length > 1 ? (
              <>
                <AreaChart
                  dates={series.dates}
                  from={from}
                  series={[{ label: "Hodnota", values: series.value, color: "#7b6cf6", fill: true }]}
                  baseline={series.cost}
                  format={(v) => money(v, currency, 0)}
                />
                <div className="legend">
                  <span>
                    <i style={{ background: "var(--brand-2)" }} />
                    Tržní hodnota
                  </span>
                  <span>
                    <i style={{ background: "var(--ink-3)" }} />
                    Investováno
                  </span>
                </div>
              </>
            ) : (
              <div className="empty" style={{ padding: "48px 20px" }}>
                Graf se objeví, jakmile bude historie aspoň dva dny dlouhá.
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="tiles">
        <Tile label="Investováno" value={money(totals.invested, currency, 0)} foot={`${totals.units} kusů ve ${totals.items} položkách`} />
        <Tile
          label="Nerealizovaný zisk"
          value={signedMoney(totals.profit, currency, 0)}
          foot={`${pct(totals.profitPct)} od nákupu`}
          color={totals.profit >= 0 ? "var(--up)" : "var(--down)"}
        />
        <Tile
          label={`Nejlepší za ${RANGE_LABELS[moverRange]}`}
          value={movers.length ? pct(movers.reduce((a, b) => (b.ch > a.ch ? b : a)).ch) : "—"}
          foot={movers.length ? movers.reduce((a, b) => (b.ch > a.ch ? b : a)).v.holding.name : "zatím bez dat"}
          color="var(--up)"
        />
        <Tile
          label="Příležitostí na radaru"
          value={String(market.radar.items.filter((i) => i.score >= 55).length)}
          foot={`skóre 55 a výš z ${market.radar.evaluated.toLocaleString("cs-CZ")} vyhodnocených`}
        />
      </div>

      <div className="cols-3">
        <Card>
          <CardHead title="Největší pohyby">
            <Ranges value={moverRange} onChange={setMoverRange} keys={["7D", "1M", "YTD"]} />
          </CardHead>
          {movers.length ? (
            movers.map((m) => (
              <button key={m.v.holding.id} className="mover" onClick={() => onOpenDetail(m.v.holding.productId)}>
                <div style={{ minWidth: 0 }}>
                  <div className="m-name">{m.v.holding.name}</div>
                  <div className="m-sub">
                    {m.v.qty} ks · {m.v.trend !== null ? money(m.v.trend, currency) : "bez ceny"}
                  </div>
                </div>
                <div>
                  <Sparkline values={m.spark} color={dirColor(m.ch)} />
                </div>
                <div className="m-pct" style={{ color: dirColor(m.ch) }}>
                  {pct(m.ch)}
                </div>
              </button>
            ))
          ) : (
            <div className="empty" style={{ padding: "36px 20px" }}>
              Pohyby se ukážou, až historie povyroste.
            </div>
          )}
        </Card>

        <Card>
          <CardHead title="Rozložení sbírky" />
          <div className="card-body">
            <div className="alloc-bar">
              {alloc.map((s) => (
                <div key={s.label} className="alloc-seg" style={{ flex: s.value, background: s.color }}>
                  {Math.round((s.value / totals.value) * 100)} %
                </div>
              ))}
            </div>
            <div className="alloc-list">
              {alloc.map((s) => (
                <div key={s.label} className="alloc-item">
                  <span className="sw" style={{ background: s.color }} />
                  {s.label}
                  <span style={{ color: "var(--ink-3)", fontSize: 12 }}>· {s.count} položek</span>
                  <span className="v">{money(s.value, currency, 0)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {topRadar.length > 0 && (
        <Card style={{ marginTop: 18 }}>
          <CardHead title="Radar — dnešní příležitosti">
            <button className="btn" onClick={onGoRadar}>
              Celý radar
              <Icon path={icons.arrowRight} size={13} width={2.2} />
            </button>
          </CardHead>
          <div className="card-body">
            <div className="radar-grid">
              {topRadar.map((item) => (
                <OpportunityCard key={item.id} item={item} onOpenDetail={onOpenDetail} />
              ))}
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

function Tile({ label, value, foot, color }: { label: string; value: string; foot: string; color?: string }) {
  return (
    <div className="card tile">
      <div className="eyebrow">{label}</div>
      <div className="t-num" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="t-foot">{foot}</div>
    </div>
  );
}
