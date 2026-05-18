
import { useMemo, useState, type ReactNode } from "react";
import { SectionLabel } from "@/components/ui";
import { fmt } from "@/lib/format";
import {
  ALL_DEPTS, DIRECT_DEPTS, INDIRECT_DEPTS,
  basisForPool, computeStepDown,
  type MatrixDept, type MatrixDeptCode,
} from "@/lib/data/capStepDown";
import { ALLOCATION_BASES } from "@/lib/data/allocationBases";
import { useBuildState } from "@/lib/store";
import {
  TracePanel, TraceSection, SummaryStrip, TraceStat,
  FlowDiagram, CollapsibleMetadata, MetadataRow,
  type FlowStep,
} from "./TracePanel";

type View = "initial" | "final";

interface OpenCell {
  poolId: string;
  deptCode: MatrixDeptCode;
}

/** Step 4 of the CAP flow. Pool × dept step-down matrix.
 *
 *  Initial placement → indirect depts are closed in sequence → final
 *  allocation. Every cell is traceable: click to see the formula, the
 *  driver inputs, and the step-by-step contributions that produced the value.
 */
export function AllocationMatrix() {
  const { capPools, capCenterOrder, allocationBases, derived } = useBuildState();
  const [view, setView] = useState<View>("final");
  const [openCell, setOpenCell] = useState<OpenCell | null>(null);

  const model = useMemo(
    () => computeStepDown(capPools, capCenterOrder, allocationBases, derived.capDrivers),
    [capPools, capCenterOrder, allocationBases, derived.capDrivers],
  );

  // Initial view shows every dept (pools sit on home indirect); Final shows
  // only the direct receivers — by then indirects are all zero.
  const cols: MatrixDept[] = view === "initial" ? ALL_DEPTS : DIRECT_DEPTS;
  const allocSrc = view === "initial" ? model.alloc1 : model.alloc2;

  const grid =
    `minmax(220px, 2.2fr) 96px 96px ${cols.map(() => "minmax(78px, 1fr)").join(" ")} 100px`;

  const rowTotal = (poolId: string): number =>
    cols.reduce((a, d) => a + (allocSrc[poolId]?.[d.code] ?? 0), 0);

  const colTotal = (deptCode: MatrixDeptCode): number =>
    capPools.reduce((a, p) => a + (allocSrc[p.id]?.[deptCode] ?? 0), 0);

  const totalEligible = capPools.reduce((a, p) => a + p.amount * (p.eligiblePercent / 100), 0);
  const grandTotal = capPools.reduce((a, p) => a + rowTotal(p.id), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <SectionLabel right={`${capPools.length} pools · ${cols.length} ${view === "initial" ? "depts" : "direct depts"}`}>
          Pool allocations
        </SectionLabel>
        <div style={{
          background: "var(--paper)", border: "1px solid var(--rule)",
          overflowX: "auto",
        }}>
        <Header view={view} setView={setView}/>
        <div style={{ minWidth: view === "initial" ? 1280 : 960 }}>
          {/* Header */}
          <div style={{
            display: "grid", gridTemplateColumns: grid, gap: 8,
            padding: "10px 14px",
            background: "var(--paper-2)",
            borderBottom: "1px solid var(--rule-strong)",
            fontFamily: "var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
            letterSpacing: "0.06em", color: "var(--ink-3)", textTransform: "uppercase",
          }}>
            <div>Center · Pool</div>
            <div style={{ textAlign: "right" }}>Eligible $</div>
            <div>Basis</div>
            {cols.map((d) => (
              <div key={d.code} style={{
                textAlign: "right",
                color: d.kind === "direct" ? "var(--ink-2)" : "var(--ink-4)",
              }}>{d.code}</div>
            ))}
            <div style={{ textAlign: "right" }}>Row total</div>
          </div>

          {/* Indirect group label — only meaningful in the Initial view */}
          {view === "initial" && (
            <GroupLabel>Indirect cost centers (Σ {INDIRECT_DEPTS.length}) · Direct departments (Σ {DIRECT_DEPTS.length})</GroupLabel>
          )}

          {/* Rows */}
          {capPools.map((p, i) => {
            const rt = rowTotal(p.id);
            const isLast = i === capPools.length - 1;
            const { basis } = basisForPool(p, allocationBases);
            return (
              <div key={p.id} style={{
                display: "grid", gridTemplateColumns: grid, gap: 8,
                padding: "7px 14px",
                borderBottom: isLast ? "none" : "1px solid var(--rule)",
                alignItems: "center",
                fontFamily: "var(--ff-mono)",
                fontVariantNumeric: "tabular-nums",
              }}>
                <div style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, lineHeight: 1.3 }}>
                  <div style={{ fontWeight: 500 }}>{p.center}</div>
                  <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 1 }}>{p.pool}</div>
                </div>
                <div
                  className="num"
                  style={{ textAlign: "right", fontSize: 12 }}
                  title={p.eligiblePercent < 100
                    ? `${fmt.dollars(p.amount)} raw × ${p.eligiblePercent}% eligible`
                    : undefined}
                >
                  {fmt.dollarsK(p.amount * (p.eligiblePercent / 100))}
                </div>
                <div className="mono" style={{
                  fontSize: 10.5, color: "var(--ink-3)",
                  letterSpacing: "0.04em",
                }}>{basis}</div>
                {cols.map((d) => {
                  const v = allocSrc[p.id]?.[d.code] ?? 0;
                  const zero = v < 0.5;
                  const isOpen = openCell?.poolId === p.id && openCell?.deptCode === d.code;
                  const dim = view === "initial" && d.kind === "indirect" && zero;
                  return (
                    <button
                      key={d.code}
                      onClick={() => !zero && setOpenCell(isOpen ? null : { poolId: p.id, deptCode: d.code })}
                      title={zero ? "—" : `${fmt.dollars(v)} — click for trace`}
                      style={{
                        textAlign: "right", padding: "3px 4px",
                        fontSize: 11.5,
                        fontFamily: "var(--ff-mono)",
                        fontVariantNumeric: "tabular-nums",
                        color: zero ? "var(--ink-4)" : "var(--ink)",
                        opacity: dim ? 0.5 : 1,
                        fontWeight: isOpen ? 600 : 400,
                        background: isOpen ? "var(--accent-tint)" : "transparent",
                        border: isOpen ? "1px solid var(--accent)" : "1px solid transparent",
                        cursor: zero ? "default" : "pointer",
                      }}
                    >
                      {zero ? "—" : fmt.dollarsK(v)}
                    </button>
                  );
                })}
                <div className="num" style={{
                  textAlign: "right", fontSize: 12,
                }}>{fmt.dollarsK(rt)}</div>
              </div>
            );
          })}

          {/* Column totals */}
          <div style={{
            display: "grid", gridTemplateColumns: grid, gap: 8,
            padding: "11px 14px",
            background: "var(--paper-2)",
            borderTop: "2px solid var(--ink)",
            alignItems: "center",
            fontFamily: "var(--ff-mono)",
            fontVariantNumeric: "tabular-nums",
          }}>
            <div className="mono" style={{
              fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}>Column total</div>
            <div className="num" style={{ textAlign: "right", fontSize: 12.5 }}>
              {fmt.dollarsK(totalEligible)}
            </div>
            <div/>
            {cols.map((d) => {
              const t = colTotal(d.code);
              const zero = t < 0.5;
              return (
                <div key={d.code} className="num" style={{
                  textAlign: "right", fontSize: 12,
                  color: zero ? "var(--ink-4)" : "var(--ink)",
                }}>{zero ? "—" : fmt.dollarsK(t)}</div>
              );
            })}
            <div className="num" style={{
              textAlign: "right", fontSize: 13,
            }}>{fmt.dollarsK(grandTotal)}</div>
          </div>
        </div>
        </div>
      </div>

      {openCell ? (
        <CellTrace
          poolId={openCell.poolId}
          deptCode={openCell.deptCode}
          view={view}
          onClose={() => setOpenCell(null)}
          model={model}
        />
      ) : (
        <TraceHint/>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header — method note + Initial/Final toggle
// ---------------------------------------------------------------------------

function Header({
  view, setView,
}: {
  view: View; setView: (v: View) => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "stretch", gap: 0,
      borderBottom: "1px solid var(--rule)", background: "var(--paper)",
    }}>
      <div style={{ flex: 1 }}/>
      <div style={{
        display: "flex", alignItems: "stretch",
        borderLeft: "1px solid var(--rule)",
      }}>
        {[
          { id: "initial" as const, label: "Initial placement" },
          { id: "final"   as const, label: "Final (after step-down)" },
        ].map((opt, i) => {
          const active = view === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setView(opt.id)}
              style={{
                padding: "8px 18px",
                fontSize: 11.5, fontWeight: 600,
                background: active ? "var(--ink)" : "var(--paper)",
                color:      active ? "var(--paper)" : "var(--ink-2)",
                borderRight: i === 0 ? "1px solid var(--rule)" : "none",
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >{opt.label}</button>
          );
        })}
      </div>
    </div>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{
      padding: "6px 14px",
      background: "var(--paper-2)",
      borderBottom: "1px solid var(--rule)",
      fontFamily: "var(--ff-mono)", fontSize: 9.5, fontWeight: 700,
      letterSpacing: "0.14em", color: "var(--ink-3)", textTransform: "uppercase",
    }}>{children}</div>
  );
}

