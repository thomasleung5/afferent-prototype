
import { useEffect, useMemo, useState } from "react";
import { useBuildState } from "@/lib/store";
import { fmt } from "@/lib/format";
import { Btn, Icon } from "@/components/ui";
import { capAllocatedFromGl, type GlNode, type GlStepDownModel } from "@/lib/data/capStepDownGl";
import { basisForPool } from "@/lib/data/capStepDown";
import { exportCapXlsx, type CapExportPayload } from "@/lib/export/capExcel";
import { downloadBlob } from "@/lib/export/excel";

export default function CapAllocationExportPage() {
  const state = useBuildState();

  const payload = useMemo<CapExportPayload>(() => ({
    cityName: "Town of Los Altos Hills",
    fiscal: "FY 2025-26",
    generatedAt: new Date().toISOString(),
    capPools: state.capPools,
    allocationBases: state.allocationBases,
    capCenterTotals: state.capCenterTotals,
    capCenterDisallowed: state.capCenterDisallowed,
    capCenterOrder: state.capCenterOrder,
    model: state.derived.capStepDown,
    fbhrRollup: capAllocatedFromGl(state.derived.capStepDown),
  }), [state]);

  return (
    <>
      <PrintStyles/>
      <Toolbar payload={payload}/>
      <Report payload={payload}/>
    </>
  );
}

function PrintStyles() {
  return (
    <style>{`
      @page { size: letter portrait; margin: 0.55in 0.55in 0.7in 0.55in; }
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
        .center-block { break-before: page; }
        .center-block:first-of-type { break-before: auto; }
        .pool-block { break-inside: avoid-page; }
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
      .report th, .report td { padding: 5px 8px; text-align: left; vertical-align: top; }
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
      .report .dim { color: var(--ink-4); }
      .report .section-label {
        font-family: var(--ff-mono);
        font-size: 9.5px; font-weight: 700; letter-spacing: 0.14em;
        color: var(--ink-3); text-transform: uppercase;
        background: var(--paper-2);
        padding: 4px 8px;
      }
    `}</style>
  );
}

