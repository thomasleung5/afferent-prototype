import type { ReactNode } from "react";

interface GridProps {
  /** Column count for the grid (`repeat(columns, 1fr)`). */
  columns: number;
  /** Top margin between the grid and whatever precedes it. */
  marginTop?: number | string;
  children: ReactNode;
}

/** Bordered grid frame used by the print-preview KPI blocks in every
 *  export PDF (Fee Study executive summary, CAP plan-at-a-glance, etc.).
 *  Owns the outer border so each `<ExportTile>` only has to draw its own
 *  cell-divider lines. */
export function ExportTileGrid({ columns, marginTop = 22, children }: GridProps) {
  return (
    <div style={{
      marginTop,
      display: "grid",
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap: 0,
      border: "1px solid var(--rule)",
    }}>
      {children}
    </div>
  );
}

interface TileProps {
  label: string;
  value: ReactNode;
  /** Optional secondary line below the value (e.g. a dollar figure under
   *  a named entity). Renders in mono numerals for tabular alignment. */
  sub?: string;
  /** Value color tone. Default = ink. */
  tone?: "pos" | "neg" | "warn";
  /** Visual density. "default" — 20px mono numerals, for headline KPIs.
   *  "compact" — 15px non-mono, fits long entity names + an optional
   *  `sub` subtitle. */
  size?: "default" | "compact";
  /** Last cell in its row — drops the right divider so it sits flush with
   *  the grid's outer border. */
  last?: boolean;
}

/** Single cell inside an `<ExportTileGrid>`. Renders the eyebrow label
 *  followed by the value (and optional subtitle) in the canonical export
 *  KPI chrome. */
export function ExportTile({
  label, value, sub, tone, size = "default", last,
}: TileProps) {
  const color =
    tone === "pos" ? "var(--pos)" :
    tone === "neg" ? "var(--neg)" :
    tone === "warn" ? "var(--warn)" :
    "var(--ink)";
  const compact = size === "compact";
  return (
    <div style={{
      padding: "12px 14px",
      borderRight: last ? "none" : "1px solid var(--rule)",
      borderBottom: "1px solid var(--rule)",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div className="mono" style={{
        fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>{label}</div>
      <div
        className={compact ? undefined : "num"}
        style={{
          fontSize: compact ? 15 : 20,
          fontWeight: 600,
          color,
          letterSpacing: "-0.01em",
          lineHeight: compact ? 1.2 : undefined,
        }}
      >
        {value}
      </div>
      {sub && (
        <div className="num" style={{
          fontSize: 11, color: "var(--ink-3)", marginTop: 2,
          fontFamily: "var(--ff-mono)",
        }}>{sub}</div>
      )}
    </div>
  );
}
