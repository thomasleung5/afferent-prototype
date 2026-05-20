import { fmt } from "@/lib/format";

interface Props {
  direct: number;
  operating: number;
  cap: number;
}

interface Row {
  label: string;
  value: number;
  color: string;
}

/** Horizontal stacked bar showing where the cost comes from: direct labor / operating / CAP. */
export function DriverBreakdown({ direct, operating, cap }: Props) {
  const total = direct + operating + cap || 1;
  const rows: Row[] = [
    { label: "Direct labor",              value: direct,    color: "var(--ink)" },
    { label: "Operating",                 value: operating, color: "var(--ink-2)" },
    { label: "Overhead cost allocation",  value: cap,       color: "var(--ink-3)" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{
        display: "flex", height: 18,
        border: "1px solid var(--rule)", overflow: "hidden",
      }}>
        {rows.map((r) => (
          <div key={r.label} style={{
            width: `${(r.value / total) * 100}%`,
            background: r.color,
          }}/>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r) => (
          <div key={r.label} style={{
            display: "grid", gridTemplateColumns: "12px 1fr auto auto",
            gap: 10, alignItems: "center",
            fontSize: 12.5,
          }}>
            <span style={{ width: 12, height: 12, background: r.color, display: "inline-block" }}/>
            <span style={{ color: "var(--ink-2)" }}>{r.label}</span>
            <span className="num" style={{ color: "var(--ink)" }}>{fmt.dollarsK(r.value)}</span>
            <span className="num" style={{ color: "var(--ink-3)", minWidth: 38, textAlign: "right" }}>
              {Math.round((r.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
