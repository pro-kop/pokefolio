import { useCallback, useEffect, useMemo, useState } from "react";
import { AppProvider, bootstrap, useApp } from "./app/state";
import { forgetTab, restoreFromTab, type Session } from "./auth/session";
import { Login } from "./views/Login";
import { Dashboard } from "./views/Dashboard";
import { PortfolioView } from "./views/Portfolio";
import { RadarView } from "./views/Radar";
import { CatalogView } from "./views/Catalog";
import { DetailView } from "./views/Detail";
import { SettingsView } from "./views/Settings";
import { Delta, Icon, icons } from "./components/ui";
import { money } from "./format";
import { changeOver, portfolioSeries, totals, valueHolding } from "./calc/portfolio";
import type { Market } from "./market/load";
import type { Collection } from "./store/types";

type ViewId = "prehled" | "portfolio" | "radar" | "katalog" | "nastaveni";

const NAV: { id: ViewId; label: string; icon: React.ReactNode }[] = [
  { id: "prehled", label: "Přehled", icon: icons.dashboard },
  { id: "portfolio", label: "Portfolio", icon: icons.chart },
  { id: "radar", label: "Radar", icon: icons.radar },
  { id: "katalog", label: "Katalog", icon: icons.catalog },
  { id: "nastaveni", label: "Nastavení", icon: icons.settings },
];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [boot, setBoot] = useState<{ market: Market; collection: Collection } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    restoreFromTab().then((s) => {
      if (s) setSession(s);
      setRestoring(false);
    });
  }, []);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    setError(null);
    bootstrap(session).then(
      (b) => alive && setBoot(b),
      (err: Error) => alive && setError(err.message),
    );
    return () => {
      alive = false;
    };
  }, [session]);

  const logout = useCallback(() => {
    forgetTab();
    setBoot(null);
    setSession(null);
  }, []);

  if (restoring) {
    return (
      <div className="login-shell">
        <div className="spinner" />
      </div>
    );
  }

  if (!session) return <Login onSuccess={setSession} />;

  if (error) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-error" role="alert">
            <Icon path={icons.warn} size={15} width={2} />
            <span>{error}</span>
          </div>
          <button className="login-btn" onClick={logout}>
            Zpět na přihlášení
          </button>
        </div>
      </div>
    );
  }

  if (!boot) {
    return (
      <div className="login-shell">
        <div style={{ textAlign: "center" }}>
          <div className="spinner" />
          <p style={{ marginTop: 16, color: "var(--ink-3)", fontSize: 13 }}>Načítám tržní data…</p>
        </div>
      </div>
    );
  }

  return (
    <AppProvider session={session} market={boot.market} initial={boot.collection} onLogout={logout}>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const { market, collection, currency, setCurrency, session, logout, historyReady } = useApp();
  const [view, setView] = useState<ViewId>("prehled");
  const [detailId, setDetailId] = useState<number | null>(null);

  const openDetail = useCallback((id: number) => {
    setDetailId(id);
    window.scrollTo({ top: 0 });
  }, []);

  const goto = useCallback((id: ViewId) => {
    setDetailId(null);
    setView(id);
    window.scrollTo({ top: 0 });
  }, []);

  const valued = useMemo(
    () => collection.holdings.map((h) => valueHolding(h, market)),
    [collection.holdings, market],
  );
  const sum = useMemo(() => totals(valued), [valued]);

  const series = useMemo(
    () => (historyReady ? portfolioSeries(collection.holdings, market) : null),
    [historyReady, collection.holdings, market],
  );
  const month = series ? changeOver(series.dates, series.value, "1M") : { pct: 0, abs: 0 };

  const detail = detailId !== null;
  const crumbLabel = detail ? market.name(detailId) : NAV.find((n) => n.id === view)!.label;

  return (
    <div className="app">
      <aside className="rail">
        <div className="brand">
          <div className="brand-mark">
            <span style={{ color: "#fff", display: "flex" }}>
              <Icon path={icons.chart} size={18} width={2.1} />
            </span>
          </div>
          <div>
            <div className="brand-name">Pokéfolio</div>
            <div className="brand-sub">Cardmarket · EUR</div>
          </div>
        </div>

        <nav className="nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className="nav-item"
              aria-current={!detail && view === n.id ? "page" : undefined}
              onClick={() => goto(n.id)}
            >
              <Icon path={n.icon} />
              {n.label}
              {n.id === "portfolio" && collection.holdings.length > 0 ? (
                <span className="nav-count">{collection.holdings.length}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="rail-foot">
          <div className="source-chip">
            <div className="eyebrow" style={{ marginBottom: 5 }}>
              <span className="dot" />
              Data aktuální
            </div>
            <div className="num" style={{ fontSize: 12, color: "var(--ink-2)" }}>
              {market.meta.date}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>
              {market.meta.trackedCount.toLocaleString("cs-CZ")} sledovaných produktů
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="crumb">
            Pokéfolio <span style={{ opacity: 0.4 }}>/</span> <b>{crumbLabel}</b>
          </div>
          <div className="topbar-right">
            <div className="ticker">
              <span className="label">Portfolio</span>
              <span className="num" style={{ fontWeight: 600 }}>
                {money(sum.value, currency, 0)}
              </span>
              {series && <Delta value={month.pct} />}
              <span className="label">30 d</span>
            </div>
            {market.fx.czk && (
              <button className="btn" onClick={() => setCurrency(currency === "EUR" ? "CZK" : "EUR")}>
                {currency}
              </button>
            )}
            <button className="btn" onClick={logout} title={`Přihlášen jako ${session.account.username}`}>
              <Icon path={icons.logout} size={14} width={2} />
              {session.account.username}
            </button>
          </div>
        </header>

        <section className="view is-active">
          {market.meta.trackedCount === 0 && (
            <div className="warmup">
              <Icon path={icons.warn} size={15} width={2} />
              <span>
                Denní dávka ještě neproběhla, takže tu nejsou žádné ceny. V repozitáři spusť
                v záložce <b>Actions</b> nejdřív <b>Týdenní katalog</b> a pak <b>Denní ceny</b> —
                do dvou minut je tu první den historie.
              </span>
            </div>
          )}
          {detail ? (
            <DetailView id={detailId} onBack={() => setDetailId(null)} />
          ) : view === "prehled" ? (
            <Dashboard valued={valued} totals={sum} series={series} onOpenDetail={openDetail} onGoRadar={() => goto("radar")} />
          ) : view === "portfolio" ? (
            <PortfolioView valued={valued} totals={sum} onOpenDetail={openDetail} />
          ) : view === "radar" ? (
            <RadarView onOpenDetail={openDetail} />
          ) : view === "katalog" ? (
            <CatalogView onOpenDetail={openDetail} />
          ) : (
            <SettingsView />
          )}
        </section>
      </div>
    </div>
  );
}
