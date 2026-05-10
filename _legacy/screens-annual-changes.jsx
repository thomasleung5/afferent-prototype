// Annual Update v2 — Cross-model Review Changes + Update Packet
//
// Visual format mirrors Build Model > Fee Schedule v2:
//   - DecisionGravityHeader at top with rolling totals
//   - TableToolbar with filter chips (Queue, Section)
//   - Decision rows: priority dot, change description+id, section chip,
//     confidence badge, prior/current/impact metrics, decision control,
//     chevron expand → DrilldownShell with detail / action / confidence

const { ANNUAL_CHANGES: AC3, RECOVERY_DELTAS: RD3 } = window.AFFERENT_EXT;
const { useState: uSCR, useMemo: uMCR } = React;

// Local primitives (formerly imported from screens-fee-schedule-v2)
function PriorityDot({ p }) {
  const color = p === "high" ? "var(--neg)" : p === "med" ? "var(--warn)" : "var(--ink-3)";
  return <span style={{ display:"inline-block", width: 8, height: 8, borderRadius: "50%", background: color }}/>;
}
function ConfReason({ ok, text }) {
  return (
    <div style={{ display:"flex", alignItems:"flex-start", gap: 6 }}>
      <span style={{ color: ok ? "var(--pos)" : "var(--warn)", fontSize: 11, lineHeight: "16px" }}>{ok ? "✓" : "!"}</span>
      <span>{text}</span>
    </div>
  );
}
function DecisionControl({ status, onSet }) {
  const opts = [
    { k:"accept", label:"Accept" },
    { k:"defer",  label:"Defer" },
    { k:"reject", label:"Reject" },
  ];
  return (
    <div style={{ display:"inline-flex", border:"1px solid var(--rule)", background:"var(--paper)" }}>
      {opts.map((o, i) => {
        const on = status === o.k;
        return (
          <button key={o.k} onClick={() => onSet(o.k)} style={{
            padding:"4px 9px", fontSize: 11, fontWeight: 500,
            color: on ? "var(--ink)" : "var(--ink-3)",
            background: on ? "var(--paper-2)" : "transparent",
            borderRight: i < opts.length - 1 ? "1px solid var(--rule)" : "none",
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

// Map a change row to a section key for chip rendering
function sectionForChange(r) {
  const c = (r.change || "").toLowerCase();
  if (c.includes("salary") || c.includes("benefits") || c.includes("technician") || c.includes("title")) return "SAL";
  if (c.includes("workload") || c.includes("permit volume") || c.includes("permit")) return "WKL";
  if (c.includes("cap") || c.includes("attorney") || c.includes("overhead") || c.includes("insurance") || c.includes("finance")) return "CAP";
  if (c.includes("fee") || c.includes("schedule") || c.includes("recovery")) return "FEE";
  if (c.includes("hours") || c.includes("excluded") || c.includes("long-range")) return "SVC";
  return "OPS";
}
const SECTION_LABEL = { SAL:"Direct Labor", WKL:"Workload", CAP:"Cost Allocation", FEE:"Fee schedule", SVC:"Services", OPS:"Operating" };
const SECTION_NAV   = { SAL:"annual-section-salary", WKL:"annual-section-workload", CAP:"annual-section-cap", FEE:"annual-section-fees", SVC:"annual-section-services", OPS:"annual-section-operating" };

// Priority derived from impact text
function priorityFor(r) {
  const imp = (r.impact || "").toLowerCase();
  const m = imp.match(/[\$−+\-]?\s*([\d.]+)\s*(k|m)?/i);
  if (!m) return "none";
  const n = parseFloat(m[1]) * (/m/i.test(m[2]||"") ? 1000 : (/k/i.test(m[2]||"") ? 1 : 0.001));
  if (n >= 100) return "high";
  if (n >= 20)  return "med";
  if (n > 0)    return "low";
  return "none";
}

// =========================================================================
// Cross-model Review Changes — final reconciliation before generating outputs
// =========================================================================
function ChangeReviewScreen({ onNavSub }) {
  const enriched = uMCR(() => AC3.map(r => ({
    ...r,
    section: sectionForChange(r),
    priority: priorityFor(r),
  })), []);

  const [filter, setFilter] = uSCR("ALL");
  const [sectionFilter, setSectionFilter] = uSCR("ALL");
  const [openId, setOpenId] = uSCR(null);
  const [statusOverrides, setStatusOverrides] = uSCR({});
  const [sortKey, setSortKey] = uSCR(null);
  const [sortDir, setSortDir] = uSCR("desc");
  const onSort = (k) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "change" || k === "section" ? "asc" : "desc"); }
  };
  const setStatus = (id, st) => setStatusOverrides(s => ({ ...s, [id]: st }));

  const totals = uMCR(() => {
    let approved = 0, pending = 0, deferred = 0;
    enriched.forEach(r => {
      const st = statusOverrides[r.id];
      if (st === "approved")      approved++;
      else if (st === "deferred") deferred++;
      else                        pending++;
    });
    return { approved, pending, deferred };
  }, [enriched, statusOverrides]);

  const filterCounts = uMCR(() => ({
    ALL:      enriched.length,
    NEEDS:    enriched.filter(r => !statusOverrides[r.id]).length,
    HIGH:     enriched.filter(r => r.priority === "high").length,
    LOW_CONF: enriched.filter(r => (r.confidence || "").toLowerCase() === "low").length,
    APPROVED: enriched.filter(r => statusOverrides[r.id] === "approved").length,
  }), [enriched, statusOverrides]);

  const filtered = enriched.filter(r => {
    if (sectionFilter !== "ALL" && r.section !== sectionFilter) return false;
    if (filter === "NEEDS")    return !statusOverrides[r.id];
    if (filter === "HIGH")     return r.priority === "high";
    if (filter === "LOW_CONF") return (r.confidence || "").toLowerCase() === "low";
    if (filter === "APPROVED") return statusOverrides[r.id] === "approved";
    return true;
  });

  // Parse impact text ("+$120K", "−$45K", "recovery drift +2 pts") to a sortable number.
  const parseImpact = (s) => {
    const t = (s || "").toLowerCase();
    const m = t.match(/([+−\-])?\s*\$?\s*([\d.]+)\s*(k|m)?/);
    if (!m) return 0;
    const sign = m[1] === "−" || m[1] === "-" ? -1 : 1;
    const mag = /m/.test(m[3] || "") ? 1000 : (/k/.test(m[3] || "") ? 1 : 0.001);
    return sign * parseFloat(m[2]) * mag;
  };

  const sorted = uMCR(() => {
    const arr = [...filtered];
    if (!sortKey) {
      arr.sort((a, b) => {
        const pri = { high: 3, med: 2, low: 1, none: 0 };
        const conf = { low: 3, medium: 2, high: 1 };
        const aScore = pri[a.priority] * 10 + (conf[(a.confidence||"").toLowerCase()] || 0);
        const bScore = pri[b.priority] * 10 + (conf[(b.confidence||"").toLowerCase()] || 0);
        return bScore - aScore;
      });
      return arr;
    }
    const priRank = { none: 0, low: 1, med: 2, high: 3 };
    const confRank = { low: 0, medium: 1, high: 2 };
    const decisionRank = { approved: 2, deferred: 1 }; // pending = 0
    const get = (r) => {
      switch (sortKey) {
        case "priority":   return priRank[r.priority] || 0;
        case "change":     return r.change || "";
        case "section":    return SECTION_LABEL[r.section] || "";
        case "confidence": return confRank[(r.confidence || "").toLowerCase()] || 0;
        case "prior":      return r.prior || "";
        case "current":    return r.current || "";
        case "impact":     return parseImpact(r.impact);
        case "decision":   return decisionRank[statusOverrides[r.id]] || 0;
        default:           return 0;
      }
    };
    arr.sort((a, b) => {
      const va = get(a), vb = get(b);
      let c = 0;
      if (typeof va === "number" && typeof vb === "number") c = va - vb;
      else c = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sortDir === "desc" ? -c : c;
    });
    return arr;
  }, [filtered, sortKey, sortDir, statusOverrides]);

  return (
    <div className="page">

      <DecisionGravityHeader
        eyebrow={<AnnualEyebrow role="Reconciliation" label="Review changes"/>}
        title="What changed this update?"
        headline={`+$472K`}
        headlineSub={
          <>
            Net cost impact across <b>{enriched.length}</b> changes. <b>{totals.approved}</b> approved, <b>{totals.pending}</b> pending review, <b>{totals.deferred}</b> deferred. Blended recovery <b>{RD3.priorBlended}% → {RD3.currentBlended}%</b> ({RD3.deltaPts} pts).
          </>
        }
        decisionStatus={
          totals.pending > 0
            ? { label: `${totals.pending} pending`, sub: "Decisions required before packet" }
            : { label: "Ready for packet", sub: "All changes reviewed" }
        }
      />

      {/* Decision queue — same chrome as Fee Schedule */}
      <div style={{ background:"var(--paper)", border:"1px solid var(--rule)" }}>
        <window.TableToolbar
          title="Change decision queue"
          shownCount={sorted.length}
          totalCount={enriched.length}
          filters={[
            {
              id: "queue", label: "Queue",
              options: [
                { value: "ALL",      label: "All",            count: filterCounts.ALL },
                { value: "NEEDS",    label: "Needs review",   count: filterCounts.NEEDS },
                { value: "HIGH",     label: "High impact",    count: filterCounts.HIGH },
                { value: "LOW_CONF", label: "Low confidence", count: filterCounts.LOW_CONF },
                { value: "APPROVED", label: "Approved",       count: filterCounts.APPROVED },
              ],
              value: filter, onChange: setFilter,
            },
            {
              id: "section", label: "Section",
              options: [
                { value: "ALL", label: "All" },
                { value: "SAL", label: "Direct Labor" },
                { value: "WKL", label: "Workload" },
                { value: "CAP", label: "Cost Allocation" },
                { value: "FEE", label: "Fee schedule" },
                { value: "SVC", label: "Services" },
                { value: "OPS", label: "Operating" },
              ],
              value: sectionFilter, onChange: setSectionFilter,
            },
          ]}
        />

        {(() => {
          const HCOLS = [
            { key: "priority",   label: "Pri.",     align: "left",  sortable: true,  title: "Priority based on cost impact" },
            { key: "change",     label: "Change",   align: "left",  sortable: true },
            { key: "section",    label: "Section",  align: "left",  sortable: true },
            { key: "prior",      label: "Prior",    align: "right", sortable: true },
            { key: "current",    label: "Current",  align: "right", sortable: true },
            { key: "impact",     label: "Impact",   align: "right", sortable: true },
            { key: "decision",   label: "Decision", align: "right", sortable: true },
            { key: "_chev",      label: "",         align: "right", sortable: false },
          ];
          return (
            <div style={{
              display:"grid",
              gridTemplateColumns:"40px minmax(260px, 2fr) 150px 100px 100px 140px 190px 28px",
              padding:"10px 14px", background:"var(--paper-2)",
              borderBottom:"1px solid var(--rule-strong)",
              fontFamily:"var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
              letterSpacing:"0.08em", color:"var(--ink-3)", textTransform:"uppercase",
              alignItems:"end",
            }}>
              {HCOLS.map(c => {
                const isSorted = sortKey === c.key;
                return (
                  <div key={c.key}
                    title={c.title}
                    onClick={c.sortable ? () => onSort(c.key) : undefined}
                    style={{
                      cursor: c.sortable ? "pointer" : "default",
                      color: isSorted ? "var(--ink)" : "var(--ink-3)",
                      userSelect: "none",
                      display: "flex",
                      justifyContent: c.align === "right" ? "flex-end" : "flex-start",
                      alignItems: "baseline",
                    }}>
                    <span>{c.label}</span>
                    {c.sortable && (isSorted
                      ? <span style={{ marginLeft: 4, color: "var(--accent)", fontSize: 10, fontWeight: 700 }}>{sortDir === "asc" ? "▴" : "▾"}</span>
                      : <span style={{ marginLeft: 4, opacity: 0.25, fontSize: 9 }}>▴▾</span>)}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {sorted.map(r => {
          const open = openId === r.id;
          const status = statusOverrides[r.id];
          const isApproved = status === "approved";
          const isDeferred = status === "deferred";
          const impactColor = r.impact.startsWith("+") ? "var(--neg)" : r.impact.startsWith("−") || r.impact.startsWith("-") ? "var(--pos)" : "var(--ink-2)";
          const confLevel = (r.confidence || "").toLowerCase() === "high" ? "high" : (r.confidence || "").toLowerCase() === "medium" ? "med" : "low";
          return (
            <React.Fragment key={r.id}>
              <div style={{
                display:"grid",
                gridTemplateColumns:"40px minmax(260px, 2fr) 150px 100px 100px 140px 190px 28px",
                padding:"10px 14px", borderBottom:"1px solid var(--rule)",
                alignItems:"center", gap: 0,
                background: open ? "var(--paper-2)" : isApproved ? "oklch(98% 0.015 155)" : isDeferred ? "var(--paper-2)" : "transparent",
                opacity: isDeferred ? 0.65 : 1,
                cursor:"pointer",
              }} onClick={() => setOpenId(open ? null : r.id)}>
                <div style={{ display:"flex", alignItems:"center", gap: 6 }}>
                  <PriorityDot p={r.priority}/>
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{r.change}</div>
                  <div style={{ marginTop: 3 }}>
                    <span className="mono" style={{ fontSize: 10.5, color:"var(--ink-3)" }}>{r.id} · {r.affected}</span>
                  </div>
                </div>
                <div>
                  <span className="mono" style={{
                    fontSize: 10, fontWeight: 700, letterSpacing:"0.06em",
                    padding:"3px 7px", border:"1px solid var(--rule)",
                    background:"var(--paper)", color:"var(--ink-2)",
                  }}>{SECTION_LABEL[r.section]}</span>
                </div>
                <div className="mono num" style={{ textAlign:"right", fontSize: 11.5, color:"var(--ink-3)" }}>{r.prior}</div>
                <div className="mono num" style={{ textAlign:"right", fontSize: 11.5 }}>{r.current}</div>
                <div className="num" style={{ textAlign:"right", fontSize: 13, fontWeight: 600, color: impactColor }}>
                  {r.impact}
                </div>
                <div onClick={(e) => e.stopPropagation()} style={{ display:"flex", justifyContent:"flex-end" }}>
                  <DecisionControl status={status} onSet={(st) => setStatus(r.id, st)}/>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{
                    display: "inline-block", fontSize: 9, color: open ? "var(--accent)" : "var(--ink-3)",
                    transform: open ? "rotate(90deg)" : "none",
                    transition: "transform 100ms",
                    fontFamily: "var(--ff-mono)", lineHeight: 1,
                  }}>▶</span>
                </div>
              </div>

              {open && (
                <DrilldownShell isLast={false}>
                  <DrilldownColumn marker="①" title="Change detail">
                    <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                      <div style={{ fontWeight: 500 }}>{r.change}</div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                        Affects: {r.affected}
                      </div>
                      <div style={{
                        marginTop: 10, padding:"8px 10px",
                        background:"var(--paper)", border:"1px solid var(--rule)",
                        fontFamily:"var(--ff-mono)", fontSize: 11.5, lineHeight: 1.7,
                      }}>
                        <div style={{ color:"var(--ink-3)" }}>prior:   <span style={{ color:"var(--ink)" }}>{r.prior}</span></div>
                        <div style={{ color:"var(--ink-3)" }}>current: <span style={{ color:"var(--ink)" }}>{r.current}</span></div>
                        <div style={{ borderTop:"1px solid var(--rule)", marginTop: 4, paddingTop: 4, color: impactColor, fontWeight: 600 }}>
                          impact:  {r.impact}
                        </div>
                      </div>
                    </div>
                  </DrilldownColumn>

                  <DrilldownColumn marker="②" title="Recommended action">
                    <div style={{ display:"flex", flexDirection:"column", gap: 10 }}>
                      <div style={{ fontSize: 13, lineHeight: 1.6, color:"var(--ink-2)" }}>
                        {r.action}
                      </div>
                      <div>
                        <StatusPill kind={statusKindFor(r.badge)}>{r.badge}</StatusPill>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); onNavSub(SECTION_NAV[r.section]); }} style={{
                        marginTop: 6, alignSelf:"flex-start",
                        fontSize: 11.5, color:"var(--accent)", textDecoration:"underline", textUnderlineOffset: 3,
                        cursor:"pointer", background:"transparent",
                      }}>Open {SECTION_LABEL[r.section]} section →</button>
                    </div>
                  </DrilldownColumn>

                  <DrilldownColumn marker="③" title="Confidence & source">
                    <div style={{ display:"flex", flexDirection:"column", gap: 6, fontSize: 11.5, color:"var(--ink-2)" }}>
                      <ConfReason
                        ok={(r.confidence || "").toLowerCase() === "high"}
                        text={`Source confidence: ${r.confidence || "—"}`}
                      />
                      <ConfReason
                        ok={!/legal|low/i.test(r.badge || "")}
                        text={/legal/i.test(r.badge || "") ? "Legal review required before adoption" : /low confidence/i.test(r.badge || "") ? "Low confidence — verify mapping" : "No outstanding review flags"}
                      />
                      <ConfReason
                        ok={!r.impact.toLowerCase().startsWith("recovery drift")}
                        text={r.impact.toLowerCase().startsWith("recovery drift") ? "Drift accumulates if fees held flat" : "Direct cost impact recomputed"}
                      />
                    </div>
                    <div style={{ marginTop: 10, fontSize: 10.5, color:"var(--ink-3)", lineHeight: 1.5 }}>
                      Trace this row back to its section to see the underlying inputs and downstream services.
                    </div>
                  </DrilldownColumn>
                </DrilldownShell>
              )}
            </React.Fragment>
          );
        })}

        {sorted.length === 0 && (
          <div style={{ padding:"40px 20px", textAlign:"center", color:"var(--ink-3)", fontSize: 12.5 }}>
            No changes match current filters.
          </div>
        )}
      </div>

    </div>
  );
}

// =========================================================================
// Update Packet (kept from prior version)
// =========================================================================
function AnnualPacketScreen({ onNavSub }) {
  const sections = [
    "Executive summary",
    "What changed from last year",
    "Section-by-section review log",
    "Assumptions reused",
    "Assumptions modified",
    "Recovery % delta",
    "Recovery drift delta",
    "Top cost drivers",
    "Top fee schedule impacts",
    "Confidence levels",
    "Items requiring legal or Council review",
  ];
  return (
    <div className="page">
      <PageHeader
        eyebrow={<AnnualEyebrow role="Output" label="Update packet"/>}
        title="Annual update packet"
        subtitle="Council outputs assembled from the model run. Traceable to source."
        actions={<>
          <Btn kind="ghost"><Icon name="download" size={13}/> Export staff report</Btn>
          <Btn kind="primary"><Icon name="download" size={13}/> Export packet</Btn>
        </>}
      />

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap: 20, alignItems:"flex-start" }}>
        <div style={{ background:"var(--paper)", border:"1px solid var(--rule)", padding: 22 }}>
          <SectionLabel>Packet sections</SectionLabel>
          {sections.map((s, i) => (
            <div key={i} style={{ display:"grid", gridTemplateColumns:"24px 1fr auto", gap: 12, padding:"10px 0", borderBottom: i < sections.length-1 ? "1px dashed var(--rule)" : "none", alignItems:"center" }}>
              <div className="mono" style={{ fontSize: 11, color:"var(--ink-3)" }}>{String(i+1).padStart(2,"0")}</div>
              <div style={{ fontSize: 13 }}>{s}</div>
              <Icon name="check" size={12} color="var(--pos)"/>
            </div>
          ))}
        </div>
        <div style={{ background:"oklch(98% 0.005 75)", border:"1px solid var(--rule)", padding: 28, fontFamily:"Georgia, serif" }}>
          <div className="mono" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing:"0.12em", textTransform:"uppercase", color:"var(--ink-3)", marginBottom: 14, fontFamily:"var(--ff-mono)" }}>
            Preview · Annual Fee Update
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.25, letterSpacing:"-0.01em", color:"var(--ink)" }}>
            FY 2026-27 Annual Cost Recovery Update
          </div>
          <div style={{ fontSize: 13, color:"var(--ink-3)", marginTop: 6, marginBottom: 18 }}>Town of Los Altos Hills · Finance Department</div>
          <div style={{ fontSize: 13.5, color:"var(--ink-2)", lineHeight: 1.7, textWrap:"pretty" }}>
            The FY 2026-27 update reuses the locked FY 2025-26 baseline model. Annual inputs were refreshed for budget, salary, FTE, CAP allocations, workload, and the current fee schedule. Across seven section reviews, 29 items were resolved and confirmed. Blended development services cost recovery declined from 72% to 64%, primarily driven by an 8.5% increase in Planning salary and benefits and a 6% decline in Building permit volume.
            <br/><br/>
            Staff recommends Council adopt the recommended fees in Appendix A. Fees are calculated at the maximum cost-based amount; Council may adopt a lower fee for policy reasons. Costs associated with broad public benefit or policy work have been excluded where appropriate.
          </div>
          <div style={{ marginTop: 18, display:"flex", gap: 8, fontFamily:"var(--ff-ui)" }}>
            <Btn kind="ghost" style={{ height: 26, fontSize: 11.5 }}>Fee schedule</Btn>
            <Btn kind="ghost" style={{ height: 26, fontSize: 11.5 }}>Public Q&A</Btn>
            <Btn kind="ghost" style={{ height: 26, fontSize: 11.5 }}>Methodology</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ChangeReviewScreen, AnnualPacketScreen });
