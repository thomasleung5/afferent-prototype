
import { useEffect, useMemo, useState } from "react";
import { useBuildState } from "@/lib/store";
import { buildExportPayload, type ExportPayload } from "@/lib/export/buildPayload";
import { exportFeeStudyXlsx, downloadBlob } from "@/lib/export/excel";
import { fmt } from "@/lib/format";
import { Btn, Icon } from "@/components/ui";

export default function FeeStudyExportPage() {
  const state = useBuildState();
  const payload = useMemo<ExportPayload>(() => buildExportPayload({
    positions:    state.positions,
    operating:    state.operating,
    capPools:     state.capPools,
    workload:     state.workload,
    services:     state.services,
    policyTargets: state.policyTargets,
    policyExceptions: state.policyExceptions,
    pendingReview: state.pendingReview,
    lineage:      state.lineage,
    derived:      state.derived,
  }), [state]);

  return (
    <>
      <PrintStyles/>
      <Toolbar payload={payload}/>
      <Report payload={payload}/>
    </>
  );
}

/** Print stylesheet — kept inline so the route is self-contained. */
function PrintStyles() {
  return (
    <style>{`
      @page { size: letter portrait; margin: 0.6in 0.6in 0.7in 0.6in; }
      @media print {
        body { background: white !important; }
        .no-print { display: none !important; }
        .report { padding: 0 !important; }
        .section { break-inside: avoid; }
        .section-break { break-before: page; }
        .row { break-inside: avoid; }
        table { break-inside: auto; }
        thead { display: table-header-group; }
        tr, td, th { break-inside: avoid; }
      }
      .report {
        max-width: 7.4in;
        margin: 0 auto;
        background: white;
        padding: 32px 32px 48px;
        color: var(--ink);
        font-family: var(--ff-ui), "IBM Plex Sans", system-ui, sans-serif;
      }
      .report h1, .report h2, .report h3 { letter-spacing: -0.01em; }
      .report .eyebrow {
        font-family: var(--ff-mono);
        font-size: 10px; font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--ink-3);
      }
      .report .title { font-size: 24px; font-weight: 600; line-height: 1.15; }
      .report .h2 { font-size: 16px; font-weight: 600; margin: 0 0 10px; }
      .report .h3 { font-size: 13px; font-weight: 600; margin: 0 0 6px; }
      .report .body { font-size: 12.5px; color: var(--ink-2); line-height: 1.55; }
      .report table { width: 100%; border-collapse: collapse; font-size: 11px; }
      .report th, .report td { padding: 6px 8px; text-align: left; vertical-align: top; }
      .report th {
        font-family: var(--ff-mono);
        font-size: 9.5px; font-weight: 700; letter-spacing: 0.08em;
        text-transform: uppercase; color: var(--ink-3);
        border-bottom: 1px solid var(--rule-strong);
        background: var(--paper-2);
      }
      .report td { border-bottom: 1px solid var(--rule); }
      .report td.num, .report th.num { text-align: right; font-variant-numeric: tabular-nums; }
      .report .total td {
        border-top: 1.5px solid var(--ink);
        border-bottom: none;
        background: var(--paper-2);
        font-weight: 600;
      }
      .report .mono { font-family: var(--ff-mono); }
    `}</style>
  );
}

function Toolbar({ payload }: { payload: ExportPayload }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="no-print" style={{
      position: "sticky", top: 0, zIndex: 20,
      background: "var(--paper)",
      borderBottom: "1px solid var(--rule)",
      padding: "10px 24px",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div className="mono" style={{
          fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>Export · Print preview</div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {payload.cover.cityName} · {payload.cover.fiscal} fee study
        </div>
      </div>
      <div style={{ flex: 1 }}/>
      <Btn kind="ghost" onClick={() => window.close()}>Close</Btn>
      <Btn
        kind="ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const blob = await exportFeeStudyXlsx(payload);
            downloadBlob(blob, `${slugCity(payload.cover.cityName)}-fee-study.xlsx`);
          } finally { setBusy(false); }
        }}
      >
        <Icon name="download" size={13}/> {busy ? "Generating…" : "Excel"}
      </Btn>
      <Btn kind="primary" onClick={() => window.print()}>
        <Icon name="download" size={13}/> Print / Save PDF
      </Btn>
    </div>
  );
}

function slugCity(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Auto-fire window.print on first load if the URL has ?print=1. */
function useAutoPrint() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("print") === "1") {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, []);
}

