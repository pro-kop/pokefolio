import { useMemo, useRef, useState } from "react";
import { fmtDateMed, fmtDateShort } from "../format";

export interface ChartSeries {
  label: string;
  values: (number | null)[];
  color: string;
  fill?: boolean;
  dash?: boolean;
}

export interface Marker {
  index: number;
  value: number;
  label: string;
}

interface Props {
  dates: string[];
  series: ChartSeries[];
  from?: number;
  height?: number;
  /** Vodorovná přerušovaná čára — třeba pořizovací cena. */
  baseline?: (number | null)[] | null;
  baselineLabel?: string;
  markers?: Marker[];
  format: (v: number) => string;
}

const W = 1000;
const PL = 52;
const PR = 16;
const PT = 12;
const PB = 26;

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min || 1;
  const mag = Math.pow(10, Math.floor(Math.log10(span / count)));
  const norm = span / count / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(v);
  return out;
}

export function AreaChart({
  dates,
  series,
  from = 0,
  height = 224,
  baseline = null,
  baselineLabel = "Pořizovací cena",
  markers = [],
  format,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    const n = Math.max(dates.length - from, 2);
    let min = Infinity;
    let max = -Infinity;
    const consider = (v: number | null | undefined) => {
      if (v === null || v === undefined) return;
      if (v < min) min = v;
      if (v > max) max = v;
    };
    for (const s of series) for (let i = from; i < dates.length; i++) consider(s.values[i]);
    if (baseline) for (let i = from; i < dates.length; i++) consider(baseline[i]);
    for (const m of markers) if (m.index >= from) consider(m.value);
    if (!Number.isFinite(min)) {
      min = 0;
      max = 1;
    }
    const pad = (max - min) * 0.14 || Math.max(max * 0.08, 1);
    min = Math.max(0, min - pad);
    max = max + pad;

    const x = (i: number) => PL + ((i - from) / (n - 1)) * (W - PL - PR);
    const y = (v: number) => PT + (1 - (v - min) / (max - min || 1)) * (height - PT - PB);
    return { x, y, min, max, n };
  }, [dates, series, from, height, baseline, markers]);

  const path = (values: (number | null)[]): string => {
    let d = "";
    let pen = false;
    for (let i = from; i < dates.length; i++) {
      const v = values[i];
      if (v === null || v === undefined) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${geo.x(i).toFixed(2)} ${geo.y(v).toFixed(2)}`;
      pen = true;
    }
    return d;
  };

  const areaPath = (values: (number | null)[]): string => {
    const line = path(values);
    if (!line) return "";
    return `${line} L${geo.x(dates.length - 1).toFixed(2)} ${geo.y(geo.min).toFixed(2)} L${geo
      .x(from)
      .toFixed(2)} ${geo.y(geo.min).toFixed(2)} Z`;
  };

  const ticks = niceTicks(geo.min, geo.max, 4);
  const xTicks = [from, from + Math.floor(geo.n / 3), from + Math.floor((2 * geo.n) / 3), dates.length - 1];

  function onMove(ev: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rel = ((ev.clientX - rect.left) / rect.width) * W;
    const i = Math.round(from + ((rel - PL) / (W - PL - PR)) * (geo.n - 1));
    setHover(Math.max(from, Math.min(dates.length - 1, i)));
  }

  const tipLeft = (() => {
    if (hover === null || !hostRef.current) return 0;
    const width = hostRef.current.clientWidth;
    const px = (geo.x(hover) / W) * width;
    return Math.min(Math.max(px - 76, 0), Math.max(width - 158, 0));
  })();

  const lastOf = (values: (number | null)[]) => {
    for (let i = dates.length - 1; i >= from; i--) {
      const v = values[i];
      if (v !== null && v !== undefined) return { i, v };
    }
    return null;
  };

  return (
    <div className="chart-wrap" ref={hostRef}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Graf vývoje ceny"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          {series.map((s, k) =>
            s.fill ? (
              <linearGradient key={k} id={`fill-${k}-${s.color.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.34" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ) : null,
          )}
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={PL} y1={geo.y(t)} x2={W - PR} y2={geo.y(t)} vectorEffect="non-scaling-stroke" />
            <text className="axis-label" x={PL - 8} y={geo.y(t) + 3.5} textAnchor="end">
              {format(t)}
            </text>
          </g>
        ))}

        {baseline && (
          <path className="cost-line" d={path(baseline)} vectorEffect="non-scaling-stroke" />
        )}

        {series.map((s, k) => (
          <g key={k}>
            {s.fill && (
              <path d={areaPath(s.values)} fill={`url(#fill-${k}-${s.color.replace(/[^a-z0-9]/gi, "")})`} />
            )}
            <path
              d={path(s.values)}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dash ? "4 4" : undefined}
              vectorEffect="non-scaling-stroke"
            />
            {(() => {
              const last = lastOf(s.values);
              return last ? (
                <circle cx={geo.x(last.i)} cy={geo.y(last.v)} r="4" fill={s.color} stroke="#0a0b1a" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              ) : null;
            })()}
          </g>
        ))}

        {markers.map((m, k) =>
          m.index >= from ? (
            <g key={k}>
              <line x1={geo.x(m.index)} y1={PT} x2={geo.x(m.index)} y2={height - PB} stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="2 4" opacity="0.75" vectorEffect="non-scaling-stroke" />
              <circle cx={geo.x(m.index)} cy={geo.y(m.value)} r="4.5" fill="#0a0b1a" stroke="var(--brand-3)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </g>
          ) : null,
        )}

        {xTicks.map((i, k) => (
          <text
            key={k}
            className="axis-label"
            x={geo.x(i)}
            y={height - 7}
            textAnchor={k === 0 ? "start" : k === xTicks.length - 1 ? "end" : "middle"}
          >
            {fmtDateShort(dates[i] ?? "")}
          </text>
        ))}

        {hover !== null && (
          <g>
            <line className="crosshair" x1={geo.x(hover)} y1={PT} x2={geo.x(hover)} y2={height - PB} vectorEffect="non-scaling-stroke" />
            {series.map((s, k) => {
              const v = s.values[hover];
              return v === null || v === undefined ? null : (
                <circle key={k} cx={geo.x(hover)} cy={geo.y(v)} r="4.5" fill={s.color} stroke="#0a0b1a" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              );
            })}
          </g>
        )}
      </svg>

      <div className={`tooltip${hover !== null ? " is-on" : ""}`} style={{ left: tipLeft, top: 4 }} role="status">
        {hover !== null && (
          <>
            <div className="t-date">{fmtDateMed(dates[hover] ?? "")}</div>
            {series.map((s, k) => {
              const v = s.values[hover];
              return (
                <div className="t-row" key={k}>
                  <span className="sw" style={{ background: s.color }} />
                  {s.label}
                  <span className="t-val">{v === null || v === undefined ? "—" : format(v)}</span>
                </div>
              );
            })}
            {baseline && baseline[hover] !== null && baseline[hover] !== undefined && (
              <div className="t-row">
                <span className="sw" style={{ background: "var(--ink-3)" }} />
                {baselineLabel}
                <span className="t-val">{format(baseline[hover] as number)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
