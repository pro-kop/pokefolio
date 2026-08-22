import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "../auth/session";
import { Market } from "../market/load";
import { loadCollection, saveCollection } from "../store/vault";
import { pushBackup } from "../store/backup";
import type { Collection } from "../store/types";
import { setRate, type Currency } from "../format";

interface Ctx {
  session: Session;
  market: Market;
  collection: Collection;
  update: (fn: (draft: Collection) => Collection) => void;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  toast: (message: string, tone?: "ok" | "err") => void;
  historyReady: boolean;
  logout: () => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp mimo AppProvider");
  return ctx;
}

export function AppProvider({
  session,
  market,
  initial,
  onLogout,
  children,
}: {
  session: Session;
  market: Market;
  initial: Collection;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [collection, setCollection] = useState<Collection>(initial);
  const [historyReady, setHistoryReady] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; tone: "ok" | "err" } | null>(null);
  const backupTimer = useRef<number | null>(null);

  useEffect(() => {
    setRate(market.fx.czk);
  }, [market]);

  useEffect(() => {
    let alive = true;
    market.history().then(
      () => alive && setHistoryReady(true),
      () => alive && setHistoryReady(true),
    );
    return () => {
      alive = false;
    };
  }, [market]);

  const toast = useCallback((text: string, tone: "ok" | "err" = "ok") => {
    setToastMsg({ text, tone });
    window.setTimeout(() => setToastMsg(null), 3400);
  }, []);

  const update = useCallback(
    (fn: (draft: Collection) => Collection) => {
      setCollection((prev) => {
        const next = fn(structuredClone(prev));
        void saveCollection(session.account.id, session.key, next).catch(() =>
          toast("Sbírku se nepodařilo uložit do prohlížeče.", "err"),
        );

        // Záloha se odloží — ať se nenahrává při každém kliknutí.
        if (next.backup?.auto && next.backup.token) {
          if (backupTimer.current) window.clearTimeout(backupTimer.current);
          backupTimer.current = window.setTimeout(() => {
            pushBackup(next.backup!.token!, next.backup!.gistId, session.key, next)
              .then(({ gistId, at }) => {
                setCollection((cur) => {
                  const merged = { ...cur, backup: { ...cur.backup!, gistId, lastSyncedAt: at } };
                  void saveCollection(session.account.id, session.key, merged);
                  return merged;
                });
              })
              .catch((err: Error) => toast(`Záloha selhala: ${err.message}`, "err"));
          }, 30_000);
        }
        return next;
      });
    },
    [session, toast],
  );

  const setCurrency = useCallback(
    (c: Currency) => update((d) => ({ ...d, settings: { ...d.settings, currency: c } })),
    [update],
  );

  const logout = useCallback(() => {
    if (backupTimer.current) window.clearTimeout(backupTimer.current);
    onLogout();
  }, [onLogout]);

  const value = useMemo<Ctx>(
    () => ({
      session,
      market,
      collection,
      update,
      currency: market.fx.czk ? collection.settings.currency : "EUR",
      setCurrency,
      toast,
      historyReady,
      logout,
    }),
    [session, market, collection, update, setCurrency, toast, historyReady, logout],
  );

  return (
    <AppCtx.Provider value={value}>
      {children}
      {toastMsg && <div className={`toast${toastMsg.tone === "err" ? " err" : ""}`}>{toastMsg.text}</div>}
    </AppCtx.Provider>
  );
}

export async function bootstrap(session: Session): Promise<{ market: Market; collection: Collection }> {
  // Chyba dešifrování se schválně nepolyká: raději hlášku "nejde otevřít"
  // než tiše prázdnou sbírku, kterou by první uložení přepsalo.
  const [market, collection] = await Promise.all([
    Market.load(),
    loadCollection(session.account.id, session.key),
  ]);
  return { market, collection };
}
