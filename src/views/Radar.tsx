import { useMemo, useState } from "react";
import { useApp } from "../app/state";
import { Sparkline } from "../charts/Sparkline";
import { Card, Chips, Empty, Icon, Note, SearchBox, Tag, icons } from "../components/ui";
import { money, pct } from "../format";
import type { RadarItem } from "../market/load";

type Filter = "vse" | "sealed" | "single" | "moje" | "sledovane";

export function RadarView({ onOpenDetail }: { onOpenDetail: (id: number) => void }) {
  const { market, collection, update } = useApp();
  const [filter, setFilter] = useState<Filter>("vse");
  const [query, setQuery] = useState("");
  const minScore = collection.settings.radar.minScore;

  const owned = useMemo(
    () => new Set(collection.holdings.map((h) => h.productId)),
    [collection.holdings],
  );
  const watched = useMemo(() => new Set(collection.watchlist), [collection.watchlist]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return market.radar.items
      .filter((i) => {
        if (filter === "sealed") return i.kind === 1;
        if (filter === "single") return i.kind === 0;
        if (filter === "moje") return owned.has(i.id);
        if (filter === "sledovane") return watched.has(i.id);
        return true;
      })
      .filter((i) => i.score >= minScore)
      .filter((i) => i.trend >= collection.settings.radar.minPriceEur)
      .filter((i) => !q || i.name.toLowerCase().includes(q));
  }, [market.radar.items, filter, minScore, query, owned, watched, collection.settings.radar.minPriceEur]);

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Radar příležitostí</h1>
          <p>
            Místo projíždění platforem se každý den porovná nejnižší nabídka na Cardmarketu
            s trendovou cenou a s vlastní historií produktu. Skóre 0–100 řadí to, co stojí za
            kliknutí, nahoru — neříká „kup", říká „tady se něco děje".
          </p>
        </div>
      </div>

      {market.radar.warmingUp && (
        <Note tone="warn">
          Historie má teprve {market.radar.daysOfHistory} {market.radar.daysOfHistory === 1 ? "den" : "dní"},
          takže skóre zatím počítá jen slevu nejnižší nabídky vůči trendu. Propady, roční minima
          a obraty trendu naskočí, jakmile bude na čem je měřit.
        </Note>
      )}

      <div className="filterbar">
        <Chips<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            ["vse", "Vše"],
            ["sealed", "Sealed"],
            ["single", "Singles"],
            ["moje", "Jen moje"],
            ["sledovane", "Jen sledované"],
          ]}
        />
        <SearchBox value={query} onChange={setQuery} placeholder="Filtrovat produkty…" />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 11 }}>
          <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Min. skóre</span>
          <input
            type="range"
            min={0}
            max={90}
            step={5}
            value={minScore}
            onChange={(e) =>
              update((d) => ({
                ...d,
                settings: { ...d.settings, radar: { ...d.settings.radar, minScore: Number(e.target.value) } },
              }))
            }
            aria-label="Minimální skóre"
          />
          <output className="num">{minScore}</output>
        </div>
      </div>

      {items.length ? (
        <div className="radar-grid">
          {items.map((item) => (
            <OpportunityCard key={item.id} item={item} onOpenDetail={onOpenDetail} />
          ))}
        </div>
      ) : (
        <Card>
          <Empty title="Nic neprošlo filtrem">
            <p>Sniž minimální skóre, změň typ produktu, nebo počkej na zítřejší dávku.</p>
          </Empty>
        </Card>
      )}
    </>
  );
}

export function OpportunityCard({
  item,
  onOpenDetail,
}: {
  item: RadarItem;
  onOpenDetail: (id: number) => void;
}) {
  const { market, currency, collection } = useApp();
  const owned = collection.holdings.some((h) => h.productId === item.id);
  const scoreColor = item.score >= 70 ? "var(--up)" : item.score >= 50 ? "var(--brand-2)" : "var(--ink-2)";

  return (
    <div className="card opp">
      <div className="opp-top">
        <div style={{ minWidth: 0 }}>
          <div className="opp-name">{item.name}</div>
          <div className="opp-sub">
            <Tag kind={item.kind} />
            {owned ? <span style={{ marginLeft: 8, color: "var(--brand-3)" }}>v portfoliu</span> : null}
          </div>
        </div>
        <div className="opp-score">
          <div className="s" style={{ color: scoreColor }}>
            {item.score}
          </div>
          <div className="l">Skóre</div>
          <div className="score-track">
            <div className="score-fill" style={{ width: `${item.score}%` }} />
          </div>
        </div>
      </div>

      <div className="opp-prices">
        <div>
          <span className="pk">Nejnižší nabídka</span>
          <span className="pv" style={{ color: "var(--up)" }}>
            {money(item.low, currency)}
          </span>
        </div>
        <div>
          <span className="pk">Trend</span>
          <span className="pv">{money(item.trend, currency)}</span>
        </div>
        <div>
          <span className="pk">30 dní</span>
          <span className="pv" style={{ color: item.d30 >= 0 ? "var(--up)" : "var(--down)" }}>
            {pct(item.d30)}
          </span>
        </div>
      </div>

      {item.spark.length > 1 && (
        <div className="opp-spark">
          <Sparkline values={item.spark} color={item.d30 >= 0 ? "#2fd9a4" : "#ff6b6b"} width={292} height={42} fluid />
        </div>
      )}

      <div className="opp-signals">
        {item.signals.map((s, i) => (
          <span key={i} className={`signal ${s.c}`}>
            {s.t}
          </span>
        ))}
      </div>

      <div className="opp-foot">
        <button className="btn" onClick={() => onOpenDetail(item.id)}>
          Detail a historie
        </button>
        <a
          className="btn btn-primary"
          style={{ marginLeft: "auto", padding: "6px 13px", fontSize: 12, whiteSpace: "nowrap" }}
          href={market.cardmarketUrl(item.id)}
          target="_blank"
          rel="noreferrer noopener"
        >
          Otevřít na Cardmarketu
          <Icon path={icons.external} size={12} width={2.2} />
        </a>
      </div>
    </div>
  );
}
