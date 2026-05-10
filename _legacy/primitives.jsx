// Shared UI primitives for Afferent

const { useState, useEffect, useRef, useMemo } = React;

// --- Formatting helpers -----------------------------------------------------
const fmt = {
  dollars: (n) => n == null ? "—" : `$${Math.round(n).toLocaleString()}`,
  dollarsK: (n) => {
    if (n == null) return "—";
    const a = Math.abs(n);
    if (a >= 1_000_000) return `$${(n/1_000_000).toFixed(2)}M`;
    if (a >= 1_000)     return `$${(n/1_000).toFixed(0)}K`;
    return `$${Math.round(n).toLocaleString()}`;
  },
  pct: (n, d=0) => n == null ? "—" : `${n.toFixed(d)}%`,
  int: (n) => n == null ? "—" : Math.round(n).toLocaleString(),
};

// --- Signal classification --------------------------------------------------
// Under 60% = neg, 60–90% = warn, 90%+ = pos. Return tokens + labels.
function signalFor(recoveryPct) {
  if (recoveryPct >= 90) return { key:"pos",  label:"On target",      color:"var(--pos)",  tint:"var(--pos-tint)" };
  if (recoveryPct >= 60) return { key:"warn", label:"Partial",         color:"var(--warn)", tint:"var(--warn-tint)" };
  return                        { key:"neg",  label:"Under-recovery",  color:"var(--neg)",  tint:"var(--neg-tint)" };
}

// --- Recovery meter ---------------------------------------------------------
// Horizontal bar with a dotted target marker at 100%. Fills to recovery%.
function RecoveryMeter({ pct, target = 100, width = 140, compact = false }) {
  const sig = signalFor(pct);
  const fill = Math.max(0, Math.min(pct, 130)); // allow 130% display
  const h = compact ? 6 : 8;
  return (
    <div style={{ display:"inline-flex", alignItems:"center", gap:8 }}>
      <div style={{
        position:"relative",
        width, height: h,
        background:"var(--paper-3)",
        borderRadius: 0,
        overflow:"hidden",
        boxShadow:"inset 0 0 0 1px var(--rule)",
      }}>
        {/* target marker */}
        <div style={{
          position:"absolute", left:`${(target/130)*100}%`, top:-2, bottom:-2, width:1,
          background:"var(--ink-3)",
        }}/>
        {/* fill */}
        <div style={{
          position:"absolute", left:0, top:0, bottom:0,
          width:`${(fill/130)*100}%`,
          background: sig.color,
        }}/>
      </div>
      <span className="num" style={{
        minWidth: 44, textAlign:"right",
        color: sig.color, fontWeight: 600, fontSize: compact ? 12 : 13,
      }}>{Math.round(pct)}%</span>
    </div>
  );
}

// --- Dept chip --------------------------------------------------------------
function DeptChip({ code }) {
  return (
    <span className="mono" style={{
      display:"inline-block",
      fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em",
      color:"var(--ink-2)",
      padding: "2px 6px",
      background:"var(--paper-2)",
      border:"1px solid var(--rule)",
    }}>{code}</span>
  );
}

// --- Primary button ---------------------------------------------------------
function Btn({ children, kind = "ghost", onClick, style, disabled }) {
  const base = {
    display:"inline-flex", alignItems:"center", gap:6,
    height: 30, padding: "0 12px",
    fontSize: 12.5, fontWeight: 500,
    border:"1px solid var(--rule-strong)",
    background:"var(--paper)",
    color:"var(--ink)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    whiteSpace: "nowrap",
    transition: "background 120ms, border-color 120ms",
  };
  const styles = {
    ghost: base,
    primary: { ...base, background:"var(--navy)", color:"white", borderColor:"var(--navy)" },
    subtle: { ...base, background:"transparent", borderColor:"transparent", color:"var(--ink-2)" },
  };
  return <button onClick={onClick} disabled={disabled} style={{...styles[kind], ...style}}>{children}</button>;
}

// --- KPI stat block ---------------------------------------------------------
function Stat({ label, value, sub, accent, size = "md" }) {
  const sizes = {
    sm: { value: 22, label: 10.5 },
    md: { value: 28, label: 11 },
    lg: { value: 56, label: 11 },
    xl: { value: 88, label: 11 },
  };
  const s = sizes[size];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap: 6 }}>
      <div className="mono" style={{
        fontSize: s.label, fontWeight: 500, letterSpacing: "0.08em",
        color:"var(--ink-3)", textTransform:"uppercase",
      }}>{label}</div>
      <div className="display num" style={{
        fontSize: s.value, fontWeight: 600, lineHeight: 1,
        color: accent || "var(--ink)",
        letterSpacing: "-0.02em",
      }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color:"var(--ink-3)" }}>{sub}</div>}
    </div>
  );
}

// --- Section label ----------------------------------------------------------
function SectionLabel({ children, right }) {
  return (
    <div style={{
      display:"flex", justifyContent:"space-between", alignItems:"baseline",
      padding:"0 0 8px 0",
      borderBottom:"1px solid var(--rule)",
      marginBottom: 12,
    }}>
      <div className="mono" style={{
        fontSize: 10.5, fontWeight: 600, letterSpacing: "0.1em",
        color:"var(--ink-2)", textTransform:"uppercase",
      }}>{children}</div>
      {right && <div style={{ fontSize: 11.5, color:"var(--ink-3)" }}>{right}</div>}
    </div>
  );
}

// --- Icons (minimal stroke, 16px) -----------------------------------------
function Icon({ name, size = 16, color = "currentColor" }) {
  const s = size; const sw = 1.5;
  const props = { width:s, height:s, viewBox:"0 0 16 16", fill:"none", stroke:color, strokeWidth:sw, strokeLinecap:"round", strokeLinejoin:"round" };
  switch (name) {
    case "arrow-right": return <svg {...props}><path d="M3 8h10M9 4l4 4-4 4"/></svg>;
    case "arrow-left":  return <svg {...props}><path d="M13 8H3M7 4 3 8l4 4"/></svg>;
    case "chevron-right":return <svg {...props}><path d="M6 3l5 5-5 5"/></svg>;
    case "chevron-down":return <svg {...props}><path d="M3 6l5 5 5-5"/></svg>;
    case "download":    return <svg {...props}><path d="M8 2v9M4 8l4 3 4-3M3 14h10"/></svg>;
    case "search":      return <svg {...props}><circle cx="7" cy="7" r="4.5"/><path d="M13 13l-2.8-2.8"/></svg>;
    case "filter":      return <svg {...props}><path d="M2 3h12l-4.5 5.5V13L6.5 14.5v-6Z"/></svg>;
    case "dot":         return <svg {...props}><circle cx="8" cy="8" r="2" fill={color}/></svg>;
    case "share":       return <svg {...props}><path d="M3 8.5V13h10V8.5M8 2v8M5 5l3-3 3 3"/></svg>;
    case "sort":        return <svg {...props}><path d="M4 3v10M4 13l-2-2M4 13l2-2M12 13V3M12 3l-2 2M12 3l2 2"/></svg>;
    case "plus":        return <svg {...props}><path d="M8 3v10M3 8h10"/></svg>;
    case "check":       return <svg {...props}><path d="M3 8.5l3 3 7-7"/></svg>;
    case "close":       return <svg {...props}><path d="M3 3l10 10M13 3L3 13"/></svg>;
    case "info":        return <svg {...props}><circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 5.2v.1"/></svg>;
    default: return null;
  }
}

Object.assign(window, { fmt, signalFor, RecoveryMeter, DeptChip, Btn, Stat, SectionLabel, Icon });
