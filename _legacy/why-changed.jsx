// Why-changed drilldowns + lightweight source lineage badges.
//
// WhyChanged: small mono pill ("Why? ▾") that expands inline to reveal a
// driver-attribution panel — every major delta becomes explainable.
//
// SourceBadge: tiny chip next to a number; click reveals the source citation.
// Builds trust without dominating the layout.
//
// Both components match the existing design tokens — paper-2 panels,
// rule borders, mono labels, accent for clickable, neg/pos for direction.

const { useState: uS_WC } = React;

// ---------------------------------------------------------------------------
// SourceBadge — micro chip; hover/click reveals source detail.
// ---------------------------------------------------------------------------
function SourceBadge({ label, detail, asof }) {
  const [open, setOpen] = uS_WC(false);
  return (
    <span
      onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={{
        position:"relative", display:"inline-flex", alignItems:"center", gap: 4,
        fontFamily:"var(--ff-mono)", fontSize: 10, letterSpacing:"0.04em",
        padding:"1px 6px", border:"1px solid var(--rule)",
        background:"var(--paper)", color:"var(--ink-3)",
        cursor:"help", whiteSpace:"nowrap", verticalAlign:"middle",
      }}
    >
      <span style={{ width: 4, height: 4, borderRadius:"50%", background:"var(--ink-4)" }}/>
      <span>{label}</span>
      {open && (detail || asof) && (
        <span style={{
          position:"absolute", top:"calc(100% + 4px)", left: 0, zIndex: 50,
          minWidth: 220, padding:"8px 10px",
          background:"var(--paper)", border:"1px solid var(--rule-strong)",
          boxShadow:"0 6px 18px -10px rgba(0,0,0,0.15)",
          fontFamily:"var(--ff-ui)", fontSize: 11.5, letterSpacing: 0,
          color:"var(--ink-2)", lineHeight: 1.5, textAlign:"left",
          whiteSpace:"normal", textTransform:"none",
        }}>
          <div style={{
            fontFamily:"var(--ff-mono)", fontSize: 9.5, letterSpacing:"0.1em",
            textTransform:"uppercase", color:"var(--ink-3)", marginBottom: 3,
          }}>Source</div>
          <div style={{ fontWeight: 500, color:"var(--ink)", marginBottom: detail ? 4 : 0 }}>{label}</div>
          {detail && <div>{detail}</div>}
          {asof && (
            <div style={{ marginTop: 4, fontFamily:"var(--ff-mono)", fontSize: 10, color:"var(--ink-3)" }}>
              As of {asof}
            </div>
          )}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// WhyChanged — pill trigger + inline expansion with driver attribution.
//
// Props:
//   from, to, net (string headline)
//   drivers: [{ label, magnitude, dir: "up"|"down"|"flat", source? }]
//   trigger: optional override for the trigger label ("Why?")
//   alignRight: if true, panel anchors right edge of trigger
// ---------------------------------------------------------------------------
function WhyChanged({ from, to, net, drivers = [], trigger = "Why?", alignRight = false, label }) {
  const [open, setOpen] = uS_WC(false);
  const dirColor = (d) =>
    d === "up"   ? "var(--neg)" :
    d === "down" ? "var(--pos)" : "var(--ink-3)";
  const dirGlyph = (d) =>
    d === "up" ? "▲" : d === "down" ? "▼" : "•";

  return (
    <span style={{ position:"relative", display:"inline-block" }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          display:"inline-flex", alignItems:"center", gap: 4,
          fontFamily:"var(--ff-mono)", fontSize: 10, fontWeight: 600,
          letterSpacing:"0.08em", textTransform:"uppercase",
          padding:"2px 7px",
          background: open ? "var(--accent-tint)" : "var(--paper-2)",
          border:"1px solid var(--rule)",
          color: open ? "var(--accent)" : "var(--ink-2)",
          cursor:"pointer",
        }}
      >
        <span>{trigger}</span>
        <span style={{ fontSize: 8 }}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position:"absolute", top:"calc(100% + 6px)",
            left: alignRight ? "auto" : 0, right: alignRight ? 0 : "auto",
            zIndex: 60, width: 380, maxWidth:"90vw",
            background:"var(--paper)", border:"1px solid var(--rule-strong)",
            boxShadow:"0 12px 28px -14px rgba(0,0,0,0.22)",
            fontFamily:"var(--ff-ui)",
          }}
        >
          {/* header */}
          <div style={{
            padding:"10px 14px 8px",
            background:"var(--paper-2)", borderBottom:"1px solid var(--rule)",
          }}>
            <div style={{
              fontFamily:"var(--ff-mono)", fontSize: 10, fontWeight: 600,
              letterSpacing:"0.12em", textTransform:"uppercase",
              color:"var(--ink-3)", marginBottom: 4,
            }}>Drivers of change{label ? ` · ${label}` : ""}</div>
            {(from || to || net) && (
              <div style={{ display:"flex", alignItems:"baseline", gap: 8, fontSize: 13 }}>
                {from && (
                  <span className="num" style={{ color:"var(--ink-3)" }}>{from}</span>
                )}
                {from && to && (
                  <span style={{ color:"var(--ink-4)", fontSize: 11 }}>→</span>
                )}
                {to && (
                  <span className="num" style={{ color:"var(--ink)", fontWeight: 600 }}>{to}</span>
                )}
                {net && (
                  <span className="mono" style={{
                    marginLeft:"auto", fontSize: 11, fontWeight: 600,
                    color: net.trim().startsWith("+") ? "var(--neg)" :
                           net.trim().startsWith("−") || net.trim().startsWith("-") ? "var(--pos)" :
                           "var(--ink-3)",
                  }}>{net}</span>
                )}
              </div>
            )}
          </div>

          {/* drivers */}
          <div>
            {drivers.length === 0 && (
              <div style={{ padding:"14px", fontSize: 12, color:"var(--ink-3)" }}>
                No driver attribution available.
              </div>
            )}
            {drivers.map((d, i) => (
              <div key={i} style={{
                display:"grid",
                gridTemplateColumns:"16px 1fr auto",
                alignItems:"center", gap: 8,
                padding:"9px 14px",
                borderBottom: i < drivers.length - 1 ? "1px solid var(--rule)" : "none",
              }}>
                <span style={{
                  color: dirColor(d.dir),
                  fontSize: 9, lineHeight: 1, textAlign:"center",
                }}>{dirGlyph(d.dir)}</span>
                <div style={{ display:"flex", flexDirection:"column", gap: 3, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color:"var(--ink)", lineHeight: 1.35 }}>{d.label}</div>
                  {d.source && (
                    <div style={{ display:"inline-flex", flexWrap:"wrap", gap: 4 }}>
                      <SourceBadge
                        label={d.source.label}
                        detail={d.source.detail}
                        asof={d.source.asof}
                      />
                    </div>
                  )}
                </div>
                <div className="mono num" style={{
                  fontSize: 12, fontWeight: 600,
                  color: dirColor(d.dir), whiteSpace:"nowrap",
                }}>{d.magnitude}</div>
              </div>
            ))}
          </div>

          {/* footer hint */}
          <div style={{
            padding:"8px 14px",
            background:"var(--paper-2)", borderTop:"1px solid var(--rule)",
            fontSize: 10.5, color:"var(--ink-3)", lineHeight: 1.5,
          }}>
            Hover any source badge for citation detail.
          </div>
        </div>
      )}
    </span>
  );
}

Object.assign(window, { WhyChanged, SourceBadge });