function Report({ payload }: { payload: ExportPayload }) {
  useAutoPrint();
  return (
    <div className="report">
      <Cover payload={payload}/>
      <ExecutiveSummary payload={payload}/>
      <Methodology payload={payload}/>
      <Assumptions payload={payload}/>
      <DepartmentSummaries payload={payload}/>
      <FeeScheduleSection payload={payload}/>
      <CostOfServiceSection payload={payload}/>
      <RecoveryPolicySection payload={payload}/>
      <RecommendationsSection payload={payload}/>
      <BenchmarkSection payload={payload}/>
      <ReviewFlagsSection payload={payload}/>
    </div>
  );
}

// ============================================================================
// Sections
// ============================================================================

function Cover({ payload }: { payload: ExportPayload }) {
  return (
    <section className="section" style={{
      paddingTop: 60, paddingBottom: 32,
      borderBottom: "1px solid var(--rule)",
      marginBottom: 36,
    }}>
      <div className="eyebrow">{payload.cover.cityName}</div>
      <div className="title display" style={{ fontSize: 32, marginTop: 6 }}>
        Development Services Fee Study
      </div>
      <div style={{ fontSize: 14, color: "var(--ink-2)", marginTop: 12 }}>
        Cost of Service · Recovery Policy · Recommended Fee Schedule
      </div>

      <div style={{
        marginTop: 36,
        display: "grid", gridTemplateColumns: "140px 1fr",
        gap: "6px 16px", fontSize: 12.5,
      }}>
        <Label>Fiscal year</Label>     <Value>{payload.cover.fiscal}</Value>
        <Label>Prepared by</Label>     <Value>{payload.cover.preparedBy}</Value>
        <Label>Peer cities</Label>     <Value>{payload.cover.peers.join(" · ")}</Value>
        <Label>Generated</Label>       <Value>{new Date(payload.cover.generatedAt).toLocaleString()}</Value>
      </div>
    </section>
  );
}

function ExecutiveSummary({ payload }: { payload: ExportPayload }) {
  const s = payload.summary;
  return (
    <section className="section" style={{ marginBottom: 36 }}>
      <div className="eyebrow">Section 1</div>
      <h2 className="h2">Executive summary</h2>
      <div className="body" style={{ maxWidth: 600 }}>
        {payload.cover.cityName} currently recovers <b>{fmt.dollarsK(s.currentRevenue)}/yr</b> against{" "}
        <b>{fmt.dollarsK(s.totalCost)}/yr</b> in calculated cost of service — a{" "}
        <b>{s.recoveryPct.toFixed(0)}%</b> recovery rate and an annual gap of{" "}
        <b>{fmt.dollarsK(s.recoveryGap)}</b>. Applying the recommended fee schedule
        with adopted recovery targets would raise an additional{" "}
        <b>{fmt.dollarsK(s.potentialUplift)}/yr</b>.
      </div>

      <div style={{
        marginTop: 18,
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0,
        border: "1px solid var(--rule)",
      }}>
        <Tile label="Services modeled"  value={s.services.toString()}/>
        <Tile label="FTE"               value={s.fte.toFixed(1)}/>
        <Tile label="Current recovery"  value={`${s.recoveryPct.toFixed(0)}%`} tone={s.recoveryPct >= 80 ? "pos" : s.recoveryPct >= 50 ? "warn" : "neg"}/>
        <Tile label="Annual gap"        value={fmt.dollarsK(s.recoveryGap)} tone="neg" last/>
        <Tile label="Intended (policy)" value={`${s.intendedRecoveryPct.toFixed(0)}%`}/>
        <Tile label="Annual subsidy"    value={fmt.dollarsK(s.annualSubsidy)} tone="warn"/>
        <Tile label="Potential uplift"  value={fmt.dollarsK(s.potentialUplift)} tone="pos"/>
        <Tile label="Total cost"        value={fmt.dollarsK(s.totalCost)} last/>
      </div>
    </section>
  );
}

function Methodology({ payload }: { payload: ExportPayload }) {
  return (
    <section className="section section-break" style={{ marginBottom: 36 }}>
      <div className="eyebrow">Section 2</div>
      <h2 className="h2">Methodology</h2>
      {payload.methodology.map((m) => (
        <div key={m.heading} className="row" style={{ marginBottom: 14 }}>
          <h3 className="h3">{m.heading}</h3>
          <div className="body">{m.body}</div>
        </div>
      ))}
    </section>
  );
}

