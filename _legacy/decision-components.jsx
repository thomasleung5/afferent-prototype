// =========================================================================
// Decision components — the reusable kit that makes Afferent feel like a
// decision system rather than a dashboard. Every component answers part of:
//   "where are we losing money, why, and what to change?"
//
// Components:
//   <GapHeadline>           — oversize unrecovered $ + recovery %
//   <DriverBreakdown>       — stacked bar: labor vs operating vs CAP
//   <DeptRecoveryChart>     — horizontal bars per dept with 100% target line
//   <FlagStrip>             — prioritized issues, clickable, hidden when empty
//   <TopFixes>              — ranked fee changes with revenue impact
//
// All components read from window.AFFERENT_ENGINE.useModel() shape:
//   { totals: { totalCost, currentRev, fullRev },
//     byDept: { [d]: { totalCost, currentRev, recovery, fbhr } },
//     salary, cap, operating, services }
// =========================================================================

const { useState: uSDC, useMemo: uMDC } = React;
// `fmt` is the global formatter from primitives.jsx (loaded earlier).

// =========================================================================
// GapHeadline — the answer at the top of the screen.
// =========================================================================
function GapHeadline({ totalCost, currentRev, fullRev, eyebrow, sub, tone = "neutral" }) {
  const gap = (totalCost || 0) - (currentRev || 0);
  const recovery = totalCost > 0 ? (currentRev / totalCost) * 100 : 0;
  const recoveredAfter = fullRev != null && totalCost > 0 ? (fullRev / totalCost) * 100 : null;
  const gapAfter = fullRev != null ? totalCost - fullRev : null;

  return (
    <div style={{ paddingBottom: 4 }}>
      {eyebrow && (
        <div className="mono" style={{
          fontSize: 10.5, fontWeight: 600, letterSpacing: "0.14em",
          color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 10,
        }}>{eyebrow}</div>
      )}
      <div style={{ display: "flex", alignItems: "baseline", gap: 32, flexWrap: "wrap" }}>
        <div>
          <div className="display num" style={{
            fontSize: "var(--t-l1)", fontWeight: "var(--t-l1-w)", letterSpacing: "-0.025em", lineHeight: 1,
            color: "var(--ink)", fontFeatureSettings: '"tnum" 1, "zero" 1',
          }}>{fmt.dollarsK(gap)}</div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 8, lineHeight: 1.4 }}>
            unrecovered annually · {fmt.dollarsK(currentRev || 0)} of {fmt.dollarsK(totalCost || 0)} cost
          </div>
        </div>
        <div style={{ width: 1, height: 64, background: "var(--rule)" }}/>
        <div>
          <div className="display num" style={{
            fontSize: "var(--t-l2)", fontWeight: "var(--t-l2-w)", letterSpacing: "-0.02em", lineHeight: 1,
            color: recovery >= 80 ? "var(--pos)" : recovery >= 50 ? "var(--warn)" : "var(--neg)",
            fontFeatureSettings: '"tnum" 1',
          }}>{recovery.toFixed(0)}%</div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 8 }}>
            citywide cost recovery
          </div>
        </div>
        {recoveredAfter != null && Math.abs(recoveredAfter - recovery) > 1 && (
          <>
            <div style={{ width: 1, height: 64, background: "var(--rule)" }}/>
            <div>
              <div className="display num" style={{
                fontSize: 28, fontWeight: 500, letterSpacing: "-0.015em", lineHeight: 1,
                color: "var(--accent)", fontFeatureSettings: '"tnum" 1',
              }}>→ {recoveredAfter.toFixed(0)}%</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 8, lineHeight: 1.4 }}>
                if all recommended fees adopted<br/>
                gap drops to <b style={{ color: "var(--ink-2)" }}>{fmt.dollarsK(gapAfter)}</b>
              </div>
            </div>
          </>
        )}
      </div>
      {sub && (
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 16, maxWidth: 720, lineHeight: 1.5 }}>{sub}</div>
      )}
    </div>
  );
}

