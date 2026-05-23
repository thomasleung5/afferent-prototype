import type { ReactNode } from "react";

interface PanelProps {
  label: ReactNode;
  summary: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}

export function ImportReviewPanel({
  label, summary, actions, children,
}: PanelProps) {
  return (
    <div style={{
      background: "var(--paper)",
      border: "1px solid var(--rule)",
    }}>
      <div style={{
        padding: "10px 16px",
        display: "flex", alignItems: "baseline", gap: 12,
        borderBottom: children ? "1px solid var(--rule)" : "none",
        background: "var(--paper-2)",
      }}>
        <span className="mono" style={{
          fontSize: "var(--t-l9)", fontWeight: 700, letterSpacing: "0.14em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>
          {label}
        </span>
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
          {summary}
        </span>
        {actions && (
          <div style={{
            marginLeft: "auto",
            display: "flex", alignItems: "baseline", gap: 8,
          }}>
            {actions}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

interface RowProps {
  columns: string;
  isLast: boolean;
  children: ReactNode;
}

export function ImportReviewRow({ columns, isLast, children }: RowProps) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: columns,
      gap: 12, alignItems: "baseline",
      padding: "8px 16px",
      fontSize: "var(--t-l7)",
      borderBottom: isLast ? "none" : "1px solid var(--rule)",
    }}>
      {children}
    </div>
  );
}

interface ActionProps {
  children: ReactNode;
  onClick: () => void;
  align?: "left" | "right";
  tone?: "default" | "muted";
}

export function ImportReviewAction({
  children, onClick, align = "left", tone = "muted",
}: ActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        fontSize: "var(--t-l8)",
        color: tone === "default" ? "var(--ink-2)" : "var(--ink-3)",
        padding: "2px 8px",
        justifySelf: align === "right" ? "end" : "start",
      }}
    >
      {children}
    </button>
  );
}
