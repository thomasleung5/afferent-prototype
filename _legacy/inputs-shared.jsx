// Shared primitives for Inputs pages — page chrome, editable cells, explanation panel

const { useState: uS, useEffect: uE, useMemo: uM } = React;

// Page shell — title, subtitle, content + explanation panel
function InputsPageShell({ title, subtitle, crumbs, actions, children, explain }) {
  return (
    <div style={{ padding:"24px 32px", display:"flex", flexDirection:"column", gap: 20 }}>
      <div>
        <div style={{ display:"flex", alignItems:"center", gap: 8, fontSize: 12, color:"var(--ink-3)", marginBottom: 10 }}>
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              <span style={{ color: i === crumbs.length-1 ? "var(--ink)" : "var(--ink-3)" }}>{c}</span>
              {i < crumbs.length-1 && <span style={{ color:"var(--ink-4)" }}>/</span>}
            </React.Fragment>
          ))}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", gap: 24 }}>
          <div>
            <div className="display" style={{ fontSize: 26, fontWeight: 600, letterSpacing:"-0.015em" }}>{title}</div>
            <div style={{ fontSize: 13, color:"var(--ink-3)", marginTop: 6, maxWidth: 680, textWrap:"pretty" }}>{subtitle}</div>
          </div>
          {actions && <div style={{ display:"flex", gap: 8 }}>{actions}</div>}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap: 20, alignItems:"flex-start" }}>
        <div style={{ display:"flex", flexDirection:"column", gap: 20 }}>{children}</div>
        <div style={{ position:"sticky", top: 114 }}>
          {explain}
        </div>
      </div>
    </div>
  );
}

// Explanation panel (right rail)
function ExplainPanel({ title, lead, items, downstream }) {
  return (
    <div style={{ background:"var(--paper)", border:"1px solid var(--rule)", padding: 20 }}>
      <SectionLabel>What this feeds</SectionLabel>
      <div style={{ fontSize: 15, fontWeight: 500, color:"var(--ink)", letterSpacing:"-0.005em", marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color:"var(--ink-2)", lineHeight: 1.55, textWrap:"pretty" }}>
        {lead}
      </div>

      {items && items.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div className="mono" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase", marginBottom: 10 }}>Inputs on this page</div>
          {items.map((it, i) => (
            <div key={i} style={{ display:"flex", gap: 10, padding:"8px 0", borderBottom: i < items.length-1 ? "1px dashed var(--rule)" : "none" }}>
              <div className="mono" style={{ fontSize: 10, color:"var(--ink-4)", width: 14, textAlign:"right", marginTop: 3 }}>{String(i+1).padStart(2,"0")}</div>
              <div style={{ fontSize: 12.5, color:"var(--ink)", lineHeight: 1.5 }}>{it}</div>
            </div>
          ))}
        </div>
      )}

      {downstream && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop:"1px solid var(--rule)" }}>
          <div className="mono" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase", marginBottom: 10 }}>Flows into</div>
          {downstream.map((d, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap: 8, padding:"6px 0", fontSize: 12.5, color:"var(--ink-2)" }}>
              <Icon name="arrow-right" size={12} color="var(--ink-3)"/>
              <span>{d}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Inputs card (content section with title + right header slot)
function InputsCard({ title, eyebrow, right, children, pad = 0 }) {
  return (
    <div style={{ background:"var(--paper)", border:"1px solid var(--rule)" }}>
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"14px 20px", borderBottom:"1px solid var(--rule)",
      }}>
        <div>
          {eyebrow && <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.12em", color:"var(--ink-3)", textTransform:"uppercase", marginBottom: 4 }}>{eyebrow}</div>}
          <div className="display" style={{ fontSize: 16, fontWeight: 600, letterSpacing:"-0.01em" }}>{title}</div>
        </div>
        {right && <div>{right}</div>}
      </div>
      <div style={{ padding: pad }}>{children}</div>
    </div>
  );
}

// Editable cell — inline input that looks flat until hover/focus
function EditableCell({ value, onChange, type = "text", align = "left", prefix, suffix, step, min, max, options }) {
  const isNumber = type === "number";
  const base = {
    width:"100%", height: 28, padding:"0 6px",
    border:"1px solid transparent",
    background:"transparent",
    fontFamily: isNumber ? "var(--ff-mono)" : "var(--ff-ui)",
    fontSize: 13,
    color:"var(--ink)",
    outline:"none",
    textAlign: align,
    fontFeatureSettings: isNumber ? '"tnum" 1' : undefined,
  };
  const focus = (e) => {
    e.currentTarget.style.border = "1px solid var(--accent)";
    e.currentTarget.style.background = "var(--paper)";
  };
  const blur = (e) => {
    e.currentTarget.style.border = "1px solid transparent";
    e.currentTarget.style.background = "transparent";
  };

  if (type === "select") {
    return (
      <select value={value} onChange={e => onChange(e.target.value)} onFocus={focus} onBlur={blur}
        style={{ ...base, appearance:"none", WebkitAppearance:"none", paddingRight: 18,
          backgroundImage:"linear-gradient(45deg, transparent 50%, var(--ink-3) 50%), linear-gradient(135deg, var(--ink-3) 50%, transparent 50%)",
          backgroundPosition:"calc(100% - 10px) 13px, calc(100% - 6px) 13px",
          backgroundSize:"4px 4px, 4px 4px", backgroundRepeat:"no-repeat",
        }}>
        {options.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
    );
  }

  return (
    <div style={{ display:"flex", alignItems:"center", gap: 2, padding:"0 4px" }} className="editable-cell">
      {prefix && <span style={{ color:"var(--ink-3)", fontSize: 12, fontFamily:"var(--ff-mono)" }}>{prefix}</span>}
      <input type={isNumber ? "number" : "text"}
        value={value} onChange={e => onChange(isNumber ? (e.target.value === "" ? "" : +e.target.value) : e.target.value)}
        onFocus={focus} onBlur={blur}
        step={step} min={min} max={max}
        style={base}/>
      {suffix && <span style={{ color:"var(--ink-3)", fontSize: 12, fontFamily:"var(--ff-mono)" }}>{suffix}</span>}
    </div>
  );
}

// Row add/remove buttons
function RowActions({ onDelete }) {
  return (
    <button onClick={onDelete} style={{
      width: 24, height: 24, display:"flex", alignItems:"center", justifyContent:"center",
      color:"var(--ink-4)", borderRadius: 0,
    }} title="Delete row"><Icon name="close" size={12}/></button>
  );
}

// Totals footer row
function TotalsRow({ cols, values }) {
  return (
    <div style={{
      display:"grid", gridTemplateColumns: cols, gap: 0,
      padding:"14px 20px",
      borderTop:"2px solid var(--ink)",
      background:"var(--paper-2)",
      alignItems:"center",
    }}>
      {values.map((v, i) => (
        <div key={i} style={{
          fontSize: v.label === "TOTAL" ? 11 : 14,
          fontWeight: 600,
          color:"var(--ink)",
          textAlign: v.align || "left",
          fontFamily: v.mono ? "var(--ff-mono)" : undefined,
          letterSpacing: v.label === "TOTAL" ? "0.1em" : undefined,
          fontFeatureSettings: v.mono ? '"tnum" 1' : undefined,
        }}>
          {v.label === "TOTAL" ? "TOTAL" : v.value}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { InputsPageShell, ExplainPanel, InputsCard, EditableCell, RowActions, TotalsRow });