// =========================================================================
// DriverBreakdown — stacked horizontal bar, labor vs operating vs CAP.
// Each segment labeled with $ and %. One-line caption underneath naming
// the largest driver.
// =========================================================================
function DriverBreakdown({ direct, operating, cap, eyebrow }) {
  const total = (direct || 0) + (operating || 0) + (cap || 0);
  if (total === 0) return null;

  const segs = [
    { id: "labor", label: "Direct labor",   value: direct,    color: "var(--ink)"     },
    { id: "op",    label: "Dept operating", value: operating, color: "var(--ink-2)"   },
    { id: "cap",   label: "Cost allocation", value: cap,       color: "var(--accent)"  },
  ];
  const largest = segs.reduce((a, b) => (b.value > a.value ? b : a));
  const pct = (v) => (v / total) * 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {eyebrow && (
        <div className="mono" style={{
          fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>{eyebrow}</div>
      )}
      <div style={{ display: "flex", height: 32, borderRadius: 0, overflow: "hidden", border: "1px solid var(--rule)" }}>
        {segs.map(s => s.value > 0 && (
          <div key={s.id} style={{
            background: s.color, width: `${pct(s.value)}%`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "white", fontSize: 11.5, fontWeight: 500,
            fontFamily: "var(--ff-mono)", letterSpacing: "0.02em",
          }} title={`${s.label}: ${fmt.dollarsK(s.value)} (${pct(s.value).toFixed(0)}%)`}>
            {pct(s.value) > 12 ? `${pct(s.value).toFixed(0)}%` : ""}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 28, fontSize: 12, color: "var(--ink-2)", flexWrap: "wrap" }}>
        {segs.map(s => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 10, height: 10, background: s.color, display: "inline-block" }}/>
            <span>{s.label}</span>
            <span className="num" style={{ color: "var(--ink)", fontWeight: 500, fontFeatureSettings: '"tnum" 1' }}>
              {fmt.dollarsK(s.value)}
            </span>
            <span style={{ color: "var(--ink-3)" }}>· {pct(s.value).toFixed(0)}%</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.45, marginTop: 2 }}>
        Largest driver: <b style={{ color: "var(--ink-2)", fontWeight: 500 }}>{largest.label}</b>.
        {largest.id === "cap"   && " Audit the allocation matrix if recovery is low."}
        {largest.id === "labor" && " Verify productive hours and salary tables."}
        {largest.id === "op"    && " Check for misclassified citywide costs."}
      </div>
    </div>
  );
}