function Assumptions({ payload }: { payload: ExportPayload }) {
  return (
    <section className="section" style={{ marginBottom: 36 }}>
      <div className="eyebrow">Section 3</div>
      <h2 className="h2">Assumptions</h2>
      <table>
        <thead><tr><th style={{ width: "30%" }}>Item</th><th>Value</th></tr></thead>
        <tbody>
          {payload.assumptions.map((a) => (
            <tr key={a.label}>
              <td style={{ color: "var(--ink-2)" }}>{a.label}</td>
              <td>{a.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function DepartmentSummaries({ payload }: { payload: ExportPayload }) {
  return (
    <section className="section section-break" style={{ marginBottom: 36 }}>
      <div className="eyebrow">Section 4</div>
      <h2 className="h2">Department summaries</h2>
      <div className="body" style={{ marginBottom: 14, maxWidth: 600 }}>
        Direct labor + operating + cost allocation, applied to productive hours, yields
        the Fully Burdened Hourly Rate (FBHR) per department. FBHR × service hours = unit cost.
      </div>
      <table>
        <thead>
          <tr>
            <th>Department</th>
            <th className="num">Positions</th>
            <th className="num">FTE</th>
            <th className="num">Direct $/hr</th>
            <th className="num">Op $/hr</th>
            <th className="num">CAP $/hr</th>
            <th className="num">FBHR</th>
            <th className="num">Total cost</th>
            <th className="num">Recovery</th>
            <th className="num">Target</th>
          </tr>
        </thead>
        <tbody>
          {payload.deptSummaries.map((d) => (
            <tr key={d.dept}>
              <td><b>{d.deptName}</b><span className="mono" style={{ color: "var(--ink-3)", marginLeft: 6, fontSize: 10 }}>{d.dept}</span></td>
              <td className="num">{d.positions}</td>
              <td className="num">{d.fte.toFixed(1)}</td>
              <td className="num">${Math.round(d.directRate)}</td>
              <td className="num">${Math.round(d.operatingRate)}</td>
              <td className="num">${Math.round(d.capRate)}</td>
              <td className="num"><b style={{ color: "var(--accent)" }}>${Math.round(d.fbhr)}</b></td>
              <td className="num">{fmt.dollarsK(d.totalCost)}</td>
              <td className="num"><b>{d.recoveryPct.toFixed(0)}%</b></td>
              <td className="num" style={{ color: "var(--ink-3)" }}>{d.target}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function FeeScheduleSection({ payload }: { payload: ExportPayload }) {
  return (
    <section className="section section-break" style={{ marginBottom: 36 }}>
      <div className="eyebrow">Section 5</div>
      <h2 className="h2">Recommended fee schedule</h2>
      <div className="body" style={{ marginBottom: 14, maxWidth: 600 }}>
        Each fee is shown with its calculated cost and the recommended fee that would
        achieve the recovery target. Annual uplift = (recommended − current) × annual volume.
      </div>
      <table>
        <thead>
          <tr>
            <th>Fee item</th>
            <th>Dept</th>
            <th className="num">Hours</th>
            <th className="num">Volume</th>
            <th className="num">Current</th>
            <th className="num">Cost</th>
            <th className="num">Recommended</th>
            <th className="num">Target</th>
            <th className="num">Recovery</th>
            <th className="num">Annual uplift</th>
          </tr>
        </thead>
        <tbody>
          {payload.feeSchedule.map((r) => (
            <tr key={r.id}>
              <td>
                <div>{r.name}</div>
                <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-3)", marginTop: 2 }}>{r.id}</div>
              </td>
              <td><span className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>{r.dept}</span></td>
              <td className="num">{r.hours}</td>
              <td className="num">{fmt.int(r.volume)}</td>
              <td className="num">{fmt.dollars(r.fee)}</td>
              <td className="num">{fmt.dollars(r.unitCost)}</td>
              <td className="num"><b style={{ color: "var(--accent)" }}>{fmt.dollars(r.recommended)}</b></td>
              <td className="num">{r.target}%</td>
              <td className="num">{r.recoveryPct.toFixed(0)}%</td>
              <td className="num" style={{ color: r.uplift > 0 ? "var(--pos)" : r.uplift < 0 ? "var(--neg)" : "var(--ink-3)" }}>
                <b>{r.uplift > 0 ? "+" : ""}{fmt.dollarsK(r.uplift)}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function CostOfServiceSection({ payload }: { payload: ExportPayload }) {
  const totalCost = payload.costOfService.reduce((a, c) => a + c.annualCost, 0);
  const totalRev = payload.costOfService.reduce((a, c) => a + c.annualRevenue, 0);
  return (
    <section className="section section-break" style={{ marginBottom: 36 }}>
      <div className="eyebrow">Section 6</div>
      <h2 className="h2">Cost of service</h2>
      <div className="body" style={{ marginBottom: 14, maxWidth: 600 }}>
        Per-service annual cost is hours × FBHR × volume. Current revenue is the adopted
        fee × volume. The difference is the annual recovery gap per service.
      </div>
      <table>
        <thead>
          <tr>
            <th>Service</th>
            <th>Dept</th>
            <th className="num">Hours</th>
            <th className="num">FBHR</th>
            <th className="num">Unit cost</th>
            <th className="num">Volume</th>
            <th className="num">Annual cost</th>
            <th className="num">Annual revenue</th>
          </tr>
        </thead>
        <tbody>
          {payload.costOfService.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td><span className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>{r.dept}</span></td>
              <td className="num">{r.hours}</td>
              <td className="num">${Math.round(r.fbhr)}</td>
              <td className="num">{fmt.dollars(r.unitCost)}</td>
              <td className="num">{fmt.int(r.volume)}</td>
              <td className="num"><b>{fmt.dollarsK(r.annualCost)}</b></td>
              <td className="num">{fmt.dollarsK(r.annualRevenue)}</td>
            </tr>
          ))}
          <tr className="total">
            <td colSpan={6}><span className="mono" style={{ color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 9.5 }}>Citywide</span></td>
            <td className="num">{fmt.dollarsK(totalCost)}</td>
            <td className="num">{fmt.dollarsK(totalRev)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function RecoveryPolicySection({ payload }: { payload: ExportPayload }) {
  const { targets, exceptions, impact } = payload.policy;
  return (
    <section className="section section-break" style={{ marginBottom: 36 }}>
      <div className="eyebrow">Section 7</div>
      <h2 className="h2">Recovery policy</h2>

      <h3 className="h3" style={{ marginTop: 14 }}>Department targets</h3>
      <table>
        <thead><tr><th>Department</th><th className="num">Target</th><th>Notes</th></tr></thead>
        <tbody>
          {targets.map((t) => (
            <tr key={t.id}>
              <td><span className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>{t.dept}</span></td>
              <td className="num"><b>{t.target}%</b></td>
              <td style={{ color: "var(--ink-2)" }}>{t.note}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {exceptions.length > 0 && (
        <>
          <h3 className="h3" style={{ marginTop: 18 }}>Fee exceptions</h3>
          <table>
            <thead><tr><th>Fee</th><th className="num">Target</th><th>Notes</th></tr></thead>
            <tbody>
              {exceptions.map((e) => (
                <tr key={e.id}>
                  <td>{e.fee}</td>
                  <td className="num"><b>{e.target}%</b></td>
                  <td style={{ color: "var(--ink-2)" }}>{e.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3 className="h3" style={{ marginTop: 18 }}>Policy impact</h3>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0,
        border: "1px solid var(--rule)",
      }}>
        <Tile label="Overall intended recovery" value={`${Math.round(impact.overallPct)}%`}/>
        <Tile label="Annual subsidy" value={fmt.dollarsK(impact.subsidy)} tone="warn"/>
        <Tile label="Recoverable gap" value={fmt.dollarsK(impact.recoverableGap)} tone="pos" last/>
      </div>
    </section>
  );
}

function RecommendationsSection({ payload }: { payload: ExportPayload }) {
  const recs = payload.recommendations.filter((r) => r.priority !== "none").slice(0, 25);
  return (
    <section className="section section-break" style={{ marginBottom: 36 }}>
      <div className="eyebrow">Section 8</div>
      <h2 className="h2">Recommendations</h2>
      <div className="body" style={{ marginBottom: 14, maxWidth: 600 }}>
        Ranked by annual revenue opportunity. High-priority recommendations are
        fees where the gap exceeds <b>$25K/yr</b>. Confidence reflects the quality
        of the underlying volume, hours, and recovery inputs.
      </div>
      <table>
        <thead>
          <tr>
            <th>Priority</th>
            <th>Service</th>
            <th>Dept</th>
            <th className="num">Current</th>
            <th className="num">Recommended</th>
            <th className="num">Uplift</th>
            <th>Confidence</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {recs.map((r) => (
            <tr key={r.id}>
              <td>
                <span style={{
                  display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                  marginRight: 6, verticalAlign: "middle",
                  background:
                    r.priority === "high" ? "var(--neg)" :
                    r.priority === "med"  ? "var(--warn)" :
                    "var(--ink-3)",
                }}/>
                <span style={{ fontSize: 11, color: "var(--ink-2)" }}>
                  {r.priority.toUpperCase()}
                </span>
              </td>
              <td>
                <div>{r.name}</div>
                {r.rationale[0] && (
                  <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}>
                    {r.rationale[0]}
                  </div>
                )}
              </td>
              <td><span className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>{r.dept}</span></td>
              <td className="num">{fmt.dollars(r.fee)}</td>
              <td className="num"><b style={{ color: "var(--accent)" }}>{fmt.dollars(r.recommended)}</b></td>
              <td className="num"><b style={{ color: "var(--pos)" }}>+{fmt.dollarsK(r.uplift)}</b></td>
              <td><span className="mono" style={{ fontSize: 10 }}>{r.confidence.toUpperCase()}</span></td>
              <td style={{ color: "var(--ink-2)" }}>{r.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function BenchmarkSection({ payload }: { payload: ExportPayload }) {
  if (payload.benchmarks.length === 0) {
    return null;
  }
  return (
    <section className="section section-break" style={{ marginBottom: 36 }}>
      <div className="eyebrow">Section 9</div>
      <h2 className="h2">Benchmark references</h2>
      <div className="body" style={{ marginBottom: 14, maxWidth: 600 }}>
        Adopted fees in peer cities for the same services, with the variance vs. the
        peer median. Peer fees are listed prices and may understate full cost recovery.
      </div>
      <table>
        <thead>
          <tr>
            <th>Service</th>
            <th>Dept</th>
            <th className="num">Our fee</th>
            <th className="num">Peer median</th>
            <th className="num">vs median</th>
            <th className="num">vs cost</th>
          </tr>
        </thead>
        <tbody>
          {payload.benchmarks.map((b) => (
            <tr key={b.id}>
              <td>{b.name}</td>
              <td><span className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>{b.dept}</span></td>
              <td className="num">{fmt.dollars(b.fee)}</td>
              <td className="num">{fmt.dollars(b.peerMedian)}</td>
              <td className="num" style={{ color: b.varianceVsMedian > 5 ? "var(--neg)" : b.varianceVsMedian < -5 ? "var(--warn)" : "var(--pos)" }}>
                {b.varianceVsMedian > 0 ? "+" : ""}{Math.round(b.varianceVsMedian)}%
              </td>
              <td className="num" style={{ color: b.varianceVsCost < -10 ? "var(--neg)" : "var(--ink)" }}>
                {b.varianceVsCost > 0 ? "+" : ""}{Math.round(b.varianceVsCost)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ReviewFlagsSection({ payload }: { payload: ExportPayload }) {
  const total = payload.reviewFlags.reduce((a, f) => a + f.count, 0);
  return (
    <section className="section section-break" style={{ marginBottom: 36 }}>
      <div className="eyebrow">Section 10</div>
      <h2 className="h2">Review flags &amp; caveats</h2>
      {total === 0 ? (
        <div className="body">
          No outstanding review items — every imported row was auto-mapped, and every
          fee passed defensibility checks (hours present, volume present, recovery in
          plausible range).
        </div>
      ) : (
        <>
          <div className="body" style={{ marginBottom: 14, maxWidth: 600 }}>
            {total} import row{total === 1 ? "" : "s"} did not auto-map. These are
            preserved here for transparency; numbers in the report use the current
            model state (manually mapped, if applicable).
          </div>
          <table>
            <thead>
              <tr>
                <th>Domain</th>
                <th className="num">Count</th>
                <th>Sample unmapped row</th>
              </tr>
            </thead>
            <tbody>
              {payload.reviewFlags.map((f) => {
                const sample = f.unmapped[0];
                const raw = sample?.raw.filter(Boolean).slice(0, 5).join(" · ");
                return (
                  <tr key={f.domain}>
                    <td><b>{f.label}</b></td>
                    <td className="num">{f.count}</td>
                    <td style={{ color: "var(--ink-3)", fontSize: 10.5 }}>{raw ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

// ============================================================================
// Small helpers
// ============================================================================

function Tile({
  label, value, tone, last,
}: { label: string; value: string; tone?: "pos" | "neg" | "warn"; last?: boolean }) {
  const color =
    tone === "pos" ? "var(--pos)" :
    tone === "neg" ? "var(--neg)" :
    tone === "warn" ? "var(--warn)" :
    "var(--ink)";
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
      <div className="num" style={{
        fontSize: 20, fontWeight: 600, color, letterSpacing: "-0.01em",
      }}>{value}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono" style={{
      fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
      color: "var(--ink-3)", textTransform: "uppercase",
    }}>{children}</div>
  );
}

function Value({ children }: { children: React.ReactNode }) {
  return <div style={{ color: "var(--ink-2)" }}>{children}</div>;
}