// ---------------------------------------------------------------------------
// Trace — hint + cell drill-down panel
// ---------------------------------------------------------------------------

function TraceHint() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "12px 16px",
      background: "var(--paper-2)", border: "1px solid var(--rule)",
      fontSize: 12, color: "var(--ink-3)",
    }}>
      <span className="mono" style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
        color: "var(--ink-2)", textTransform: "uppercase",
      }}>Trace</span>
      <span>Click any non-zero cell to see its formula, driver inputs, and (for Final) the contributions from each indirect department that produced the value.</span>
    </div>
  );
}

function CellTrace({
  poolId, deptCode, view, model, onClose,
}: {
  poolId: string; deptCode: MatrixDeptCode; view: View;
  model: ReturnType<typeof computeStepDown>;
  onClose: () => void;
}) {
  const { capPools, allocationBases, derived } = useBuildState();
  const pool = capPools.find((p) => p.id === poolId);
  const dept = ALL_DEPTS.find((d) => d.code === deptCode);
  if (!pool || !dept) return null;

  const { basis, directTo } = basisForPool(pool, allocationBases);
  const isDirectCharge = basis === "DIRECT";
  const initialValue = model.alloc1[pool.id]?.[dept.code] ?? 0;
  const finalValue   = model.alloc2[pool.id]?.[dept.code] ?? 0;
  const cellValue = view === "initial" ? initialValue : finalValue;

  // Driver values across all receiving depts for this pool's basis. These
  // are the denominators every direct-dept share is built from — pulled
  // from derived.capDrivers so receiver-imported values override the seed.
  const basisMeta = ALLOCATION_BASES.find((b) => b.key === basis);
  const driverByDept = isDirectCharge
    ? {} as Record<MatrixDeptCode, number>
    : Object.fromEntries(
        ALL_DEPTS.map((d) => [d.code, derived.capDrivers[d.code]?.[basis] ?? 0]),
      ) as Record<MatrixDeptCode, number>;
  const driverTotal = isDirectCharge
    ? 0
    : Object.values(driverByDept).reduce((a, v) => a + v, 0);
  const deptDriver = driverByDept[dept.code] ?? 0;
  const deptShare = driverTotal > 0 ? (deptDriver / driverTotal) * 100 : 0;
  const eligibleAmount = pool.amount * (pool.eligiblePercent / 100);

  // Step-down contributions (only meaningful in final view when the pool
  // sat on an indirect dept that was closed into this direct recipient).
  const stepContribs = model.contributions
    .filter((c) => c.poolId === pool.id && c.toCode === dept.code && c.amount > 0.5)
    .sort((a, b) => a.stepIndex - b.stepIndex);

  // Build the vertical flow steps. In the Initial-placement view, the pool
  // simply sits on its home center untouched by basis math — the flow
  // collapses to a 2-step "pool placed here" explanation. The full
  // driver-based flow only appears once the user switches to Final.
  const flowSteps: FlowStep[] = view === "initial"
    ? [
        {
          label: "Eligible cost pool",
          value: fmt.dollars(eligibleAmount),
          detail: pool.eligiblePercent < 100
            ? `${fmt.dollars(pool.amount)} raw × ${pool.eligiblePercent}% eligible`
            : "100% eligible",
        },
        {
          label: "Initial placement",
          value: `Sits on ${pool.center}`,
          detail: "Step-down has not run yet — no basis math applied",
          emphasis: true,
        },
      ]
    : isDirectCharge
    ? [
        {
          label: "Eligible cost pool",
          value: fmt.dollars(eligibleAmount),
          detail: pool.eligiblePercent < 100
            ? `${fmt.dollars(pool.amount)} raw × ${pool.eligiblePercent}% eligible`
            : "100% eligible",
        },
        {
          label: "Allocation method",
          value: "Direct charge",
          detail: directTo
            ? `Routed entirely to ${ALL_DEPTS.find((d) => d.code === directTo)?.name ?? directTo}`
            : "Routed to a single department",
        },
        {
          label: "Final allocation",
          value: fmt.dollars(cellValue),
          detail: `${dept.name}'s full share of the pool`,
          emphasis: true,
        },
      ]
    : [
        {
          label: "Eligible cost pool",
          value: fmt.dollars(eligibleAmount),
          detail: pool.eligiblePercent < 100
            ? `${fmt.dollars(pool.amount)} raw × ${pool.eligiblePercent}% eligible`
            : "100% eligible",
        },
        {
          label: "Allocation basis",
          value: basisMeta?.longName ?? basis,
          detail: basisMeta ? `${basisMeta.unitLong} (${basisMeta.label})` : basis,
        },
        {
          label: `${dept.name} share`,
          value: `${deptDriver.toLocaleString()} / ${driverTotal.toLocaleString()} ${basisMeta?.unit ?? "units"}`,
          detail: "Department's slice of the basis denominator",
        },
        {
          label: "Allocation %",
          value: `${deptShare.toFixed(1)}%`,
          detail: `${deptDriver.toLocaleString()} ÷ ${driverTotal.toLocaleString()}`,
        },
        {
          label: "Final allocation",
          value: fmt.dollars(cellValue),
          detail: `${deptShare.toFixed(1)}% × ${fmt.dollars(eligibleAmount)}`,
          emphasis: true,
        },
      ];

  const summarySource = `${pool.center} · ${pool.pool}`;
  const stepDownNote = view === "final" && stepContribs.length > 0
    ? `Built from ${stepContribs.length} step-down contribution${stepContribs.length === 1 ? "" : "s"}`
    : undefined;

  return (
    <TracePanel
      eyebrow="Pool allocation trace"
      from={summarySource}
      to={dept.name}
      onClose={onClose}
    >
      {/* Section 1 — Summary */}
      <TraceSection>
        <SummaryStrip cols={4}>
          <TraceStat
            label="Eligible cost pool"
            value={fmt.dollars(eligibleAmount)}
            sub={pool.eligiblePercent < 100
              ? `${pool.eligiblePercent}% of ${fmt.dollars(pool.amount)} raw`
              : "100% fee-eligible"}
          />
          <TraceStat
            label="Allocation basis"
            value={isDirectCharge ? "Direct charge" : (basisMeta?.longName ?? basis)}
            sub={isDirectCharge
              ? "Single-department routing"
              : basisMeta ? <span className="mono" style={{ letterSpacing: "0.1em" }}>{basisMeta.label}</span> : undefined}
          />
          <TraceStat
            label="Department share"
            value={
              view === "initial" ? "100%"
              : isDirectCharge ? "100%"
              : `${deptShare.toFixed(1)}%`
            }
            sub={
              view === "initial" ? "Pre-step-down placement"
              : isDirectCharge ? "Routed to a single department"
              : `${deptDriver.toLocaleString()} ÷ ${driverTotal.toLocaleString()} ${basisMeta?.unit ?? ""}`
            }
          />
          <TraceStat
            label={view === "initial" ? "Initial placement" : "Final allocation"}
            value={fmt.dollars(cellValue)}
            sub={stepDownNote ?? (view === "initial" ? "Pool sits on home center" : "After step-down")}
            emphasis
          />
        </SummaryStrip>
      </TraceSection>

      {/* Section 2 — Allocation logic / vertical flow */}
      <TraceSection title="How this allocation was built">
        <FlowDiagram steps={flowSteps}/>
        {view === "final" && stepContribs.length > 0 && (
          <div style={{
            marginTop: 16,
            border: "1px solid var(--rule)",
            background: "var(--paper-2)",
          }}>
            <div className="mono" style={{
              padding: "8px 14px",
              borderBottom: "1px solid var(--rule)",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
              color: "var(--ink-3)", textTransform: "uppercase",
            }}>Step-down contributions</div>
            {stepContribs.map((c, i) => (
              <div key={`${c.stepIndex}-${c.fromCode}`} style={{
                display: "grid",
                gridTemplateColumns: "44px 1fr auto",
                gap: 12, alignItems: "baseline",
                padding: "8px 14px",
                fontSize: 12,
                borderBottom: i < stepContribs.length - 1 ? "1px solid var(--rule)" : "none",
              }}>
                <span className="mono" style={{
                  fontSize: 10, color: "var(--ink-4)", fontWeight: 600,
                }}>step {c.stepIndex}</span>
                <span style={{ color: "var(--ink-2)" }}>
                  From <strong style={{ color: "var(--ink)" }}>{c.fromName}</strong>
                </span>
                <span className="num mono" style={{
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--ink)", fontWeight: 500,
                }}>{fmt.dollars(c.amount)}</span>
              </div>
            ))}
            <div style={{
              display: "grid",
              gridTemplateColumns: "44px 1fr auto",
              gap: 12, alignItems: "baseline",
              padding: "10px 14px",
              borderTop: "2px solid var(--ink)",
              fontSize: 12, fontWeight: 500,
              background: "var(--paper)",
            }}>
              <span/>
              <span>Final allocation to {dept.name}</span>
              <span className="num mono" style={{
                fontVariantNumeric: "tabular-nums",
                color: "var(--accent)",
              }}>{fmt.dollars(finalValue)}</span>
            </div>
          </div>
        )}
      </TraceSection>

      {/* Section 3 — Distribution */}
      {/* Section 3 — Auditor metadata */}
      <CollapsibleMetadata title="Allocation metadata">
        <MetadataRow label="Pool ID">{pool.id}</MetadataRow>
        <MetadataRow label="Cost center">{pool.center}</MetadataRow>
        <MetadataRow label="Pool name">{pool.pool}</MetadataRow>
        <MetadataRow label="Raw amount">{fmt.dollars(pool.amount)}</MetadataRow>
        <MetadataRow label="Eligible %">{pool.eligiblePercent}%</MetadataRow>
        <MetadataRow label="Excluded">{fmt.dollars(pool.amount * (1 - pool.eligiblePercent / 100))}</MetadataRow>
        <MetadataRow label="Basis code">{basis}</MetadataRow>
        {pool.basis && <MetadataRow label="Basis rationale">{pool.basis}</MetadataRow>}
        {isDirectCharge && directTo && (
          <MetadataRow label="Direct target">{ALL_DEPTS.find((d) => d.code === directTo)?.name ?? directTo}</MetadataRow>
        )}
        {!isDirectCharge && (
          <>
            <MetadataRow label={`${dept.code} driver value`}>{deptDriver.toLocaleString()} {basisMeta?.unit ?? ""}</MetadataRow>
            <MetadataRow label="Total driver">{driverTotal.toLocaleString()} {basisMeta?.unit ?? ""}</MetadataRow>
          </>
        )}
        <MetadataRow label="Initial placement">{fmt.dollars(initialValue)}</MetadataRow>
        <MetadataRow label="Final placement">{fmt.dollars(finalValue)}</MetadataRow>
      </CollapsibleMetadata>
    </TracePanel>
  );
}
