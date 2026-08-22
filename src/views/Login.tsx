import { useState, type FormEvent } from "react";
import { login, rememberInTab, LoginError, type Session } from "../auth/session";
import { Icon, icons } from "../components/ui";

export function Login({ onSuccess }: { onSuccess: (session: Session) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const session = await login(username, password);
      if (remember) await rememberInTab(session);
      onSuccess(session);
    } catch (err) {
      setError(
        err instanceof LoginError
          ? err.message
          : `Přihlášení se nepodařilo dokončit. ${(err as Error).message}`,
      );
      setPassword("");
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <div className="brand-mark">
            <span style={{ color: "#fff", display: "flex" }}>
              <Icon path={icons.chart} size={20} width={2.1} />
            </span>
          </div>
          <div>
            <div className="n">Pokéfolio</div>
            <div className="s">Cardmarket · EUR</div>
          </div>
        </div>

        {error && (
          <div className="login-error" role="alert">
            <Icon path={icons.warn} size={15} width={2} />
            <span>{error}</span>
          </div>
        )}

        <div className="field">
          <label htmlFor="u">Uživatelské jméno</label>
          <input
            id="u"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            disabled={busy}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="p">Heslo</label>
          <input
            id="p"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={busy}
            required
          />
        </div>

        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Zůstat přihlášen v téhle záložce
        </label>

        <button className="login-btn" type="submit" disabled={busy}>
          {busy ? "Odemykám sbírku…" : "Přihlásit se"}
        </button>

        <p className="login-note">
          Heslo tady nic neodemyká na serveru — heslo <strong>je</strong> šifrovací klíč ke sbírce.
          Bez něj jsou uložená data nečitelná i pro toho, kdo se k nim dostane. Když ho ztratíš,
          ztratíš i sbírku, takže si ho drž ve správci hesel a občas si udělej export.
        </p>
      </form>
    </div>
  );
}
