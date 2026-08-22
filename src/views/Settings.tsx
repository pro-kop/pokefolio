import { useRef, useState } from "react";
import { useApp } from "../app/state";
import { Card, CardHead, Icon, Note, icons } from "../components/ui";
import { downloadExport } from "../store/vault";
import { pullBackup, pushBackup } from "../store/backup";
import { fmtDate, fmtDateMed, plural } from "../format";
import type { Collection } from "../store/types";

export function SettingsView() {
  const { market, collection, update, session, toast, currency, setCurrency } = useApp();
  const [token, setToken] = useState(collection.backup?.token ?? "");
  const [gistId, setGistId] = useState(collection.backup?.gistId ?? "");
  const [busy, setBusy] = useState<"push" | "pull" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const units = collection.holdings.reduce((s, h) => s + h.lots.reduce((q, l) => q + l.qty, 0), 0);
  const lots = collection.holdings.reduce((s, h) => s + h.lots.length, 0);

  async function doPush() {
    if (!token) return toast("Nejdřív vlož GitHub token.", "err");
    setBusy("push");
    try {
      const res = await pushBackup(token, gistId || undefined, session.key, collection);
      setGistId(res.gistId);
      update((d) => ({
        ...d,
        backup: { ...d.backup, token, gistId: res.gistId, auto: d.backup?.auto ?? true, lastSyncedAt: res.at },
      }));
      toast("Záloha nahrána.");
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  async function doPull() {
    if (!token || !gistId) return toast("Potřebuju token i id Gistu.", "err");
    if (!confirm("Stažená záloha přepíše sbírku v tomhle prohlížeči. Pokračovat?")) return;
    setBusy("pull");
    try {
      const restored = await pullBackup(token, gistId, session.key);
      update(() => ({ ...restored, backup: { ...restored.backup, token, gistId, auto: restored.backup?.auto ?? true } }));
      toast("Sbírka obnovena ze zálohy.");
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  function importFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Collection;
        if (!Array.isArray(parsed.holdings)) throw new Error("Soubor neobsahuje sbírku.");
        if (!confirm(`Soubor obsahuje ${parsed.holdings.length} položek a přepíše současnou sbírku. Pokračovat?`)) return;
        update((d) => ({ ...d, ...parsed, backup: d.backup }));
        toast("Sbírka nahrána ze souboru.");
      } catch (err) {
        toast(`Import selhal: ${(err as Error).message}`, "err");
      }
    };
    reader.readAsText(file);
  }

  const radar = collection.settings.radar;
  const setRadar = (patch: Partial<typeof radar>) =>
    update((d) => ({ ...d, settings: { ...d.settings, radar: { ...d.settings.radar, ...patch } } }));

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Nastavení</h1>
          <p>
            Sbírka nikdy neopouští tvůj prohlížeč v čitelné podobě. Repozitář může být klidně
            veřejný — do zálohy se nahrává zašifrovaný blok, jehož klíč je odvozený z tvého hesla
            a nikde se neukládá.
          </p>
        </div>
      </div>

      <div className="set-grid">
        <Card>
          <CardHead title="Sbírka" />
          <div className="card-body">
            <div className="set-row">
              <div>
                <div className="sr-t">Uloženo v prohlížeči</div>
                <div className="sr-d">
                  {collection.holdings.length} {plural(collection.holdings.length, "položka", "položky", "položek")},{" "}
                  {units} {plural(units, "kus", "kusy", "kusů")}, {lots} {plural(lots, "nákup", "nákupy", "nákupů")},{" "}
                  {collection.watchlist.length} {plural(collection.watchlist.length, "sledovaný produkt", "sledované produkty", "sledovaných produktů")}.
                  Zašifrováno AES-GCM v IndexedDB.
                </div>
              </div>
              <div className="sr-c" style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn"
                  style={{ padding: "6px 13px", fontSize: 12 }}
                  onClick={() => downloadExport(collection, session.account.username)}
                >
                  Export
                </button>
                <button
                  className="btn"
                  style={{ padding: "6px 13px", fontSize: 12 }}
                  onClick={() => fileInput.current?.click()}
                >
                  Import
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/json"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importFile(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>

            <div className="set-row">
              <div>
                <div className="sr-t">Zobrazovat v korunách</div>
                <div className="sr-d">
                  {market.fx.czk
                    ? `Kurz ECB k ${fmtDateMed(market.fx.date)}: 1 EUR = ${market.fx.czk.toFixed(2).replace(".", ",")} Kč.`
                    : "Kurz se zatím nepodařilo načíst, zobrazuje se jen v eurech."}
                </div>
              </div>
              <div className="sr-c">
                <button
                  className="toggle"
                  aria-pressed={currency === "CZK"}
                  aria-label="Koruny"
                  disabled={!market.fx.czk}
                  onClick={() => setCurrency(currency === "CZK" ? "EUR" : "CZK")}
                />
              </div>
            </div>

            <div className="set-row">
              <div>
                <div className="sr-t">Přihlášen jako {session.account.username}</div>
                <div className="sr-d">
                  Účet vznikl {session.account.createdAt ? fmtDate(session.account.createdAt) : "neznámo kdy"}. Další
                  účet přidáš příkazem <code>npm run adduser</code> v repozitáři — každý má vlastní klíč a vlastní
                  sbírku, navzájem se nevidí.
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="Šifrovaná záloha do Gistu" />
          <div className="card-body">
            <div className="field">
              <label htmlFor="tok">GitHub token</label>
              <input
                id="tok"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="github_pat_…"
                autoComplete="off"
              />
              <span className="hint">
                Fine-grained PAT s jediným oprávněním <b>Gists → Read and write</b>. Uloží se dovnitř
                zašifrované sbírky, ne vedle ní.
              </span>
            </div>

            <div className="field">
              <label htmlFor="gid">Id Gistu</label>
              <input
                id="gid"
                value={gistId}
                onChange={(e) => setGistId(e.target.value)}
                placeholder="nech prázdné a vytvoří se nový"
                autoComplete="off"
              />
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              <button className="btn btn-primary" onClick={doPush} disabled={busy !== null}>
                {busy === "push" ? "Nahrávám…" : "Zálohovat teď"}
              </button>
              <button className="btn" onClick={doPull} disabled={busy !== null || !gistId}>
                {busy === "pull" ? "Stahuji…" : "Obnovit ze zálohy"}
              </button>
            </div>

            <div className="set-row">
              <div>
                <div className="sr-t">Automatická záloha</div>
                <div className="sr-d">
                  Po každé změně, odloženo o 30 sekund.
                  {collection.backup?.lastSyncedAt
                    ? ` Naposledy ${fmtDateMed(collection.backup.lastSyncedAt)}.`
                    : " Zatím nikdy."}
                </div>
              </div>
              <div className="sr-c">
                <button
                  className="toggle"
                  aria-pressed={collection.backup?.auto ?? false}
                  aria-label="Automatická záloha"
                  onClick={() =>
                    update((d) => ({ ...d, backup: { ...d.backup, auto: !(d.backup?.auto ?? false) } }))
                  }
                />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="Prahy radaru" />
          <div className="card-body">
            <Slider
              label="Low musí být pod trendem alespoň o"
              unit="%"
              min={5}
              max={40}
              value={radar.minSpreadPct}
              onChange={(v) => setRadar({ minSpreadPct: v })}
            />
            <Slider
              label="Propad za 30 dní alespoň"
              unit="%"
              min={3}
              max={30}
              value={radar.minDrop30Pct}
              onChange={(v) => setRadar({ minDrop30Pct: v })}
            />
            <Slider
              label="Ignorovat produkty levnější než"
              unit="€"
              min={0}
              max={100}
              value={radar.minPriceEur}
              onChange={(v) => setRadar({ minPriceEur: v })}
            />
            <Slider
              label="Minimální skóre v seznamu"
              unit=""
              min={0}
              max={90}
              step={5}
              value={radar.minScore}
              onChange={(v) => setRadar({ minScore: v })}
            />
            <div style={{ marginTop: 14 }}>
              <Note>
                Prahy filtrují seznam v prohlížeči. Samotné skóre počítá noční dávka pro všechny
                sledované produkty — signál <b>nové roční minimum</b> se hlásí vždy, bez ohledu na
                nastavení.
              </Note>
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="Odkud se berou ceny" />
          <div className="card-body">
            <div className="pipeline">
              <Step n={1} t="Cardmarket price guide" d={`Veřejný denní JSON v EUR. Naposledy ${market.meta.sourceCreatedAt}.`} />
              <Step n={2} t="Katalog produktů" d={`${market.meta.catalogCount.toLocaleString("cs-CZ")} produktů, aktualizace týdně.`} />
              <Step n={3} t="Sledovaná množina" d={`${market.meta.trackedCount.toLocaleString("cs-CZ")} produktů, dnes ${market.meta.pricedToday.toLocaleString("cs-CZ")} s cenou.`} />
              <Step n={4} t="Historie" d={`${market.meta.months.length} ${plural(market.meta.months.length, "měsíc", "měsíce", "měsíců")} dat, ${market.radar.daysOfHistory} ${plural(market.radar.daysOfHistory, "den", "dny", "dní")}.`} />
              <Step n={5} t="GitHub Actions" d="Denně v 6:15 stáhne, zapíše, přepočítá radar a nasadí web." />
            </div>
            <div style={{ marginTop: 16 }}>
              <Note tone={market.meta.date === new Date().toISOString().slice(0, 10) ? "info" : "warn"}>
                Poslední data jsou z {fmtDate(market.meta.date)}.{" "}
                {market.meta.date === new Date().toISOString().slice(0, 10)
                  ? "Dnešní dávka proběhla."
                  : "Dnešní dávka ještě neproběhla nebo selhala — mrkni na záložku Actions v repozitáři."}
              </Note>
            </div>
          </div>
        </Card>
      </div>

      <p style={{ marginTop: 20, fontSize: 12, color: "var(--ink-3)", maxWidth: "70ch" }}>
        <Icon path={icons.lock} size={12} width={2} /> Heslo se nikam neposílá a nikde neukládá. Když
        ho ztratíš, nedostaneš se ke sbírce ani ty — proto stojí za to si občas stáhnout export.
      </p>
    </>
  );
}

function Slider({
  label,
  unit,
  min,
  max,
  step = 1,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
}) {
  const id = label.replace(/\s/g, "-");
  return (
    <div className="slider-row">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output className="num">
        {value} {unit}
      </output>
    </div>
  );
}

function Step({ n, t, d }: { n: number; t: string; d: string }) {
  return (
    <div className="pipe-step">
      <div className="pipe-dot">{n}</div>
      <div>
        <div className="pipe-t">{t}</div>
        <div className="pipe-d">{d}</div>
      </div>
    </div>
  );
}
