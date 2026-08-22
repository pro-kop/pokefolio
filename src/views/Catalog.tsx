import { useEffect, useMemo, useState } from "react";
import { useApp } from "../app/state";
import { Sparkline } from "../charts/Sparkline";
import { Card, Chips, Empty, SearchBox, Tag, Thumb } from "../components/ui";
import { dirColor, money, pct } from "../format";
import { changeOver } from "../calc/portfolio";
import type { Catalog } from "../market/load";

type Filter = "vse" | "sealed" | "single" | "sledovane";

export function CatalogView({ onOpenDetail }: { onOpenDetail: (id: number) => void }) {
  const { market, collection, update, currency, historyReady, toast } = useApp();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("vse");

  useEffect(() => {
    let alive = true;
    market.catalog().then(
      (c) => alive && setCatalog(c),
      () => alive && toast("Katalog se nepodařilo načíst.", "err"),
    );
    return () => {
      alive = false;
    };
  }, [market, toast]);

  const owned = useMemo(() => new Set(collection.holdings.map((h) => h.productId)), [collection.holdings]);
  const watched = useMemo(() => new Set(collection.watchlist), [collection.watchlist]);

  const rows = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();

    let source = catalog.products;
    if (filter === "sledovane") {
      source = source.filter((p) => owned.has(p[0]) || watched.has(p[0]));
    } else if (filter !== "vse") {
      source = source.filter((p) => p[3] === (filter === "sealed" ? 1 : 0));
    }

    const out: Catalog["products"] = [];
    for (const p of source) {
      if (q && !p[1].toLowerCase().includes(q)) continue;
      out.push(p);
      if (out.length >= 120) break;
    }
    return out;
  }, [catalog, query, filter, owned, watched]);

  function toggleWatch(id: number) {
    update((d) => ({
      ...d,
      watchlist: d.watchlist.includes(id) ? d.watchlist.filter((w) => w !== id) : [...d.watchlist, id],
    }));
  }

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Katalog</h1>
          <p>
            Celý katalog Cardmarketu pro Pokémon — hledá se lokálně v prohlížeči nad staženým
            indexem. Hvězdička přidá produkt mezi sledované; ty se pak dají filtrovat v radaru
            i bez toho, abys je vlastnil.
          </p>
        </div>
      </div>

      <div className="filterbar">
        <SearchBox value={query} onChange={setQuery} placeholder="Umbreon, Prismatic Evolutions, booster box…" wide />
        <Chips<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            ["vse", "Vše"],
            ["sealed", "Sealed"],
            ["single", "Singles"],
            ["sledovane", "Sledované"],
          ]}
        />
        <span className="num" style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--ink-3)" }}>
          {catalog
            ? `${rows.length}${rows.length >= 120 ? "+" : ""} z ${catalog.count.toLocaleString("cs-CZ")} produktů`
            : "načítám katalog…"}
        </span>
      </div>

      <Card>
        {!catalog ? (
          <div style={{ padding: 48 }}>
            <div className="spinner" />
          </div>
        ) : rows.length === 0 ? (
          <Empty title="Nic se nenašlo">
            <p>Zkus jiný výraz — hledá se v anglických názvech, jak je vede Cardmarket.</p>
          </Empty>
        ) : (
          <div className="table-scroll">
            <table className="data" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th>Produkt</th>
                  <th>Typ</th>
                  <th>Low</th>
                  <th>Trend</th>
                  <th>7 dní</th>
                  <th>30 dní</th>
                  <th>Historie</th>
                  <th>Sledovat</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const id = p[0];
                  const price = market.price(id);
                  const s = historyReady && market.isTracked(id) ? market.series(id) : { dates: [], trend: [], low: [] };
                  const d7 = changeOver(s.dates, s.trend, "7D").pct;
                  const d30 = changeOver(s.dates, s.trend, "1M").pct;
                  const on = owned.has(id) || watched.has(id);
                  return (
                    <tr key={id} onClick={() => onOpenDetail(id)}>
                      <td>
                        <div className="prod-cell">
                          <Thumb kind={p[3]} />
                          <div style={{ minWidth: 0 }}>
                            <div className="prod-name">{p[1]}</div>
                            <div className="prod-sub">
                              #{id}
                              {owned.has(id) ? " · v portfoliu" : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Tag kind={p[3]} />
                      </td>
                      <td className="num" style={{ color: "var(--ink-2)" }}>
                        {price.low !== null ? money(price.low, currency) : "—"}
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {price.trend !== null ? money(price.trend, currency) : "nesledováno"}
                      </td>
                      <td className="num" style={{ color: dirColor(d7) }}>
                        {s.dates.length > 1 ? pct(d7) : "—"}
                      </td>
                      <td className="num" style={{ color: dirColor(d30) }}>
                        {s.dates.length > 1 ? pct(d30) : "—"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Sparkline values={s.trend} color={dirColor(d30)} />
                      </td>
                      <td>
                        <button
                          className="icon-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWatch(id);
                          }}
                          aria-label={on ? "Přestat sledovat" : "Sledovat"}
                          style={{ color: on ? "var(--brand-3)" : "var(--ink-3)", fontSize: 15 }}
                        >
                          {on ? "★" : "☆"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p style={{ marginTop: 14, fontSize: 12, color: "var(--ink-3)", maxWidth: "70ch" }}>
        Ceny má jen sledovaná množina — všechen sealed a karty nad{" "}
        {money(30, "EUR", 0)}. Prah se mění v <code>config/tracking.json</code> v repozitáři.
      </p>
    </>
  );
}
