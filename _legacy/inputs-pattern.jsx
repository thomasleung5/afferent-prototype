// Shared "upload + edit" pattern used across Build Model input screens.
// The audit trail is the product: every cell shows where its value came from.

const { useState: uSI, useRef: uRI, useMemo: uMI } = React;

// -- Drop zone -------------------------------------------------------------
// Big top-of-page surface. Accepts file drop or paste. Shows last-imported state.
function DropZone({ accept, lastImport, onImport, hint, formats }) {
  const [over, setOver] = uSI(false);
  const [stage, setStage] = uSI("idle"); // idle | parsing | mapping | done
  const fileRef = uRI(null);

  const simulate = (name) => {
    setStage("parsing");
    setTimeout(() => setStage("mapping"), 700);
    setTimeout(() => { setStage("done"); onImport && onImport(name); }, 1500);
  };

  return (
    <div style={{
      background: stage === "idle" ? "var(--paper)" : "var(--paper-2)",
      border: `1px ${stage === "idle" ? "dashed" : "solid"} ${over ? "var(--accent)" : "var(--rule-strong)"}`,
      padding: 0,
      display:"grid", gridTemplateColumns:"1.2fr 1fr",
    }}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) simulate(f.name); }}
    >
      <div style={{ padding:"22px 26px", borderRight:"1px solid var(--rule)" }}>
        <div style={{ display:"flex", alignItems:"center", gap: 12 }}>
          <div style={{ width: 38, height: 38, flexShrink: 0, border:"1px solid var(--rule-strong)", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--paper)" }}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="var(--ink-2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v9M4 7l4-4 4 4M3 13h10"/>
            </svg>
          </div>
          <div>
            <div className="display" style={{ fontSize: 16, fontWeight: 600 }}>
              {stage === "idle"    && "Drop file to import"}
              {stage === "parsing" && "Parsing source…"}
              {stage === "mapping" && "Auto-mapping rows…"}
              {stage === "done"    && "Import complete"}
            </div>
            <div style={{ fontSize: 12, color:"var(--ink-3)", marginTop: 2 }}>
              {stage === "idle" && (hint || `Drag and drop, paste, or click to browse. Accepts ${formats || "xlsx, csv, pdf"}.`)}
              {stage !== "idle" && lastImport && `${lastImport.file} · ${lastImport.rows} rows`}
            </div>
          </div>
        </div>
        <div style={{ display:"flex", gap: 8, marginTop: 14 }}>
          <Btn kind="primary" onClick={() => fileRef.current?.click()}><Icon name="plus" size={13}/> Browse files</Btn>
          <Btn kind="ghost">Paste from clipboard</Btn>
          <Btn kind="ghost">Connect data source</Btn>
          <input ref={fileRef} type="file" accept={accept} style={{ display:"none" }} onChange={e => { const f = e.target.files[0]; if (f) simulate(f.name); }}/>
        </div>
        {stage !== "idle" && stage !== "done" && (
          <div style={{ marginTop: 14 }}>
            <ProgressBar pct={stage === "parsing" ? 35 : 75} height={4}/>
          </div>
        )}
      </div>
      <div style={{ padding:"22px 26px", display:"flex", flexDirection:"column", gap: 10, fontSize: 12, color:"var(--ink-2)" }}>
        <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.12em", color:"var(--ink-3)", textTransform:"uppercase" }}>Last import</div>
        {lastImport ? (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", gap: 8, fontSize: 12 }}>
              <span style={{ color:"var(--ink-3)" }}>File</span><span className="mono" style={{ color:"var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={lastImport.file}>{lastImport.file}</span>
              <span style={{ color:"var(--ink-3)" }}>Imported</span><span className="num">{lastImport.rows}</span>
              <span style={{ color:"var(--ink-3)" }}>Auto-mapped</span><span className="num" style={{ color:"var(--pos)" }}>{lastImport.mapped}</span>
              <span style={{ color:"var(--ink-3)" }}>Need review</span><span className="num" style={{ color: lastImport.review > 0 ? "var(--warn)" : "var(--ink-2)" }}>{lastImport.review}</span>
              <span style={{ color:"var(--ink-3)" }}>Date</span><span className="mono">{lastImport.date}</span>
            </div>
          </>
        ) : <span style={{ color:"var(--ink-4)" }}>No file imported yet — manual entry only.</span>}
      </div>
    </div>
  );
}

// -- Source pill (per row, smaller than SourceBadge) ----------------------
function RowSource({ kind, file, row, manual, edited }) {
  // kind: "imported" | "manual" | "carry-forward"
  const palette = {
    imported:        { bg:"var(--pos-tint)",  fg:"var(--pos)",  bd:"var(--rule-strong)", label:"Imported" },
    "carry-forward": { bg:"var(--paper-2)",   fg:"var(--ink)",  bd:"var(--rule-strong)", label:"Carry-forward" },
    manual:          { bg:"var(--warn-tint)", fg:"var(--warn)", bd:"var(--rule-strong)", label:"Manual" },
  };
  const p = palette[kind] || palette.imported;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap: 2, alignItems:"flex-start" }}>
      <span className="mono" style={{
        display:"inline-flex", alignItems:"center", gap: 4,
        fontSize: 9.5, fontWeight: 600, letterSpacing:"0.04em",
        padding:"2px 6px", textTransform:"uppercase",
        background: p.bg, color: p.fg, border:`1px solid ${p.bd}`,
      }}>
        {edited && <span style={{ width: 4, height: 4, borderRadius:"50%", background:"var(--warn)" }}/>}
        {p.label}
      </span>
      {file && row && <span className="mono" style={{ fontSize: 10, color:"var(--ink-4)" }}>{file} · row {row}</span>}
      {kind === "manual" && manual && <span className="mono" style={{ fontSize: 10, color:"var(--ink-4)" }}>{manual}</span>}
      {edited && <span className="mono" style={{ fontSize: 10, color:"var(--warn)" }}>edited</span>}
    </div>
  );
}

