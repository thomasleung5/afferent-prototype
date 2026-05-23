import type { ReactNode } from "react";
import { Icon } from "@/components/ui";

/* ──────────────────────────────────────────────────────────────────────────
 * Unified explainability shell for every CAP "cell trace" panel.
 *
 * The three CAP screens (Allocation Bases, Pool Allocations, Allocation
 * Matrix) all open a drilldown when the user clicks a cell. Every trace
 * composes the same three sections in order:
 *
 *   1. Summary       — what is being allocated, where it goes, the result
 *   2. Logic         — the actual formula or vertical flow that produced it
 *   3. Distribution  — visual share / ranked context against peers
 *
 * Visual language: lots of whitespace, big numbers for outcomes, monospace
 * only for math, accent color reserved for the final/answer value.
 * ──────────────────────────────────────────────────────────────────────── */

// ============================================================================
// Outer shell
// ============================================================================

interface PanelProps {
  /** Tiny uppercase tag — e.g. "Allocation trace", "Pool trace". */
  eyebrow: string;
  /** Left side of the title — usually the source of the allocation. */
  from: string;
  /** Right side of the title — usually the destination. Omit for one-sided. */
  to?: string;
  onClose: () => void;
  children: ReactNode;
}

export function TracePanel({ eyebrow, from, to, onClose, children }: PanelProps) {
  return (
    <div role="region" aria-label={`${eyebrow}: ${from}${to ? ` to ${to}` : ""}`} style={{
      background: "var(--paper)",
      border: "1px solid var(--accent)",
      boxShadow: "0 1px 0 rgba(0,0,0,0.02)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 22px",
        borderBottom: "1px solid var(--rule)",
        background: "var(--accent-tint)",
      }}>
        <div className="mono" style={{
          fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.12em",
          color: "var(--accent)", textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}>{eyebrow}</div>
        <div style={{
          fontSize: 14, fontWeight: 600, color: "var(--ink)",
          minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {from}
          {to && (
            <>
              <span style={{ color: "var(--ink-3)", margin: "0 10px", fontWeight: 400 }}>→</span>
              {to}
            </>
          )}
        </div>
        <button onClick={onClose} type="button" style={{
          marginLeft: "auto", color: "var(--ink-3)",
          background: "transparent", border: "none", cursor: "pointer",
          padding: 4,
        }} aria-label="Close trace">
          <Icon name="close" size={14}/>
        </button>
      </div>
      <div>{children}</div>
    </div>
  );
}

// ============================================================================
// Sections
// ============================================================================

interface SectionProps {
  title?: string;
  children: ReactNode;
}

export function TraceSection({ title, children }: SectionProps) {
  return (
    <section style={{
      padding: "22px 26px",
      borderTop: "1px solid var(--rule)",
    }}>
      {title && (
        <div className="mono" style={{
          fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.12em",
          color: "var(--ink-3)", textTransform: "uppercase",
          marginBottom: 16,
        }}>{title}</div>
      )}
      {children}
    </section>
  );
}

// ============================================================================
// Summary — labeled stat blocks
// ============================================================================

export function SummaryStrip({ children, cols = 4 }: { children: ReactNode; cols?: number }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gap: "20px 28px",
      alignItems: "start",
    }}>
      {children}
    </div>
  );
}

interface StatProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** Promote this stat to the headline outcome — same size and weight as
   *  surrounding stats, accent color only. */
  emphasis?: boolean;
}

export function TraceStat({ label, value, sub, emphasis }: StatProps) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="mono" style={{
        fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.12em",
        color: "var(--ink-3)", textTransform: "uppercase",
        marginBottom: 8,
      }}>{label}</div>
      <div className="num" style={{
        fontSize: 14,
        fontWeight: 500,
        color: emphasis ? "var(--accent)" : "var(--ink)",
        lineHeight: 1.3,
        wordBreak: "break-word",
      }}>{value}</div>
      {sub && (
        <div style={{
          fontSize: 12, color: "var(--ink-3)",
          marginTop: 6, lineHeight: 1.4,
        }}>{sub}</div>
      )}
    </div>
  );
}

// ============================================================================
// Logic — formula chip and vertical flow
// ============================================================================

export function BigFormula({ children }: { children: ReactNode }) {
  return (
    <div className="mono" style={{
      fontSize: "var(--fs-ui)",
      color: "var(--ink)",
      lineHeight: 1.55,
      padding: "12px 16px",
      background: "var(--paper-2)",
      borderLeft: "3px solid var(--accent)",
    }}>{children}</div>
  );
}

