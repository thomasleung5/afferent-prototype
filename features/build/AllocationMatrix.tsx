
import { useMemo, useState, type ReactNode } from "react";
import { Icon, SectionLabel } from "@/components/ui";
import { fmt } from "@/lib/format";
import {
  ALL_DEPTS, DIRECT_DEPTS, INDIRECT_DEPTS,
  basisForPool, computeStepDown, DRIVERS,
  type MatrixDept, type MatrixDeptCode,
} from "@/lib/data/capStepDown";
import { useBuildState } from "@/lib/store";

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
  const { capPools, capCenterOrder, allocationBases } = useBuildState();
  const [view, setView] = useState<View>("final");
  const [openCell, setOpenCell] = useState<OpenCell | null>(null);

  const model = useMemo(
    () => computeStepDown(capPools, capCenterOrder, allocationBases),
    [capPools, capCenterOrder, allocationBases],
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
  const { capPools, allocationBases } = useBuildState();
  const pool = capPools.find((p) => p.id === poolId);
  const dept = ALL_DEPTS.find((d) => d.code === deptCode);
  if (!pool || !dept) return null;

  const { basis, directTo } = basisForPool(pool, allocationBases);
  const isDirectCharge = basis === "DIRECT";
  const initialValue = model.alloc1[pool.id]?.[dept.code] ?? 0;
  const finalValue   = model.alloc2[pool.id]?.[dept.code] ?? 0;

  // Pull this cell's step-down contributions from the trace.
  const stepContribs = model.contributions
    .filter((c) => c.poolId === pool.id && c.toCode === dept.code && c.amount > 0.5)
    .sort((a, b) => a.stepIndex - b.stepIndex);

  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--accent)" }}>
      <div style={{
        display: "flex", alignItems: "center",
        padding: "12px 16px", borderBottom: "1px solid var(--rule)",
        background: "var(--accent-tint)",
      }}>
        <div className="mono" style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
          color: "var(--accent)", textTransform: "uppercase",
        }}>Cell trace</div>
        <div style={{ marginLeft: 12, fontSize: 13, fontWeight: 600 }}>
          {pool.pool} <span style={{ color: "var(--ink-3)" }}>→</span> {dept.name}
        </div>
        <button onClick={onClose} style={{
          marginLeft: "auto", color: "var(--ink-3)",
          background: "transparent", border: "none", cursor: "pointer",
        }} aria-label="Close trace">
          <Icon name="close" size={13}/>
        </button>
      </div>

      <div style={{
        padding: "14px 16px",
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24,
      }}>
        {/* Pool inputs */}
        <div>
          <div className="mono" style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
            color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 8,
          }}>Pool inputs</div>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr auto", gap: "5px 12px",
            fontSize: 12,
          }}>
            <div style={{ color: "var(--ink-3)" }}>Pool ID</div>
            <div className="mono">{pool.id}</div>
            <div style={{ color: "var(--ink-3)" }}>Center</div>
            <div>{pool.center}</div>
            <div style={{ color: "var(--ink-3)" }}>Raw amount</div>
            <div className="num">{fmt.dollars(pool.amount)}</div>
            <div style={{ color: "var(--ink-3)" }}>Eligible %</div>
            <div className="num">{pool.eligiblePercent}%</div>
            <div style={{ color: "var(--ink-3)" }}>Eligible amount</div>
            <div className="num" style={{ fontWeight: 600 }}>
              {fmt.dollars(pool.amount * (pool.eligiblePercent / 100))}
            </div>
            {pool.eligiblePercent < 100 && (
              <>
                <div style={{ color: "var(--ink-3)" }}>Excluded</div>
                <div className="num" style={{ color: "var(--ink-3)" }}>
                  {fmt.dollars(pool.amount * (1 - pool.eligiblePercent / 100))}
                </div>
              </>
            )}
            <div style={{ color: "var(--ink-3)" }}>Basis</div>
            <div className="mono">{basis}</div>
            {isDirectCharge ? (
              <>
                <div style={{ color: "var(--ink-3)" }}>Direct to</div>
                <div>{directTo ? ALL_DEPTS.find((d) => d.code === directTo)?.name : "—"}</div>
              </>
            ) : (
              <>
                <div style={{ color: "var(--ink-3)" }}>{dept.code} driver</div>
                <div className="num">{(DRIVERS[dept.code]?.[basis] ?? 0).toLocaleString()}</div>
              </>
            )}
          </div>
          <div style={{
            marginTop: 12, padding: "8px 10px", background: "var(--paper-2)",
            fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5,
            borderLeft: "2px solid var(--ink-3)",
          }}>
            <span className="mono" style={{
              fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em",
              color: "var(--ink-3)", textTransform: "uppercase", marginRight: 6,
            }}>Rationale</span>
            {pool.basis}
          </div>
        </div>

        {/* Computation */}
        <div>
          <div className="mono" style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
            color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 8,
          }}>Computation</div>

          {isDirectCharge ? (
            <div style={{
              fontSize: 12.5, fontFamily: "var(--ff-mono)",
              padding: "10px 12px", background: "var(--paper-2)",
              border: "1px solid var(--rule)", lineHeight: 1.7,
            }}>
              {pool.eligiblePercent < 100 && (
                <div style={{ color: "var(--ink-3)" }}>
                  {fmt.dollarsK(pool.amount)} × {pool.eligiblePercent}% eligible
                </div>
              )}
              <div>direct charge → {fmt.dollars(pool.amount * (pool.eligiblePercent / 100))}</div>
            </div>
          ) : (
            <div style={{
              fontSize: 12.5, fontFamily: "var(--ff-mono)",
              padding: "10px 12px", background: "var(--paper-2)",
              border: "1px solid var(--rule)", lineHeight: 1.7,
            }}>
              {pool.eligiblePercent < 100 && (
                <div style={{ color: "var(--ink-3)" }}>
                  {fmt.dollarsK(pool.amount)} × {pool.eligiblePercent}% eligible = {fmt.dollarsK(pool.amount * (pool.eligiblePercent / 100))} allocatable
                </div>
              )}
              <div>Initial = {fmt.dollarsK(pool.amount * (pool.eligiblePercent / 100))} on {pool.center}</div>
              {view === "initial" && dept.kind === "indirect" ? (
                <div style={{ color: "var(--accent)", fontWeight: 600 }}>
                  Initial = {fmt.dollars(initialValue)}
                </div>
              ) : null}
              {view === "final" ? (
                <div style={{ color: "var(--ink-3)" }}>
                  Final = Σ step-down contributions →
                </div>
              ) : null}
            </div>
          )}

          {view === "final" && stepContribs.length > 0 ? (
            <>
              <div className="mono" style={{
                fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
                color: "var(--ink-3)", textTransform: "uppercase",
                margin: "14px 0 6px",
              }}>Step-down contributions</div>
              <div style={{ border: "1px solid var(--rule)" }}>
                {stepContribs.map((c, i) => (
                  <div key={`${c.stepIndex}-${c.fromCode}`} style={{
                    display: "flex", justifyContent: "space-between", gap: 12,
                    alignItems: "baseline",
                    padding: "5px 10px",
                    fontSize: 11.5,
                    borderBottom: i < stepContribs.length - 1 ? "1px solid var(--rule)" : "none",
                  }}>
                    <span style={{ color: "var(--ink-3)" }}>
                      <span className="mono" style={{
                        fontSize: 9.5, color: "var(--ink-4)", marginRight: 6,
                      }}>step {c.stepIndex}</span>
                      {c.fromName}
                    </span>
                    <span className="num mono" style={{
                      fontWeight: 500, whiteSpace: "nowrap",
                      fontVariantNumeric: "tabular-nums",
                    }}>{fmt.dollars(c.amount)}</span>
                  </div>
                ))}
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "6px 10px",
                  background: "var(--paper-2)",
                  fontSize: 12, fontWeight: 700,
                  borderTop: "2px solid var(--ink)",
                }}>
                  <span>Final</span>
                  <span className="num mono" style={{
                    fontVariantNumeric: "tabular-nums",
                  }}>{fmt.dollars(finalValue)}</span>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