// -- Editable input cell (inline, flat-until-focus) -----------------------
function CellInput({ value, onChange, type = "text", prefix, suffix, align = "left", width, dim }) {
  const [focused, setFocused] = uSI(false);
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap: 2,
      padding:"3px 6px",
      width: width || "100%",
      background: focused ? "var(--paper)" : "transparent",
      border: focused ? "1px solid var(--accent)" : "1px solid transparent",
      transition: "background 100ms, border-color 100ms",
    }}
      onMouseEnter={e => { if (!focused) e.currentTarget.style.background = "var(--paper-2)"; }}
      onMouseLeave={e => { if (!focused) e.currentTarget.style.background = "transparent"; }}
    >
      {prefix && <span style={{ color:"var(--ink-3)", fontSize: 11, fontFamily:"var(--ff-mono)" }}>{prefix}</span>}
      <input type={type === "number" ? "number" : "text"}
        value={value ?? ""}
        onChange={e => onChange(type === "number" ? (e.target.value === "" ? "" : +e.target.value) : e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="num"
        style={{
          width: "100%",
          background:"transparent", border: 0, outline: "none",
          textAlign: align, fontSize: 12.5,
          color: dim ? "var(--ink-3)" : "var(--ink)",
          fontFamily: "inherit", padding: 0,
        }}
      />
      {suffix && <span style={{ color:"var(--ink-3)", fontSize: 11, fontFamily:"var(--ff-mono)" }}>{suffix}</span>}
    </span>
  );
}

