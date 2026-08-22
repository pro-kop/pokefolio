import { useEffect, useMemo, useState } from "react";
import { useApp } from "../app/state";
import { Icon, Modal, Tag, icons } from "../components/ui";
import { money } from "../format";
import type { Catalog } from "../market/load";
import type { Holding, Lot } from "../store/types";

const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyLot = (): Lot => ({ date: todayIso(), qty: 1, unitCost: 0, fees: 0 });

export function HoldingForm({
  existing,
  preset,
  onClose,
}: {
  existing?: Holding;
  /** Produkt předvybraný z detailu, ať se nehledá znovu. */
  preset?: { id: number; name: string; kind: 0 | 1 };
  onClose: () => void;
}) {
  const { market, update, toast, currency } = useApp();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<{ id: number; name: string; kind: 0 | 1 } | null>(
    existing ? { id: existing.productId, name: existing.name, kind: existing.kind } : (preset ?? null),
  );
  const [lots, setLots] = useState<Lot[]>(existing ? structuredClone(existing.lots) : [emptyLot()]);
  const [condition, setCondition] = useState<Holding["condition"]>(existing?.condition ?? "NM");

  useEffect(() => {
    if (picked && !query) return;
    let alive = true;
    market.catalog().then(
      (c) => alive && setCatalog(c),
      () => alive && toast("Katalog se nepodařilo načíst.", "err"),
    );
    return () => {
      alive = false;
    };
  }, [market, picked, query, toast]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!catalog || q.length < 2) return [];
    const out: Catalog["products"] = [];
    for (const p of catalog.products) {
      if (p[1].toLowerCase().includes(q)) {
        out.push(p);
        if (out.length >= 40) break;
      }
    }
    // Sledované produkty (ty s cenou) nahoru — u nich hned uvidíš i cenu.
    return out.sort((a, b) => Number(market.isTracked(b[0])) - Number(market.isTracked(a[0])));
  }, [catalog, query, market]);

  function save() {
    if (!picked) return;
    const clean = lots
      .filter((l) => l.qty > 0)
      .map((l) => ({ ...l, qty: Number(l.qty), unitCost: Number(l.unitCost), fees: Number(l.fees ?? 0) }));
    if (!clean.length) {
      toast("Zadej aspoň jeden nákup s počtem kusů.", "err");
      return;
    }

    update((d) => {
      const holdings = d.holdings.slice();
      const i = existing ? holdings.findIndex((h) => h.id === existing.id) : -1;
      const record: Holding = {
        id: existing?.id ?? `h_${crypto.randomUUID()}`,
        productId: picked.id,
        name: picked.name,
        kind: picked.kind,
        condition,
        lots: clean,
        tags: existing?.tags,
      };
      if (i >= 0) holdings[i] = record;
      else holdings.push(record);
      return { ...d, holdings };
    });
    toast(existing ? "Položka upravena." : "Položka přidána.");
    onClose();
  }

  function remove() {
    if (!existing) return;
    update((d) => ({ ...d, holdings: d.holdings.filter((h) => h.id !== existing.id) }));
    toast("Položka smazána.");
    onClose();
  }

  return (
    <Modal
      title={existing ? "Upravit položku" : "Přidat položku"}
      onClose={onClose}
      footer={
        <>
          {existing && (
            <button className="btn" onClick={remove} style={{ color: "var(--down)" }}>
              <Icon path={icons.trash} size={14} width={2} />
              Smazat
            </button>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <button className="btn" onClick={onClose}>
              Zrušit
            </button>
            <button className="btn btn-primary" onClick={save} disabled={!picked}>
              Uložit
            </button>
          </div>
        </>
      }
    >
      <div className="field">
        <label htmlFor="prod">Produkt</label>
        {picked ? (
          <div className="result" style={{ background: "var(--surface-2)" }}>
            <Tag kind={picked.kind} />
            <div style={{ minWidth: 0 }}>
              <div>{picked.name}</div>
              <div className="r-sub">Cardmarket #{picked.id}</div>
            </div>
            <button
              className="icon-btn"
              style={{ marginLeft: "auto" }}
              onClick={() => {
                setPicked(null);
                setQuery("");
              }}
              aria-label="Vybrat jiný produkt"
            >
              <Icon path={icons.close} size={15} width={2} />
            </button>
          </div>
        ) : (
          <>
            <input
              id="prod"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Umbreon VMAX, Prismatic Evolutions Booster Bundle…"
              autoFocus
            />
            <span className="hint">
              {catalog
                ? `Hledá se v ${catalog.count.toLocaleString("cs-CZ")} produktech Cardmarketu.`
                : "Načítám katalog…"}
            </span>
            <div className="result-list">
              {results.map((p) => {
                const price = market.price(p[0]).trend;
                return (
                  <button key={p[0]} className="result" onClick={() => setPicked({ id: p[0], name: p[1], kind: p[3] })}>
                    <Tag kind={p[3]} />
                    <div style={{ minWidth: 0 }}>
                      <div>{p[1]}</div>
                      <div className="r-sub">#{p[0]}</div>
                    </div>
                    <span className="r-price">{price !== null ? money(price, currency) : "nesledováno"}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="field">
        <label htmlFor="cond">Stav</label>
        <select id="cond" value={condition} onChange={(e) => setCondition(e.target.value as Holding["condition"])}>
          <option value="NM">Near Mint</option>
          <option value="EX">Excellent</option>
          <option value="GD">Good</option>
          <option value="LP">Light Played</option>
          <option value="PL">Played</option>
          <option value="PO">Poor</option>
        </select>
        <span className="hint">
          Cardmarket ceník stav nerozlišuje — ocenění vychází z běžného kusu. Stav si tu vedeš pro sebe.
        </span>
      </div>

      <div className="field">
        <label>Nákupy</label>
        <span className="hint" style={{ marginBottom: 6 }}>
          Každý dokup zvlášť. Z toho se počítá průměrná pořizovací cena i poctivá výkonnost —
          dokup těsně před koncem období pak nezkreslí výnos.
        </span>
        <div className="lot-row" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          <span>Datum</span>
          <span>Ks</span>
          <span>Cena / ks (€)</span>
          <span>Poštovné (€)</span>
          <span />
        </div>
        {lots.map((lot, i) => (
          <div className="lot-row" key={i}>
            <input
              type="date"
              value={lot.date}
              onChange={(e) => setLots(lots.map((l, k) => (k === i ? { ...l, date: e.target.value } : l)))}
            />
            <input
              type="number"
              min={1}
              value={lot.qty}
              onChange={(e) => setLots(lots.map((l, k) => (k === i ? { ...l, qty: Number(e.target.value) } : l)))}
            />
            <input
              type="number"
              min={0}
              step="0.01"
              value={lot.unitCost}
              onChange={(e) => setLots(lots.map((l, k) => (k === i ? { ...l, unitCost: Number(e.target.value) } : l)))}
            />
            <input
              type="number"
              min={0}
              step="0.01"
              value={lot.fees ?? 0}
              onChange={(e) => setLots(lots.map((l, k) => (k === i ? { ...l, fees: Number(e.target.value) } : l)))}
            />
            <button
              className="icon-btn"
              onClick={() => setLots(lots.length > 1 ? lots.filter((_, k) => k !== i) : lots)}
              aria-label="Odebrat nákup"
              disabled={lots.length === 1}
            >
              <Icon path={icons.close} size={15} width={2} />
            </button>
          </div>
        ))}
        <button className="btn" style={{ marginTop: 6, padding: "6px 13px", fontSize: 12.5 }} onClick={() => setLots([...lots, emptyLot()])}>
          <Icon path={icons.plus} size={13} width={2.4} />
          Další nákup
        </button>
      </div>
    </Modal>
  );
}
