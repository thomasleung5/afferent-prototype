
import { useEffect, useRef, useState } from "react";

export type FeeState = "PENDING" | "REVIEWED" | "READY" | "ADOPTED" | "DEFERRED";

const LABEL: Record<FeeState, string> = {
  PENDING:  "Pending review",
  REVIEWED: "Staff reviewed",
  READY:    "Ready for council",
  ADOPTED:  "Adopted",
  DEFERRED: "Deferred",
};

const TONE: Record<FeeState, { fg: string; bd: string; dot: string }> = {
  ADOPTED:  { fg: "var(--pos)",  bd: "var(--pos)",         dot: "var(--pos)"   },
  READY:    { fg: "var(--ink)",  bd: "var(--ink-3)",       dot: "var(--ink)"   },
  REVIEWED: { fg: "var(--ink-2)",bd: "var(--rule-strong)", dot: "var(--ink-2)" },
  DEFERRED: { fg: "var(--ink-3)",bd: "var(--rule)",        dot: "var(--ink-3)" },
  PENDING:  { fg: "var(--ink-3)",bd: "var(--rule)",        dot: "var(--ink-4)" },
};

const TRANSITIONS: Record<FeeState, { to: FeeState; label: string }[]> = {
  PENDING:  [{ to: "REVIEWED", label: "Mark reviewed" }, { to: "DEFERRED", label: "Defer" }],
  REVIEWED: [{ to: "READY",    label: "Send to council" }, { to: "PENDING",  label: "Reopen" }, { to: "DEFERRED", label: "Defer" }],
  READY:    [{ to: "ADOPTED",  label: "Adopt" },           { to: "REVIEWED", label: "Withdraw" }],
  ADOPTED:  [{ to: "REVIEWED", label: "Reopen" }],
  DEFERRED: [{ to: "PENDING",  label: "Reopen" }],
};

interface Props {
  state: FeeState;
  onChange: (next: FeeState) => void;
}

/** Single understated lifecycle chip with a transition popover on click. */
export function StateChip({ state, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tone = TONE[state];
  const opts = TRANSITIONS[state];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "4px 9px",
          background: "var(--paper)",
          border: `1px solid ${tone.bd}`,
          color: tone.fg,
          fontSize: 11.5, fontFamily: "var(--ff-ui)", fontWeight: 500,
          cursor: "pointer",
          borderRadius: 0,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: tone.dot }}/>
        {LABEL[state]}
      </button>
      {open && opts.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 20,
          background: "var(--paper)",
          border: "1px solid var(--rule-strong)",
          boxShadow: "0 6px 18px rgba(15,23,42,0.08)",
          minWidth: 180,
        }}>
          {opts.map((o, i) => (
            <button
              key={o.to}
              onClick={(e) => { e.stopPropagation(); onChange(o.to); setOpen(false); }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--paper-2)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "8px 12px", background: "transparent", border: "none",
                fontSize: 12, fontFamily: "var(--ff-ui)", color: "var(--ink)",
                cursor: "pointer",
                borderBottom: i < opts.length - 1 ? "1px solid var(--rule)" : "none",
              }}
            >{o.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

interface ConfReasonProps {
  ok: boolean;
  text: string;
}

/** Single confidence-check line — green check or amber dash + reason. */
export function ConfReason({ ok, text }: ConfReasonProps) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 8,
      fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5,
    }}>
      <span style={{
        flexShrink: 0,
        width: 14, height: 14,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 700,
        background: ok ? "var(--pos-tint)" : "var(--warn-tint)",
        color: ok ? "var(--pos)" : "var(--warn)",
        border: `1px solid ${ok ? "var(--pos)" : "var(--warn)"}`,
        marginTop: 1,
      }}>{ok ? "✓" : "—"}</span>
      <span>{text}</span>
    </div>
  );
}
