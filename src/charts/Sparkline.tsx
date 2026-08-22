import { useId } from "react";

interface Props {
  values: (number | null)[];
  color: string;
  width?: number;
  height?: number;
  fluid?: boolean;
}

export function Sparkline({ values, color, width = 84, height = 26, fluid = false }: Props) {
  const id = useId().replace(/[^a-z0-9]/gi, "");
  const clean = values.filter((v): v is number => v !== null && v !== undefined);
  if (clean.length < 2) {
    return <span style={{ color: "var(--ink-3)", fontSize: 11 }}>—</span>;
  }

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const pts = clean.map<[number, number]>((v, i) => [
    (i / (clean.length - 1)) * width,
    height - 2 - ((v - min) / span) * (height - 4),
  ]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ");
  const last = pts[pts.length - 1];

  return (
    <svg
      width={fluid ? "100%" : width}
      height={fluid ? undefined : height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={fluid ? { width: "100%", height: "auto", overflow: "visible" } : { overflow: "visible" }}
    >
      <defs>
        <linearGradient id={`sp${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${width} ${height} L0 ${height} Z`} fill={`url(#sp${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={color} />
    </svg>
  );
}