// =========================================================================
// DeptRecoveryChart — horizontal bar per fee dept, 100% target line.
// Bar color steps: red <50%, amber 50–80%, green ≥80%.
// =========================================================================
function DeptRecoveryChart({ byDept, eyebrow, onPick }) {
  const rows = Object.values(byDept || {})
    .filter(d => d.totalCost > 0)
    .sort((a, b) => a.recovery - b.recovery);  // worst first

  if (rows.length === 0) return null;

  const DEPT_LABELS = { PLAN: "Planning", BLDG: "Building", ENG: "Engineering" };
  const max = Math.max(120, ...rows.map(r => r.recovery));  // give room above 100% target

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {eyebrow && (
        <div className="mono" style={{
          fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>{eyebrow}</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map(r => {
          const tone = r.recovery >= 80 ? "var(--pos)" : r.recovery >= 50 ? "var(--warn)" : "var(--neg)";
          const widthPct = (r.recovery / max) * 100;
          const targetPct = (100 / max) * 100;
          return (
            <div key={r.dept}
              onClick={() => onPick && onPick(r.dept)}
              style={{
                display: "grid", gridTemplateColumns: "140px 1fr 200px",
                gap: 16, alignItems: "center",
                cursor: onPick ? "pointer" : "default",
                padding: "8px 0",
                borderBottom: "1px dotted var(--rule)",
              }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                {DEPT_LABELS[r.dept] || r.dept}
              </div>
              <div style={{ position: "relative", height: 22, background: "var(--paper-2)", border: "1px solid var(--rule)" }}>
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0,
                  width: `${widthPct}%`, background: tone, transition: "width 200ms",
                }}/>
                <div style={{
                  position: "absolute", left: `${targetPct}%`, top: -4, bottom: -4,
                  width: 0, borderLeft: "2px dashed var(--ink-3)",
                }}/>
                <div style={{
                  position: "absolute", left: `calc(${targetPct}% + 6px)`, top: -16,
                  fontSize: 10, color: "var(--ink-3)",
                  fontFamily: "var(--ff-mono)", whiteSpace: "nowrap",
                }}>100% target</div>
                <div className="num" style={{
                  position: "absolute", left: 8, top: 0, bottom: 0,
                  display: "flex", alignItems: "center",
                  fontSize: 12, fontWeight: 600, color: widthPct > 18 ? "white" : "var(--ink)",
                  fontFeatureSettings: '"tnum" 1',
                }}>{r.recovery.toFixed(0)}%</div>
              </div>
              <div className="num" style={{
                fontSize: 11.5, color: "var(--ink-3)", textAlign: "right",
                fontFeatureSettings: '"tnum" 1',
              }}>
                {fmt.dollarsK(r.currentRev)} of {fmt.dollarsK(r.totalCost)}
                <span style={{ color: r.recovery < 80 ? "var(--neg)" : "var(--ink-3)", marginLeft: 8 }}>
                  · gap {fmt.dollarsK(r.totalCost - r.currentRev)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =========================================================================
// FlagStrip — actionable issue inventory. Renders nothing if empty.
// flags: [{ id, severity: 'critical'|'warn'|'info', label, action?, onClick? }]
// =========================================================================
function FlagStrip({ flags, eyebrow }) {
  const live = (flags || []).filter(Boolean);
  if (live.length === 0) return null;

  const TONE = {
    critical: { bg: "color-mix(in oklch, var(--neg) 8%, var(--paper))", fg: "var(--neg)", dot: "var(--neg)" },
    warn:     { bg: "var(--warn-tint)", fg: "var(--warn)", dot: "var(--warn)" },
    info:     { bg: "var(--paper-2)", fg: "var(--ink-2)", dot: "var(--ink-3)" },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {eyebrow && (
        <div className="mono" style={{
          fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>{eyebrow}</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {live.map(f => {
          const t = TONE[f.severity] || TONE.info;
          const Tag = f.onClick ? "button" : "div";
          return (
            <Tag key={f.id} onClick={f.onClick}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px",
                background: t.bg,
                borderLeft: `3px solid ${t.dot}`,
                fontSize: 12.5, color: "var(--ink)", lineHeight: 1.45,
                textAlign: "left", width: "100%",
                cursor: f.onClick ? "pointer" : "default",
                fontFamily: "inherit",
              }}>
              <span className="mono" style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em",
                color: t.fg, textTransform: "uppercase",
                width: 60, flexShrink: 0,
              }}>{f.severity === "warn" ? "Review" : f.severity === "critical" ? "Critical" : "Info"}</span>
              <span style={{ flex: 1, color: "var(--ink)" }}>{f.label}</span>
              {f.impact && (
                <span className="num" style={{
                  fontSize: 12, fontWeight: 600, color: t.fg,
                  fontFeatureSettings: '"tnum" 1', whiteSpace: "nowrap",
                }}>{f.impact}</span>
              )}
              {f.action && (
                <span style={{
                  fontSize: 11.5, color: "var(--accent)", fontWeight: 500,
                  whiteSpace: "nowrap",
                }}>{f.action} →</span>
              )}
            </Tag>
          );
        })}
      </div>
    </div>
  );
}

// =========================================================================
// TopFixes — ranked list of fee changes by revenue impact.
// services: enriched service rows with { id, name, dept, fee, recommended, volume, confidence, ... }
// =========================================================================
function TopFixes({ services, max = 5, eyebrow, onPick }) {
  const ranked = uMDC(() => {
    return (services || [])
      .map(s => ({
        ...s,
        impact: ((s.recommended ?? s.adopted ?? s.fee) - (s.fee || 0)) * (s.volume || 0),
        recovery: s.cost > 0 ? ((s.fee || 0) / s.cost) * 100 : 0,
      }))
      .filter(s => Math.abs(s.impact) > 0)
      .sort((a, b) => b.impact - a.impact)
      .slice(0, max);
  }, [services, max]);

  if (ranked.length === 0) return null;

  const DEPT_LABELS = { PLAN: "Planning", BLDG: "Building", ENG: "Engineering" };
  const CONF_TONE = {
    high: "var(--pos)", med: "var(--warn)", low: "var(--neg)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {eyebrow && (
        <div className="mono" style={{
          fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>{eyebrow}</div>
      )}
      <div style={{ border: "1px solid var(--rule)", background: "var(--paper)" }}>
        {ranked.map((s, i) => {
          const recAmt = s.recommended ?? s.adopted ?? s.fee ?? 0;
          const dollarChange = recAmt - (s.fee || 0);
          return (
            <div key={s.id || i}
              onClick={() => onPick && onPick(s)}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 120px 180px 80px",
                gap: 12, alignItems: "center",
                padding: "12px 16px",
                borderBottom: i < ranked.length - 1 ? "1px solid var(--rule)" : "none",
                cursor: onPick ? "pointer" : "default",
                fontSize: 12.5,
              }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", lineHeight: 1.3 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>
                  {DEPT_LABELS[s.dept] || s.dept} · {s.volume || 0}/yr · {s.recovery.toFixed(0)}% recovered
                </div>
              </div>
              <div className="num" style={{
                fontSize: 12, color: "var(--ink-3)", textAlign: "right",
                fontFeatureSettings: '"tnum" 1',
              }}>
                ${(s.fee || 0).toLocaleString()} → <span style={{ color: "var(--ink)", fontWeight: 500 }}>${recAmt.toLocaleString()}</span>
              </div>
              <div className="num" style={{
                fontSize: 13, fontWeight: 600, textAlign: "right",
                color: dollarChange >= 0 ? "var(--pos)" : "var(--neg)",
                fontFeatureSettings: '"tnum" 1',
              }}>
                {dollarChange >= 0 ? "+" : ""}{fmt.dollarsK(s.impact)}/yr
              </div>
              <div style={{
                fontSize: 11.5, color: "var(--accent)", fontWeight: 500, textAlign: "right",
              }}>Open →</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =========================================================================
// AnswerHeader — the ONE-question answer at the top of any screen.
// Each screen states the question it answers and gives the answer in a single
// dominant number. Sub-stats fan out to the right.
//
// Props:
//   question   "What is the recovery gap, and what is driving it?"
//   answer     "$1.2M unrecovered annually"
//   tone       "neg" | "warn" | "pos" | "neutral"
//   stats      [{label, value, tone?, sub?}]
//   actions    optional buttons
// =========================================================================
function AnswerHeader({ question, answer, sub, tone = "neutral", stats, actions, provenance }) {
  const color = tone === "neg" ? "var(--neg)" : tone === "warn" ? "var(--warn)" :
                tone === "pos" ? "var(--pos)" : "var(--ink)";
  return (
    <div style={{ paddingBottom: 4 }}>
      <div className="mono" style={{
        fontSize: 10.5, fontWeight: 600, letterSpacing: "0.14em",
        color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 10,
      }}>{question}</div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 32, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 36, flexWrap: "wrap" }}>
          <div>
            <div className="display num" style={{
              fontSize: 56, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1,
              color, fontFeatureSettings: '"tnum" 1, "zero" 1',
            }}>{answer}</div>
            {sub && <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 10, lineHeight: 1.45, maxWidth: 460 }}>{sub}</div>}
          </div>
          {stats && stats.length > 0 && (
            <>
              <div style={{ width: 1, height: 56, background: "var(--rule)" }}/>
              <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
                {stats.map((s, i) => {
                  const c = s.tone === "neg" ? "var(--neg)" : s.tone === "warn" ? "var(--warn)" :
                            s.tone === "pos" ? "var(--pos)" : "var(--ink)";
                  return (
                    <div key={i}>
                      <div className="mono" style={{
                        fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
                        color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 6,
                      }}>{s.label}</div>
                      <div className="display num" style={{
                        fontSize: 28, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1,
                        color: c, fontFeatureSettings: '"tnum" 1',
                      }}>{s.value}</div>
                      {s.sub && <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 5 }}>{s.sub}</div>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        {actions && <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>{actions}</div>}
      </div>
      {window.ProvenanceStrip && <window.ProvenanceStrip items={provenance}/>}
    </div>
  );
}

// =========================================================================
// DeltaVsPrior — change vs last study or last year.
// Props: { label, current, prior, fmt: 'dollars'|'pct'|'int', period }
// =========================================================================
function DeltaVsPrior({ label, current, prior, format = "dollars", period = "vs prior year", inverse }) {
  const delta = (current || 0) - (prior || 0);
  const pct = prior ? (delta / Math.abs(prior)) * 100 : 0;
  const formatter = format === "pct" ? (v => `${v.toFixed(1)}%`) :
                    format === "int" ? (v => Math.round(v).toLocaleString()) :
                                       fmt.dollarsK;
  // inverse: when up is bad (e.g. gap)
  const goodUp = !inverse;
  const tone = delta === 0 ? "var(--ink-3)" :
               (delta > 0) === goodUp ? "var(--pos)" : "var(--neg)";
  const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "—";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div className="mono" style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span className="num display" style={{
          fontSize: 20, fontWeight: 600, color: "var(--ink)",
          fontFeatureSettings: '"tnum" 1',
        }}>{formatter(current)}</span>
        <span className="num" style={{
          fontSize: 12, fontWeight: 500, color: tone,
          fontFeatureSettings: '"tnum" 1',
        }}>{arrow} {delta > 0 ? "+" : ""}{formatter(Math.abs(delta))} ({pct >= 0 ? "+" : ""}{pct.toFixed(0)}%)</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{period} · prior {formatter(prior)}</div>
    </div>
  );
}

// =========================================================================
// AuditTrace — inline trace strip showing source-of-truth chain.
// Renders a compact horizontal breadcrumb of where this number came from.
// Props: { steps: [{label, value, source?}], note? }
// =========================================================================
function AuditTrace({ steps, note, compact }) {
  if (!steps || steps.length === 0) return null;
  return (
    <div style={{
      padding: compact ? "8px 12px" : "12px 16px",
      background: "var(--paper-2)", border: "1px solid var(--rule)",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div className="mono" style={{
        fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>Trace</div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, fontFamily: "var(--ff-mono)", fontSize: 11.5, color: "var(--ink-2)" }}>
        {steps.map((s, i) => (
          <React.Fragment key={i}>
            <span style={{
              padding: "3px 8px", background: "var(--paper)",
              border: "1px solid var(--rule)", color: "var(--ink)",
              display: "inline-flex", alignItems: "baseline", gap: 6,
            }}>
              <span style={{ color: "var(--ink-3)", fontSize: 10 }}>{s.label}</span>
              <b style={{ fontWeight: 600 }}>{s.value}</b>
              {s.source && <span style={{ color: "var(--ink-4)", fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em" }}>· {s.source}</span>}
            </span>
            {i < steps.length - 1 && <span style={{ color: "var(--ink-4)" }}>→</span>}
          </React.Fragment>
        ))}
      </div>
      {note && <div style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.45, marginTop: 2 }}>{note}</div>}
    </div>
  );
}

// =========================================================================
// computeFlags(screen, model, capModel) — central flag engine.
// Returns the 3-5 highest-priority flags for a given screen, each with:
//   { id, severity, label, impact, action, onClick }
// =========================================================================
function computeFlags(screen, model, capModel) {
  const flags = [];
  const totals = model?.totals || {};
  const services = model?.services || [];
  const fbhr = model?.fbhr || {};
  const NAV = (s) => () => window.AFFERENT_NAV && window.AFFERENT_NAV(s);

  // Helper: gap by dept
  const deptGap = (d) => {
    const dd = model?.byDept?.[d];
    return dd ? Math.max(0, dd.totalCost - dd.currentRev) : 0;
  };

  if (screen === "overview") {
    const gap = (totals.totalCost || 0) - (totals.currentRev || 0);
    const recovery = totals.totalCost > 0 ? (totals.currentRev / totals.totalCost) * 100 : 0;
    if (gap > 100_000) {
      flags.push({
        id: "gap-citywide", severity: "critical",
        label: `Citywide recovery is ${recovery.toFixed(0)}% — ${fmt.dollarsK(gap)}/yr unrecovered.`,
        impact: `${fmt.dollarsK(gap)}/yr`, action: "Review fee schedule",
        onClick: NAV("build-feestudy"),
      });
    }
    Object.values(model?.byDept || {}).forEach(d => {
      if (d.recovery < 50 && d.totalCost > 100_000) {
        const NM = { PLAN: "Planning", BLDG: "Building", ENG: "Engineering" };
        flags.push({
          id: `dept-${d.dept}`, severity: "warn",
          label: `${NM[d.dept] || d.dept} recovers only ${d.recovery.toFixed(0)}% — fee schedule is the lever.`,
          impact: `${fmt.dollarsK(d.totalCost - d.currentRev)}/yr`,
          action: "Review fees", onClick: NAV("build-feestudy"),
        });
      }
    });
    if (capModel) {
      const u = Math.abs(capModel.totals?.unallocated || 0);
      if (u > 1) flags.push({
        id: "cap-unbalanced", severity: "critical",
        label: `CAP allocation off by ${fmt.dollarsK(u)} — every downstream number is wrong by this margin.`,
        impact: fmt.dollarsK(u), action: "Open CAP", onClick: NAV("build-cap"),
      });
    }
  }

  if (screen === "services") {
    const noVol = services.filter(s => !s.volume);
    const noHrs = services.filter(s => !s.hours);
    const oneHourMisscoped = services.filter(s => s.hours > 0 && s.hours < 0.25 && s.cost > 0);
    if (noVol.length > 0) flags.push({
      id: "svc-vol", severity: "critical",
      label: `${noVol.length} service${noVol.length>1?"s have":" has"} no annual volume — they contribute $0 to the gap and can't be priced.`,
      impact: `${noVol.length} svc`, action: "Add volumes", onClick: NAV("build-workload"),
    });
    if (noHrs.length > 0) flags.push({
      id: "svc-hrs", severity: "critical",
      label: `${noHrs.length} service${noHrs.length>1?"s have":" has"} no hours — cost is undefined.`,
      impact: `${noHrs.length} svc`, action: "Set hours",
    });
    if (oneHourMisscoped.length > 0) flags.push({
      id: "svc-misscoped", severity: "warn",
      label: `${oneHourMisscoped.length} service${oneHourMisscoped.length>1?"s scoped":" scoped"} under 15 minutes — verify or aggregate.`,
      impact: `${oneHourMisscoped.length} svc`,
    });
  }

  if (screen === "salary") {
    const positions = window.AFFERENT_ENGINE?.store?.state?.positions || [];
    const lowHrs = positions.filter(p => p.hours > 0 && p.hours < 1500);
    const noBenefits = positions.filter(p => !p.benefits);
    Object.entries(fbhr).forEach(([d, f]) => {
      if (f.directFBHR < 80 && f.productiveHours > 0) {
        flags.push({
          id: `salary-low-${d}`, severity: "warn",
          label: `${d} direct rate is $${Math.round(f.directFBHR)}/hr — verify salary table is current.`,
          impact: `$${Math.round(f.directFBHR)}/hr`,
        });
      }
    });
    if (lowHrs.length > 0) flags.push({
      id: "salary-hrs", severity: "warn",
      label: `${lowHrs.length} position${lowHrs.length>1?"s have":" has"} fewer than 1500 productive hours — confirm part-time vs full-time.`,
      impact: `${lowHrs.length} pos`,
    });
    if (noBenefits.length > 0) flags.push({
      id: "salary-bens", severity: "critical",
      label: `${noBenefits.length} position${noBenefits.length>1?"s are":" is"} missing benefits — direct rate understated.`,
      impact: `${noBenefits.length} pos`,
    });
  }

  if (screen === "operating") {
    const operating = window.AFFERENT_ENGINE?.store?.state?.operating || [];
    const excluded = operating.filter(o => !o.include);
    const noSrc = operating.filter(o => o.include && !o.source);
    Object.entries(fbhr).forEach(([d, f]) => {
      if (f.directFBHR > 0 && f.operatingRate / f.directFBHR > 0.5) {
        flags.push({
          id: `op-high-${d}`, severity: "warn",
          label: `${d} operating ($${Math.round(f.operatingRate)}/hr) is over half of direct labor — possible CAP misclassification.`,
          impact: `$${Math.round(f.operatingRate)}/hr`,
          action: "Open CAP", onClick: NAV("build-cap"),
        });
      }
    });
    if (excluded.length > 0) flags.push({
      id: "op-excl", severity: "info",
      label: `${excluded.length} operating line${excluded.length>1?"s":""} excluded from FBHR — confirm rationale on each.`,
      impact: `${excluded.length} lines`,
    });
    if (noSrc.length > 0) flags.push({
      id: "op-src", severity: "warn",
      label: `${noSrc.length} included line${noSrc.length>1?"s":""} missing source citation — un-defensible at hearing.`,
      impact: `${noSrc.length} lines`,
    });
  }

  if (screen === "cap") {
    if (capModel) {
      const u = Math.abs(capModel.totals?.unallocated || 0);
      if (u > 1) flags.push({
        id: "cap-bal", severity: "critical",
        label: `Allocation off by ${fmt.dollarsK(u)} — matrix doesn't balance.`,
        impact: fmt.dollarsK(u),
      });
      (capModel.warnings || []).slice(0, 3).forEach((w, i) => {
        flags.push({
          id: `cap-w-${i}`, severity: w.kind === "ERROR" ? "critical" : "warn",
          label: w.msg, impact: w.kind || "",
        });
      });
      // CAP > 50% of cost
      const totalCAP = capModel.totals?.totalAllocated || 0;
      const totalCost = (totals.totalCost || 0);
      if (totalCost > 0 && totalCAP / totalCost > 0.5) flags.push({
        id: "cap-dom", severity: "warn",
        label: `Cost allocation is ${((totalCAP/totalCost)*100).toFixed(0)}% of total cost — verify drivers reflect actual workload.`,
        impact: `${((totalCAP/totalCost)*100).toFixed(0)}%`,
      });
    }
  }

  if (screen === "workload") {
    const noVol = services.filter(s => !s.volume);
    const lowVol = services.filter(s => s.volume > 0 && s.volume < 5);
    if (noVol.length > 0) flags.push({
      id: "wl-miss", severity: "critical",
      label: `${noVol.length} service${noVol.length>1?"s have":" has"} no annual volume — recovery gap understated.`,
      impact: `${noVol.length} svc`,
    });
    if (lowVol.length > 0) flags.push({
      id: "wl-thin", severity: "warn",
      label: `${lowVol.length} service${lowVol.length>1?"s":""} have volume under 5/yr — confidence is low at this scale.`,
      impact: `${lowVol.length} svc`,
    });
  }

  return flags.slice(0, 6);
}

// =========================================================================
// InputNodeAnswer — the answer for an input/builder screen.
// Mirrors GapHeadline's visual weight but for a node's *output rate*.
//
// Props:
//   eyebrow      "This node produces" or "What this node contributes"
//   question     "What is the direct labor rate?" — set as PageHeader subtitle
//   tiles        [{ deptCode, deptName, value, sub?, formula?, tone? }]
//                deptCode shown as DeptChip; value rendered display-large.
//   summary      [{ label, value, sub? }]   — small stats to the right
// =========================================================================
function InputNodeAnswer({ eyebrow, tiles = [], summary = [] }) {
  return (
    <div>
      {eyebrow && (
        <div className="mono" style={{
          fontSize: 10.5, fontWeight: 600, letterSpacing: "0.14em",
          color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 14,
        }}>{eyebrow}</div>
      )}
      <div style={{ display: "flex", alignItems: "stretch", gap: 0, flexWrap: "wrap" }}>
        {/* dept tiles */}
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${tiles.length}, minmax(140px, 1fr))`,
          gap: 1,
          background: "var(--rule)", border: "1px solid var(--rule)",
          flex: tiles.length > 0 ? "1 1 auto" : 0,
        }}>
          {tiles.map((t, i) => (
            <div key={i} style={{ background: "var(--paper)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-2)" }}>{t.deptName}</div>
              <div className="display num" style={{
                fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1,
                color: t.tone === "warn" ? "var(--warn)" : t.tone === "neg" ? "var(--neg)" : "var(--ink)",
                fontFeatureSettings: '"tnum" 1, "zero" 1',
              }}>{t.value}</div>
              {t.sub && (
                <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.4, marginTop: -2 }}>{t.sub}</div>
              )}
              {t.formula && t.tone === "warn" && (
                <div style={{
                  fontSize: 11.5, color: "var(--warn)", marginTop: "auto", paddingTop: 8,
                  borderTop: "1px dashed var(--rule)", lineHeight: 1.45,
                }}>{t.formula}</div>
              )}
            </div>
          ))}
        </div>

        {/* summary stats */}
        {summary.length > 0 && (
          <div style={{
            display: "flex", alignItems: "stretch",
            borderTop: "1px solid var(--rule)", borderRight: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)",
            background: "var(--paper-2)",
          }}>
            {summary.map((s, i) => (
              <div key={i} style={{
                padding: "16px 22px", display: "flex", flexDirection: "column", gap: 6, minWidth: 130,
                borderLeft: i > 0 ? "1px solid var(--rule)" : "none",
              }}>
                <div className="mono" style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
                  color: "var(--ink-3)", textTransform: "uppercase",
                }}>{s.label}</div>
                <div className="display num" style={{
                  fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1,
                  color: "var(--ink)", fontFeatureSettings: '"tnum" 1',
                }}>{s.value}</div>
                {s.sub && (
                  <div style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4 }}>{s.sub}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =========================================================================
// InputNodeContribution — per-dept stacked bar showing how this node's rate
// stacks alongside the other rate components. Lets users see "what does
// salary contribute to PLAN's $245/hr FBHR?"
//
// Props:
//   eyebrow       "How this contributes to FBHR"
//   model         the engine model
//   highlight     "direct" | "operating" | "cap"   — which segment to emphasize
// =========================================================================
function InputNodeContribution({ eyebrow, model, highlight }) {
  const fbhr = model?.fbhr || {};
  const depts = Object.keys(fbhr).filter(d => fbhr[d]);
  if (depts.length === 0) return null;

  const DEPT_LABELS = { PLAN: "Planning", BLDG: "Building", ENG: "Engineering" };
  const SEG = {
    direct:    { label: "Direct labor",   color: "var(--ink)" },
    operating: { label: "Operating",      color: "var(--ink-2)" },
    cap:       { label: "Cost allocation", color: "var(--accent)" },
  };
  const max = Math.max(...depts.map(d => fbhr[d].fbhr || 0)) || 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {eyebrow && (
        <div className="mono" style={{
          fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>{eyebrow}</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {depts.map(d => {
          const f = fbhr[d];
          const segs = [
            { id: "direct",    val: f.directFBHR },
            { id: "operating", val: f.operatingRate || 0 },
            { id: "cap",       val: f.indirectRate || 0 },
          ];
          const widthPct = (f.fbhr / max) * 100;
          return (
            <div key={d} style={{ display: "grid", gridTemplateColumns: "120px 1fr 100px", gap: 14, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{DEPT_LABELS[d] || d}</div>
                <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}>{d}</div>
              </div>
              <div style={{ position: "relative", width: `${widthPct}%`, minWidth: 60, height: 28, display: "flex", border: "1px solid var(--rule)" }}>
                {segs.map(s => {
                  const segPct = f.fbhr > 0 ? (s.val / f.fbhr) * 100 : 0;
                  const dim = highlight && highlight !== s.id;
                  return s.val > 0 && (
                    <div key={s.id} style={{
                      width: `${segPct}%`, background: SEG[s.id].color,
                      opacity: dim ? 0.25 : 1,
                      borderRight: s.id !== "cap" ? "1px solid rgba(255,255,255,0.25)" : "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "white", fontFamily: "var(--ff-mono)", fontSize: 11, fontWeight: 500,
                    }} title={`${SEG[s.id].label}: $${Math.round(s.val)}/hr (${segPct.toFixed(0)}%)`}>
                      {segPct > 18 ? `$${Math.round(s.val)}` : ""}
                    </div>
                  );
                })}
              </div>
              <div className="num" style={{
                textAlign: "right", fontFamily: "var(--ff-mono)",
                fontSize: 16, fontWeight: 600, color: "var(--accent)",
                fontFeatureSettings: '"tnum" 1',
              }}>${Math.round(f.fbhr)}<span style={{ fontSize: 10, color: "var(--ink-3)", fontWeight: 400 }}>/hr</span></div>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div style={{ display: "flex", gap: 22, fontSize: 11.5, color: "var(--ink-2)", flexWrap: "wrap", paddingTop: 6 }}>
        {["direct", "operating", "cap"].map(id => {
          const dim = highlight && highlight !== id;
          return (
            <div key={id} style={{ display: "flex", alignItems: "center", gap: 7, opacity: dim ? 0.5 : 1 }}>
              <span style={{ width: 10, height: 10, background: SEG[id].color, display: "inline-block" }}/>
              <span>{SEG[id].label}</span>
              {highlight === id && <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: 10.5 }}>· this node</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =========================================================================
// EvidenceDivider — "Supporting evidence" section header. Use it to mark
// the boundary between answer/why/issues and the auditable detail tables.
// =========================================================================
function EvidenceDivider({ children }) {
  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{
        marginBottom: 16,
        paddingTop: 16, borderTop: "1px solid var(--rule)",
      }}/>
    </div>
  );
}

// =========================================================================
// ScheduleImpactHeadline — Fee Schedule's L1 answer.
// Mirrors GapHeadline's typographic shape so the diagnosis (Cost of Service)
// → action (Fee Schedule) flow reads as one continuous report.
//
//   [+$XXk]   [N approved]   [N pending]   [N low conf]
//   revenue                      potential        of N fees
//   impact
//
// Props:
//   approvedImpact, pendingImpact, deferredImpact  — $ amounts
//   approved, pending, deferred                    — counts
//   lowConf, totalFees                             — counts for fourth tile
// =========================================================================
function ScheduleImpactHeadline({ approvedImpact, pendingImpact, approved, pending, deferred, lowConf, totalFees }) {
  const totalImpact = (approvedImpact || 0) + (pendingImpact || 0);
  return (
    <div style={{ paddingBottom: 4 }}>
      <div className="mono" style={{
        fontSize: "var(--t-l4)", fontWeight: "var(--t-l4-w)", letterSpacing: "0.14em",
        color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 10,
      }}>The decision · schedule impact at adoption</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 32, flexWrap: "wrap" }}>
        <div>
          <div className="display num" style={{
            fontSize: "var(--t-l1)", fontWeight: "var(--t-l1-w)", letterSpacing: "-0.025em", lineHeight: 1,
            color: "var(--accent)", fontFeatureSettings: '"tnum" 1, "zero" 1',
          }}>+{fmt.dollarsK(totalImpact)}</div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 8, lineHeight: 1.4 }}>
            annual revenue impact · if all {totalFees} fees adopted
          </div>
        </div>
        <div style={{ width: 1, height: 64, background: "var(--rule)" }}/>
        <div>
          <div className="display num" style={{
            fontSize: "var(--t-l2)", fontWeight: "var(--t-l2-w)", letterSpacing: "-0.02em", lineHeight: 1,
            color: "var(--pos)", fontFeatureSettings: '"tnum" 1',
          }}>{approved}</div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 8 }}>
            approved · {fmt.dollarsK(approvedImpact)} locked
          </div>
        </div>
        <div style={{ width: 1, height: 64, background: "var(--rule)" }}/>
        <div>
          <div className="display num" style={{
            fontSize: "var(--t-l2)", fontWeight: "var(--t-l2-w)", letterSpacing: "-0.02em", lineHeight: 1,
            color: pending > 0 ? "var(--warn)" : "var(--ink)", fontFeatureSettings: '"tnum" 1',
          }}>{pending}</div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 8 }}>
            pending · +{fmt.dollarsK(pendingImpact)} potential
          </div>
        </div>
        {lowConf > 0 && (
          <>
            <div style={{ width: 1, height: 64, background: "var(--rule)" }}/>
            <div>
              <div className="display num" style={{
                fontSize: "var(--t-l3)", fontWeight: "var(--t-l3-w)", letterSpacing: "-0.015em", lineHeight: 1,
                color: "var(--warn)", fontFeatureSettings: '"tnum" 1',
              }}>{lowConf}</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 8, lineHeight: 1.4 }}>
                low confidence · of {totalFees} fees
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

Object.assign(window, {
  GapHeadline, DriverBreakdown, DeptRecoveryChart, FlagStrip, TopFixes,
  AnswerHeader, DeltaVsPrior, AuditTrace, computeFlags,
  InputNodeAnswer, InputNodeContribution, EvidenceDivider,
  ScheduleImpactHeadline,
});