// -- Editable select cell --------------------------------------------------
function CellSelect({ value, onChange, options, width }) {
  return (
    <select value={value || ""} onChange={e => onChange(e.target.value)} style={{
      padding:"3px 4px", fontSize: 12, fontFamily:"var(--ff-ui)",
      border:"1px solid transparent", background:"transparent",
      width: width || "100%",
      color:"var(--ink)",
    }}
      onFocus={e => e.currentTarget.style.borderColor = "var(--accent)"}
      onBlur={e => e.currentTarget.style.borderColor = "transparent"}
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// -- Editable table -------------------------------------------------------
// Like DataTable, but row backgrounds vary by source kind, and review queue floats to top.
function EditableTable({ cols, rows, onAdd, addLabel, footerNote }) {
  const grid = cols.map(c => c.width || "1fr").join(" ");
  const sorted = uMI(() => {
    return [...rows].sort((a, b) => {
      // review first, then imported, then carry-forward, then manual
      const order = (r) => r.flag ? 0 : r.source === "manual" ? 3 : r.source === "carry-forward" ? 2 : 1;
      return order(a) - order(b);
    });
  }, [rows]);

  return (
    <div style={{ background:"var(--paper)", border:"1px solid var(--rule)", overflow:"hidden" }}>
      <div style={{
        display:"grid", gridTemplateColumns: grid, gap: 14,
        padding:"10px 16px",
        borderBottom:"1px solid var(--rule-strong)",
        background:"var(--paper-2)",
        fontFamily:"var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
        letterSpacing:"0.08em", color:"var(--ink-3)", textTransform:"uppercase",
      }}>
        {cols.map(c => <div key={c.key} style={{ textAlign: c.align || "left" }}>{c.label}</div>)}
      </div>
      {sorted.map((r, i) => {
        const flagged = !!r.flag;
        const bg = flagged ? "var(--warn-tint)" : "var(--paper)";
        const accent = flagged ? "3px solid var(--warn)" : "3px solid transparent";
        return (
          <div key={r.id || i} style={{
            display:"grid", gridTemplateColumns: grid, gap: 14,
            padding:"10px 16px 10px 13px",
            alignItems:"center",
            borderBottom: i < sorted.length - 1 ? "1px solid var(--rule)" : "none",
            background: bg, borderLeft: accent,
            fontSize: 12.5,
          }}>
            {cols.map(c => (
              <div key={c.key} style={{ textAlign: c.align || "left", color:"var(--ink)", overflow:"hidden" }}>
                {c.render ? c.render(r) : r[c.key]}
              </div>
            ))}
          </div>
        );
      })}
      <div style={{
        padding:"10px 16px", borderTop:"1px solid var(--rule-strong)",
        background:"var(--paper-2)",
        display:"flex", justifyContent:"space-between", alignItems:"center", gap: 14,
      }}>
        <button onClick={onAdd} style={{
          display:"inline-flex", alignItems:"center", gap: 6,
          fontSize: 12, fontWeight: 500, color:"var(--accent)",
          padding:"4px 8px", border:"1px dashed var(--rule-strong)",
          background:"var(--paper)",
        }}>
          <Icon name="plus" size={12}/> {addLabel || "Add row manually"}
        </button>
        {footerNote && <div style={{ fontSize: 11.5, color:"var(--ink-3)" }}>{footerNote}</div>}
      </div>
    </div>
  );
}

// -- Audit summary strip ---------------------------------------------------
// Lightweight provenance context for input screens. Mirrors the StickyAuditStrip
// pattern used on decision screens (Fee Schedule / Cost of Service) so the
// audit signal looks identical product-wide. Single line, low contrast.
function AuditStrip({ counts }) {
  const items = [
    { l:"Imported",      v: counts.imported },
    { l:"Carry-forward", v: counts.carry },
    { l:"Manual",        v: counts.manual },
    { l:"Edited",        v: counts.edited },
    { l:"Flagged",       v: counts.flagged },
  ].filter(it => it.v > 0);
  const total = items.reduce((a, x) => a + x.v, 0);
  if (total === 0) return null;
  return (
    <div style={{
      display:"flex", alignItems:"center", gap: 12, flexWrap:"wrap",
      padding:"7px 14px",
      background: "oklch(98.8% 0.005 220)",
      border: "1px solid var(--rule)",
      fontSize: 11.5, color: "var(--ink-3)",
    }}>
      <span style={{
        width: 6, height: 6, borderRadius:"50%", background:"var(--pos)",
        boxShadow:"0 0 0 3px oklch(94% 0.05 155)",
      }}/>
      <span style={{ color: "var(--ink-2)", fontWeight: 500 }}>All values traceable</span>
      <span style={{ color: "var(--ink-4)" }}>·</span>
      <span className="mono" style={{ fontSize: 10.5, letterSpacing: "0.04em" }}>
        {total} rows
      </span>
      {items.length > 0 && <span style={{ color:"var(--ink-4)" }}>·</span>}
      {items.map((it, i) => (
        <span key={i} style={{ display:"inline-flex", gap: 5 }}>
          <span>{it.l}</span>
          <span className="num" style={{ color:"var(--ink-2)", fontWeight: 500 }}>{it.v}</span>
        </span>
      ))}
      <span style={{ flex: 1 }}/>
      <button style={{
        padding: "3px 9px", fontSize: 11, fontFamily: "var(--ff-sans)",
        background: "transparent", color: "var(--ink-2)",
        border: "1px solid var(--rule)", cursor: "pointer", fontWeight: 500,
      }}>View audit log</button>
    </div>
  );
}

Object.assign(window, { DropZone, RowSource, CellInput, CellSelect, EditableTable, AuditStrip });