function Toolbar({ payload }: { payload: CapExportPayload }) {
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
          {payload.cityName} · {payload.fiscal} cost allocation plan
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
            const blob = await exportCapXlsx(payload);
            downloadBlob(blob, `${slugCity(payload.cityName)}-cost-allocation-plan.xlsx`);
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

function Report({ payload }: { payload: CapExportPayload }) {
  useAutoPrint();
  return (
    <div className="report">
      <Cover payload={payload}/>
      <MethodologySection/>
      <CostCenters payload={payload}/>
      <AllocationBasesSection payload={payload}/>
      <CostPools payload={payload}/>
      <AllocationByCenter payload={payload}/>
      <FbhrRollup payload={payload}/>
    </div>
  );
}

// ============================================================================
// Sections
// ============================================================================

function Cover({ payload }: { payload: CapExportPayload }) {
  const totalGross = Object.values(payload.capCenterTotals).reduce((a, v) => a + v, 0);
  const totalDis = Object.values(payload.capCenterDisallowed).reduce((a, v) => a + v, 0);
  const totalNet = Math.max(0, totalGross - totalDis);
  return (
    <section className="section" style={{
      paddingTop: 56, paddingBottom: 28,
      borderBottom: "1px solid var(--rule)",
      marginBottom: 32,
    }}>
      <div className="eyebrow">{payload.cityName}</div>
      <div className="title display" style={{ fontSize: 30, marginTop: 6 }}>
        Cost Allocation Plan
      </div>
      <div style={{ fontSize: 14, color: "var(--ink-2)", marginTop: 10 }}>
        Sequential two-phase step-down of indirect costs to receiving departments
      </div>

      <div style={{
        marginTop: 30,
        display: "grid", gridTemplateColumns: "150px 1fr",
        gap: "6px 16px", fontSize: 12.5,
      }}>
        <Label>Fiscal year</Label>            <Value>{payload.fiscal}</Value>
        <Label>Net allocable</Label>          <Value>{fmt.dollars(totalNet)}</Value>
        <Label>Indirect cost centers</Label>  <Value>{payload.capCenterOrder.length}</Value>
        <Label>Cost pools</Label>             <Value>{payload.capPools.length}</Value>
        <Label>Generated</Label>              <Value>{new Date(payload.generatedAt).toLocaleString()}</Value>
      </div>
    </section>
  );
}

function MethodologySection() {
  return (
    <section className="section" style={{ marginBottom: 32 }}>
      <div className="eyebrow">Section 1</div>
      <h2 className="h2">Methodology</h2>
      <div className="body" style={{ maxWidth: 600 }}>
        The Cost Allocation Plan distributes indirect cost centers (overhead) to
        receiving departments using a sequential two-phase step-down per published
        NBS methodology. Each indirect center is assigned a position in the
        step-down order — &ldquo;upstream&rdquo; means earlier in that order.
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <h3 className="h3">Phase 1 — First Allocation</h3>
        <div className="body">
          For each center in step order, compute First Incoming = Σ upstream
          centers&rsquo; Phase 1 contributions. Each pool distributes
          <b> (own eligible + pool-weight × First Incoming)</b> via its receiver
          schedule with no exclusions.
        </div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <h3 className="h3">Phase 2 — Second Allocation</h3>
        <div className="body">
          After Phase 1 completes, for each center in step order: Second Incoming
          = Total Received − First Incoming. Each pool distributes
          <b> (pool-weight × Second Incoming)</b> via its schedule with
          <b> self + upstream excluded</b>; surviving percents renormalize to 100%.
          No further iteration.
        </div>
      </div>
    </section>
  );
}

function CostCenters({ payload }: { payload: CapExportPayload }) {
  const poolCountByCenter = new Map<string, number>();
  for (const pl of payload.capPools) {
    poolCountByCenter.set(pl.center, (poolCountByCenter.get(pl.center) ?? 0) + 1);
  }
  const glByName = pdfGlCodeByCenter(payload);
  let totalGross = 0, totalDis = 0;
  return (
    <section className="section section-break" style={{ marginBottom: 32 }}>
      <div className="eyebrow">Section 2</div>
      <h2 className="h2">Indirect cost centers</h2>
      <div className="body" style={{ marginBottom: 12, maxWidth: 600 }}>
        Net Allocable Expenses = Total Expenses − Disallowed Expenses. Centers
        are listed in step-down order — earlier rows close first under the
        sequential methodology.
      </div>
      <table>
        <thead>
          <tr>
            <th className="num">#</th>
            <th>glCode</th>
            <th>Center</th>
            <th className="num">Total Expenses</th>
            <th className="num">Disallowed</th>
            <th className="num">Net Allocable</th>
            <th className="num">Pools</th>
          </tr>
        </thead>
        <tbody>
          {payload.capCenterOrder.map((name, i) => {
            const gross = payload.capCenterTotals[name] ?? 0;
            const dis = payload.capCenterDisallowed[name] ?? 0;
            const net = Math.max(0, gross - dis);
            const gl = glByName.get(name);
            totalGross += gross; totalDis += dis;
            return (
              <tr key={name}>
                <td className="num mono dim">{String(i + 1).padStart(2, "0")}</td>
                <td><span className="mono" style={{ fontSize: 10, color: gl ? "var(--ink-2)" : "var(--ink-4)" }}>{gl ?? "—"}</span></td>
                <td>{name}</td>
                <td className="num">{fmt.dollars(gross)}</td>
                <td className="num">{dis > 0 ? fmt.dollars(dis) : <span className="dim">—</span>}</td>
                <td className="num"><b>{fmt.dollars(net)}</b></td>
                <td className="num">{poolCountByCenter.get(name) ?? 0}</td>
              </tr>
            );
          })}
          <tr className="total">
            <td/>
            <td/>
            <td>Total</td>
            <td className="num">{fmt.dollars(totalGross)}</td>
            <td className="num">{fmt.dollars(totalDis)}</td>
            <td className="num">{fmt.dollars(Math.max(0, totalGross - totalDis))}</td>
            <td/>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

/** Center name → imported glCode for PDF use; seed centers return undefined. */
function pdfGlCodeByCenter(payload: CapExportPayload): Map<string, string> {
  const m = new Map<string, string>();
  for (const nn of payload.model.nodes) {
    if (nn.role !== "indirect") continue;
    if (nn.glCode.startsWith("seed:")) continue;
    m.set(nn.name, nn.glCode);
  }
  return m;
}

function AllocationBasesSection({ payload }: { payload: CapExportPayload }) {
  return (
    <section className="section section-break" style={{ marginBottom: 32 }}>
      <div className="eyebrow">Section 3</div>
      <h2 className="h2">Allocation bases</h2>
      <div className="body" style={{ marginBottom: 12, maxWidth: 600 }}>
        Each cost pool uses one allocation basis (driver) to spread its eligible
        $ across receivers. Basis units (FTE, payroll $, agenda items, etc.) come
        from imports or seed defaults.
      </div>
      <table>
        <thead>
          <tr><th>Basis</th><th>Key</th><th>Description</th></tr>
        </thead>
        <tbody>
          {payload.allocationBases.map((b) => (
            <tr key={b.id}>
              <td><b>{b.name}</b></td>
              <td><span className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>{b.driverKey}</span></td>
              <td style={{ color: "var(--ink-2)" }}>{b.methodologyNote ?? b.source ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function CostPools({ payload }: { payload: CapExportPayload }) {
  const glByName = pdfGlCodeByCenter(payload);
  let totalEligible = 0;
  return (
    <section className="section section-break" style={{ marginBottom: 32 }}>
      <div className="eyebrow">Section 4</div>
      <h2 className="h2">Cost pools</h2>
      <div className="body" style={{ marginBottom: 12, maxWidth: 600 }}>
        Functional overhead pools. Each pool&rsquo;s net allocable amount is
        distributed via its allocation basis schedule.
      </div>
      <table>
        <thead>
          <tr>
            <th>glCode</th>
            <th>Center</th>
            <th>Pool</th>
            <th>Basis</th>
            <th className="num">Net allocable</th>
          </tr>
        </thead>
        <tbody>
          {payload.capPools.map((pl) => {
            const { basis } = basisForPool(pl, payload.allocationBases);
            const gl = glByName.get(pl.center);
            totalEligible += pl.amount;
            return (
              <tr key={pl.id}>
                <td><span className="mono" style={{ fontSize: 10, color: gl ? "var(--ink-2)" : "var(--ink-4)" }}>{gl ?? "—"}</span></td>
                <td style={{ color: "var(--ink-2)" }}>{pl.center}</td>
                <td><b>{pl.pool}</b></td>
                <td><span className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>{basis}</span></td>
                <td className="num"><b>{fmt.dollars(pl.amount)}</b></td>
              </tr>
            );
          })}
          <tr className="total">
            <td colSpan={4}>Total net allocable</td>
            <td className="num">{fmt.dollars(totalEligible)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function AllocationByCenter({ payload }: { payload: CapExportPayload }) {
  const stepIndex = new Map<string, number>();
  payload.model.stepOrder.forEach((k, i) => {
    const node = payload.model.nodes.find((nn) => nn.key === k);
    if (node) stepIndex.set(node.name, i);
  });
  const poolsByCenter = new Map<string, CapExportPayload["capPools"]>();
  for (const pl of payload.capPools) {
    const list = poolsByCenter.get(pl.center) ?? [];
    list.push(pl);
    poolsByCenter.set(pl.center, list);
  }
  for (const list of poolsByCenter.values()) {
    list.sort((a, b) => a.pool.localeCompare(b.pool));
  }

  return (
    <section className="section section-break" style={{ marginBottom: 24 }}>
      <div className="eyebrow">Section 5</div>
      <h2 className="h2">Allocation by cost center</h2>
      <div className="body" style={{ marginBottom: 14, maxWidth: 600 }}>
        Each cost center is reported together with all of its pools&rsquo;
        per-receiver allocation schedules. The <b>Costs to be Allocated</b>
        summary precedes each center&rsquo;s pool detail blocks so the
        Departmental + Incoming totals can be cross-checked against the
        First/Second column subtotals on the pool pages.
      </div>
      {payload.model.stepOrder.map((centerKey, idx) => {
        const centerNode = payload.model.nodes.find((nn) => nn.key === centerKey);
        if (!centerNode) return null;
        const centerName = centerNode.name;
        const centerPools = poolsByCenter.get(centerName) ?? [];
        return (
          <CenterBlock
            key={centerKey}
            centerKey={centerKey}
            centerName={centerName}
            centerPools={centerPools}
            stepIndex={stepIndex}
            payload={payload}
            indexLabel={String(idx + 1).padStart(2, "0")}
          />
        );
      })}
    </section>
  );
}

function CenterBlock({
  centerKey, centerName, centerPools, stepIndex, payload, indexLabel,
}: {
  centerKey: string;
  centerName: string;
  centerPools: CapExportPayload["capPools"];
  stepIndex: Map<string, number>;
  payload: CapExportPayload;
  indexLabel: string;
}) {
  const targetStep = stepIndex.get(centerName) ?? -1;

  const departmental = centerPools
    .reduce((a, pl) => a + pl.amount, 0);

  const sources = new Map<string, { first: number; second: number }>();
  for (const n of payload.model.nodes) {
    if (n.role === "indirect") sources.set(n.name, { first: 0, second: 0 });
  }
  for (const sp of payload.capPools) {
    const srcStep = stepIndex.get(sp.center) ?? -1;
    const isUpstream = srcStep !== -1 && targetStep !== -1 && srcStep < targetStep;
    const r1 = payload.model.firstAllocation[sp.id]?.[centerKey] ?? 0;
    const r2 = payload.model.secondAllocation[sp.id]?.[centerKey] ?? 0;
    const first = isUpstream ? r1 : 0;
    const second = isUpstream ? r2 : (r1 + r2);
    const cur = sources.get(sp.center) ?? { first: 0, second: 0 };
    cur.first += first;
    cur.second += second;
    sources.set(sp.center, cur);
  }
  const sourceRows = [...sources.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => (stepIndex.get(a.name) ?? 999) - (stepIndex.get(b.name) ?? 999));
  const totalFirst = sourceRows.reduce((a, r) => a + r.first, 0);
  const totalSecond = sourceRows.reduce((a, r) => a + r.second, 0);

  // Skip centers with no eligible $ AND no incoming AND no pools — purely
  // structural placeholders won't have anything to print.
  if (centerPools.length === 0
      && departmental < 0.5
      && totalFirst < 0.5
      && totalSecond < 0.5) {
    return null;
  }

  return (
    <div className="center-block" style={{
      breakBefore: "page",
      paddingTop: 8,
      marginBottom: 24,
    }}>
      <div style={{
        borderBottom: "2px solid var(--ink)",
        paddingBottom: 8,
        marginBottom: 14,
      }}>
        <div className="mono" style={{
          fontSize: 9.5, fontWeight: 600, letterSpacing: "0.14em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>Center {indexLabel} · Step {indexLabel}</div>
        <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>
          {pdfGlCodeByCenter(payload).get(centerName) && (
            <span className="mono" style={{
              fontSize: 14, color: "var(--ink-3)", marginRight: 10,
              letterSpacing: "0.02em",
            }}>{pdfGlCodeByCenter(payload).get(centerName)}</span>
          )}
          {centerName}
        </div>
      </div>

      {(departmental >= 0.5 || totalFirst >= 0.5 || totalSecond >= 0.5) && (
        <div className="row" style={{ marginBottom: 18 }}>
          <h3 className="h3">Costs to be Allocated</h3>
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th className="num">First</th>
                <th className="num">Second</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><b>Departmental Expenditures</b></td>
                <td className="num"><b>{fmt.dollars(departmental)}</b></td>
                <td className="num dim">—</td>
                <td className="num"><b>{fmt.dollars(departmental)}</b></td>
              </tr>
              {sourceRows.map((r) => {
                const isSelf = r.name === centerName;
                const total = r.first + r.second;
                const allZero = r.first < 0.5 && r.second < 0.5;
                const sourceGl = pdfGlCodeByCenter(payload).get(r.name);
                return (
                  <tr key={r.name}>
                    <td style={{ color: allZero ? "var(--ink-4)" : "var(--ink-2)" }}>
                      {sourceGl && (
                        <span className="mono dim" style={{
                          fontSize: 10, marginRight: 6, letterSpacing: "0.02em",
                        }}>{sourceGl}</span>
                      )}
                      {r.name}{isSelf && <span className="mono dim" style={{ marginLeft: 6, fontSize: 9 }}>(SELF)</span>}
                    </td>
                    <td className="num" style={{ color: r.first < 0.5 ? "var(--ink-4)" : undefined }}>
                      {r.first < 0.5 ? "—" : fmt.dollars(r.first)}
                    </td>
                    <td className="num" style={{ color: r.second < 0.5 ? "var(--ink-4)" : undefined }}>
                      {r.second < 0.5 ? "—" : fmt.dollars(r.second)}
                    </td>
                    <td className="num" style={{ color: allZero ? "var(--ink-4)" : undefined }}>
                      {allZero ? "—" : fmt.dollars(total)}
                    </td>
                  </tr>
                );
              })}
              <tr className="total">
                <td>Total Incoming</td>
                <td className="num">{fmt.dollars(totalFirst)}</td>
                <td className="num">{fmt.dollars(totalSecond)}</td>
                <td className="num">{fmt.dollars(totalFirst + totalSecond)}</td>
              </tr>
              <tr className="total">
                <td>Total Costs to be Allocated</td>
                <td className="num">{fmt.dollars(departmental + totalFirst)}</td>
                <td className="num">{fmt.dollars(totalSecond)}</td>
                <td className="num"><b>{fmt.dollars(departmental + totalFirst + totalSecond)}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {centerPools.length > 0 && (
        <>
          <h3 className="h3" style={{ marginTop: 16 }}>
            Pool allocation detail ({centerPools.length} pool{centerPools.length === 1 ? "" : "s"})
          </h3>
          {centerPools.map((pl) => (
            <PoolBlock key={pl.id} pool={pl} model={payload.model} bases={payload.allocationBases}/>
          ))}
        </>
      )}
    </div>
  );
}

function PoolBlock({
  pool, model, bases,
}: {
  pool: CapExportPayload["capPools"][number];
  model: GlStepDownModel;
  bases: CapExportPayload["allocationBases"];
}) {
  const { basis } = basisForPool(pool, bases);
  const eligibleAmount = pool.amount;

  const indirectNodes = model.nodes
    .filter((n) => n.role === "indirect")
    .sort((a, b) => a.glCode.localeCompare(b.glCode));
  const directNodes = model.nodes
    .filter((n) => n.role === "direct")
    .sort((a, b) => a.glCode.localeCompare(b.glCode));

  const rowFor = (node: GlNode) => {
    const receiver = (pool.receivers ?? []).find((r) => r.glCode === node.key);
    const pct = receiver?.percent ?? 0;
    const first = model.firstAllocation[pool.id]?.[node.key] ?? 0;
    const second = model.secondAllocation[pool.id]?.[node.key] ?? 0;
    return { node, pct, first, second, total: first + second };
  };
  const allocableRows = indirectNodes.map(rowFor).filter((r) => r.pct > 0 || r.first > 0.5 || r.second > 0.5);
  const receivingRows = directNodes.map(rowFor).filter((r) => r.pct > 0 || r.first > 0.5 || r.second > 0.5);
  const allRows = [...allocableRows, ...receivingRows];
  const totalFirst = allRows.reduce((a, r) => a + r.first, 0);
  const totalSecond = allRows.reduce((a, r) => a + r.second, 0);

  const centerNode = model.nodes.find(
    (n) => n.role === "indirect" && n.name === pool.center,
  );
  const centerGl = centerNode && !centerNode.glCode.startsWith("seed:")
    ? centerNode.glCode : undefined;
  return (
    <div className="pool-block row" style={{ marginBottom: 22 }}>
      <h3 className="h3" style={{ marginBottom: 4 }}>
        {centerGl && (
          <span className="mono" style={{
            fontSize: 11, color: "var(--ink-3)", marginRight: 8,
            letterSpacing: "0.02em", fontWeight: 400,
          }}>{centerGl}</span>
        )}
        {pool.center} · {pool.pool}
      </h3>
      <div style={{
        fontSize: 11, color: "var(--ink-3)", marginBottom: 8,
        display: "flex", gap: 14,
      }}>
        <span>Allocable: <b style={{ color: "var(--ink-2)" }}>{fmt.dollars(eligibleAmount)}</b></span>
        <span>Basis: <span className="mono">{basis}</span></span>
        <span>First Pool: <b style={{ color: "var(--ink-2)" }}>{fmt.dollars(totalFirst)}</b></span>
        <span>Second Pool: <b style={{ color: "var(--ink-2)" }}>{fmt.dollars(totalSecond)}</b></span>
        <span>Total: <b style={{ color: "var(--accent)" }}>{fmt.dollars(totalFirst + totalSecond)}</b></span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Budget Unit</th>
            <th className="num">Pct</th>
            <th className="num">Gross</th>
            <th className="num">First</th>
            <th className="num">Second</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {allocableRows.length > 0 && (
            <tr><td colSpan={6} className="section-label">Allocable Budget Units</td></tr>
          )}
          {allocableRows.map((r) => <ScheduleRow key={r.node.key} {...r}/>)}
          {receivingRows.length > 0 && (
            <tr><td colSpan={6} className="section-label">Receiving Budget Units</td></tr>
          )}
          {receivingRows.map((r) => <ScheduleRow key={r.node.key} {...r}/>)}
          <tr className="total">
            <td>Total</td>
            <td className="num">{(allRows.reduce((a, r) => a + r.pct, 0)).toFixed(3)}%</td>
            <td className="num">{fmt.dollars(totalFirst)}</td>
            <td className="num">{fmt.dollars(totalFirst)}</td>
            <td className="num">{fmt.dollars(totalSecond)}</td>
            <td className="num"><b style={{ color: "var(--accent)" }}>{fmt.dollars(totalFirst + totalSecond)}</b></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ScheduleRow({
  node, pct, first, second, total,
}: {
  node: GlNode; pct: number; first: number; second: number; total: number;
}) {
  return (
    <tr>
      <td>
        <span className="mono dim" style={{ fontSize: 9.5, marginRight: 6 }}>
          {node.glCode.startsWith("seed:") ? "—" : node.glCode}
        </span>
        {node.name}
      </td>
      <td className="num" style={{ color: pct <= 0 ? "var(--ink-4)" : undefined }}>
        {pct <= 0 ? "—" : `${pct.toFixed(3)}%`}
      </td>
      <td className="num" style={{ color: first < 0.5 ? "var(--ink-4)" : undefined }}>
        {first < 0.5 ? "—" : fmt.dollars(first)}
      </td>
      <td className="num" style={{ color: first < 0.5 ? "var(--ink-4)" : undefined }}>
        {first < 0.5 ? "—" : fmt.dollars(first)}
      </td>
      <td className="num" style={{ color: second < 0.5 ? "var(--ink-4)" : undefined }}>
        {second < 0.5 ? "—" : fmt.dollars(second)}
      </td>
      <td className="num" style={{ color: total < 0.5 ? "var(--ink-4)" : "var(--ink)", fontWeight: 600 }}>
        {total < 0.5 ? "—" : fmt.dollars(total)}
      </td>
    </tr>
  );
}

function FbhrRollup({ payload }: { payload: CapExportPayload }) {
  const { PLAN, BLDG, ENG } = payload.fbhrRollup;
  const total = (PLAN ?? 0) + (BLDG ?? 0) + (ENG ?? 0);
  return (
    <section className="section section-break" style={{ marginBottom: 32 }}>
      <div className="eyebrow">Section 6</div>
      <h2 className="h2">FBHR roll-up</h2>
      <div className="body" style={{ marginBottom: 12, maxWidth: 600 }}>
        Allocated CAP $ feeding the Fully Burdened Hourly Rate (FBHR) calculation
        for each fee department. Equals the sum of direct-node totals tagged
        with the corresponding fee dept.
      </div>
      <table>
        <thead>
          <tr>
            <th>Fee Department</th>
            <th className="num">Allocated CAP $</th>
            <th className="num">% of total</th>
          </tr>
        </thead>
        <tbody>
          {(["PLAN", "BLDG", "ENG"] as const).map((d) => {
            const v = payload.fbhrRollup[d] ?? 0;
            return (
              <tr key={d}>
                <td><b>{d}</b></td>
                <td className="num">{fmt.dollars(v)}</td>
                <td className="num">{total > 0 ? `${(100 * v / total).toFixed(1)}%` : "—"}</td>
              </tr>
            );
          })}
          <tr className="total">
            <td>Total</td>
            <td className="num">{fmt.dollars(total)}</td>
            <td className="num">100.0%</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

// ============================================================================
// Small helpers
// ============================================================================

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
