import type { ReactNode } from "react";
import { dir, pct } from "../format";
import type { RangeKey } from "../calc/portfolio";

export function Icon({ path, size = 16, width = 1.8 }: { path: ReactNode; size?: number; width?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

export const icons = {
  dashboard: <path d="M3 13h6V3H3zM13 21h8V11h-8zM13 7h8V3h-8zM3 21h6v-4H3z" />,
  chart: (
    <>
      <path d="M3 17l5.5-6 4 4L21 6" />
      <path d="M15 6h6v6" />
    </>
  ),
  radar: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </>
  ),
  catalog: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M14 3v6h6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.6-3.6" />
    </>
  ),
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowLeft: <path d="M19 12H5M11 18l-6-6 6-6" />,
  external: (
    <>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </>
  ),
  warn: <path d="M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  close: <path d="M18 6L6 18M6 6l12 12" />,
  trash: <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />,
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>
  ),
  up: <path d="M12 19V5M5 12l7-7 7 7" />,
  down: <path d="M12 5v14M19 12l-7 7-7-7" />,
};

export function Card({ children, className = "", ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card-head">
      <h2>{title}</h2>
      {children ? (
        <>
          <div className="spacer" />
          {children}
        </>
      ) : null}
    </div>
  );
}

export function Delta({ value, extra }: { value: number; extra?: string }) {
  const d = dir(value);
  return (
    <span className={`delta ${d}`}>
      {d === "up" ? <Icon path={icons.up} size={10} width={3} /> : null}
      {d === "down" ? <Icon path={icons.down} size={10} width={3} /> : null}
      {pct(value)}
      {extra ? (
        <>
          {" "}
          <span style={{ opacity: 0.6 }}>·</span> {extra}
        </>
      ) : null}
    </span>
  );
}

export function Ranges({
  value,
  onChange,
  keys = ["7D", "1M", "YTD", "1R", "MAX"],
}: {
  value: RangeKey;
  onChange: (r: RangeKey) => void;
  keys?: RangeKey[];
}) {
  return (
    <div className="ranges">
      {keys.map((k) => (
        <button key={k} aria-pressed={k === value} onClick={() => onChange(k)}>
          {k}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="chips">
      {options.map(([k, label]) => (
        <button key={k} aria-pressed={k === value} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Tag({ kind }: { kind: 0 | 1 }) {
  return <span className={`tag ${kind === 1 ? "sealed" : "single"}`}>{kind === 1 ? "Sealed" : "Single"}</span>;
}

export function Thumb({ kind, big = false }: { kind: 0 | 1; big?: boolean }) {
  if (big) {
    return <div className="detail-thumb">{kind === 1 ? "SEALED" : "CARD"}</div>;
  }
  return <div className={`thumb ${kind === 1 ? "sealed" : ""}`}>{kind === 1 ? "BOX" : "CARD"}</div>;
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  wide = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  wide?: boolean;
}) {
  return (
    <div className="search" style={wide ? { minWidth: 340 } : undefined}>
      <span style={{ color: "var(--ink-3)", display: "flex" }}>
        <Icon path={icons.search} size={14} width={2} />
      </span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </div>
  );
}

export function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  return (
    <div className={tone === "warn" ? "warmup" : "note"}>
      <Icon path={tone === "warn" ? icons.warn : icons.info} size={15} width={2} />
      <span>{children}</span>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      className="backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <div style={{ marginLeft: "auto" }}>
            <button className="icon-btn" onClick={onClose} aria-label="Zavřít">
              <Icon path={icons.close} size={17} width={2} />
            </button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}
