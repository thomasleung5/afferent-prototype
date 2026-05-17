
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui";
import { fmt } from "@/lib/format";
import {
  ALL_DEPTS, DIRECT_DEPTS,
  basisForPool, computeStepDown,
  type MatrixDeptCode,
} from "@/lib/data/capStepDown";
import { useBuildState } from "@/lib/store";

interface OpenCell {
  center: string;
  deptCode: MatrixDeptCode;
}

/** Step 5 of the CAP flow. Center × dept aggregated matrix.
 *
 *  Same step-down model as the pool-level matrix, but rows are collapsed
 *  to one per cost center. Cell click opens a center-level trace listing
 *  each contributing pool with its basis.
 */
export function AllocationMatrixByCenter() {
  const { capPools, capCenterOrder, allocationBases } = useBuildState();
  const [openCell, setOpenCell] = useState<OpenCell | null>(null);

  const model = useMemo(
    () => computeStepDown(capPools, capCenterOrder, allocationBases),
    [capPools, capCenterOrder, allocationBases],
  );

  // Final placement only — indirect depts have been closed via step-down.
  const cols = DIRECT_DEPTS;
  const allocSrc = model.alloc2;

  const grid =
    `minmax(220px, 2.2fr) 96px 96px ${cols.map(() => "minmax(78px, 1fr)").join(" ")} 100px`;

  const poolsByCenter = useMemo(() => {
    const m = new Map<string, typeof capPools>();
    for (const p of capPools) {
      const list = m.get(p.center) ?? [];
      list.push(p);
      m.set(p.center, list);
    }
    return m;
  }, [capPools]);

  const centerAmount = (center: string): number =>
    (poolsByCenter.get(center) ?? []).reduce((a, p) => a + p.amount, 0);

  const centerCell = (center: string, deptCode: MatrixDeptCode): number =>
    (poolsByCenter.get(center) ?? []).reduce(
      (a, p) => a + (allocSrc[p.id]?.[deptCode] ?? 0),
      0,
    );

  const centerRowTotal = (center: string): number =>
    cols.reduce((a, d) => a + centerCell(center, d.code), 0);

  const colTotal = (deptCode: MatrixDeptCode): number =>
    capPools.reduce((a, p) => a + (allocSrc[p.id]?.[deptCode] ?? 0), 0);

  const totalCap = capPools.reduce((a, p) => a + p.amount, 0);
  const grandTotal = capCenterOrder.reduce((a, c) => a + centerRowTotal(c), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{
        background: "var(--paper)", border: "1px solid var(--rule)",
        overflowX: "auto",
      }}>
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--rule)",
        }}>
          <div className="display" style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>
            Allocation Matrix
          </div>
        </div>
        <div style={{ minWidth: 960 }}>
          {/* Header */}
          <div style={{
            display: "grid", gridTemplateColumns: grid, gap: 8,
            padding: "10px 14px",
            background: "var(--paper-2)",
            borderBottom: "1px solid var(--rule-strong)",
            fontFamily: "var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
            letterSpacing: "0.06em", color: "var(--ink-3)", textTransform: "uppercase",
          }}>
            <div>Center</div>
            <div style={{ textAlign: "right" }}>Center $</div>
            <div>Pools</div>
            {cols.map((d) => (
              <div key={d.code} style={{
                textAlign: "right",
                color: d.kind === "direct" ? "var(--ink-2)" : "var(--ink-4)",
              }}>{d.code}</div>
            ))}
            <div style={{ textAlign: "right" }}>Row total</div>
          </div>

          {/* Rows — one per cost center (aggregates pools within the center) */}
          {capCenterOrder.map((center, i) => {
            const pools = poolsByCenter.get(center) ?? [];
            if (pools.length === 0) return null;
            const rt = centerRowTotal(center);
            const amt = centerAmount(center);
            const isLast = i === capCenterOrder.length - 1;
            return (
              <div key={center} style={{
                display: "grid", gridTemplateColumns: grid, gap: 8,
                padding: "7px 14px",
                borderBottom: isLast ? "none" : "1px solid var(--rule)",
                alignItems: "center",
                fontFamily: "var(--ff-mono)",
                fontVariantNumeric: "tabular-nums",
              }}>
                <div style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, lineHeight: 1.3 }}>
                  <div style={{ fontWeight: 500 }}>{center}</div>
                </div>
                <div className="num" style={{ textAlign: "right", fontSize: 12 }}>
                  {fmt.dollarsK(amt)}
                </div>
                <div className="mono" style={{
                  fontSize: 10.5, color: "var(--ink-3)",
                  letterSpacing: "0.04em",
                }}>{pools.length} pool{pools.length === 1 ? "" : "s"}</div>
                {cols.map((d) => {
                  const v = centerCell(center, d.code);
                  const zero = v < 0.5;
                  const isOpen = openCell?.center === center && openCell?.deptCode === d.code;
                  return (
                    <button
                      key={d.code}
                      onClick={() => !zero && setOpenCell(isOpen ? null : { center, deptCode: d.code })}
                      title={zero ? "—" : `${fmt.dollars(v)} — click for trace`}
                      style={{
                        textAlign: "right", padding: "3px 4px",
                        fontSize: 11.5,
                        fontFamily: "var(--ff-mono)",
                        fontVariantNumeric: "tabular-nums",
                        color: zero ? "var(--ink-4)" : "var(--ink)",
                        fontWeight: isOpen ? 700 : 500,
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
                  textAlign: "right", fontSize: 12, fontWeight: 600,
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
            <div className="num" style={{ textAlign: "right", fontSize: 12.5, fontWeight: 600 }}>
              {fmt.dollarsK(totalCap)}
            </div>
            <div/>
            {cols.map((d) => {
              const t = colTotal(d.code);
              const zero = t < 0.5;
              return (
                <div key={d.code} className="num" style={{
                  textAlign: "right", fontSize: 12, fontWeight: 600,
                  color: zero ? "var(--ink-4)" : "var(--ink)",
                }}>{zero ? "—" : fmt.dollarsK(t)}</div>
              );
            })}
            <div className="num" style={{
              textAlign: "right", fontSize: 13, fontWeight: 700,
            }}>{fmt.dollarsK(grandTotal)}</div>
          </div>
        </div>
      </div>

      {openCell ? (
        <CenterCellTrace
          center={openCell.center}
          deptCode={openCell.deptCode}
          model={model}
          onClose={() => setOpenCell(null)}
        />
      ) : (
        <TraceHint/>
      )}
    </div>
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

function CenterCellTrace({
  center, deptCode, model, onClose,
}: {
  center: string; deptCode: MatrixDeptCode;
  model: ReturnType<typeof computeStepDown>;
  onClose: () => void;
}) {
  const { capPools, allocationBases } = useBuildState();
  const dept = ALL_DEPTS.find((d) => d.code === deptCode);
  if (!dept) return null;

  const pools = capPools.filter((p) => p.center === center);
  const allocSrc = model.alloc2;
  const contribs = pools
    .map((p) => ({
      pool: p,
      value: allocSrc[p.id]?.[deptCode] ?? 0,
      basis: basisForPool(p, allocationBases).basis,
    }))
    .filter((r) => r.value > 0.5)
    .sort((a, b) => b.value - a.value);
  const total = contribs.reduce((a, c) => a + c.value, 0);
  const centerTotal = pools.reduce((a, p) => a + p.amount, 0);

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
          {center} <span style={{ color: "var(--ink-3)" }}>→</span> {dept.name}
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
        {/* Center inputs */}
        <div>
          <div className="mono" style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
            color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 8,
          }}>Center inputs</div>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr auto", gap: "5px 12px",
            fontSize: 12,
          }}>
            <div style={{ color: "var(--ink-3)" }}>Center</div>
            <div>{center}</div>
            <div style={{ color: "var(--ink-3)" }}>Pools</div>
            <div className="num">{pools.length}</div>
            <div style={{ color: "var(--ink-3)" }}>Total amount</div>
            <div className="num" style={{ fontWeight: 600 }}>{fmt.dollars(centerTotal)}</div>
            <div style={{ color: "var(--ink-3)" }}>To {dept.code}</div>
            <div className="num" style={{ fontWeight: 600, color: "var(--accent)" }}>
              {fmt.dollars(total)}
            </div>
          </div>
        </div>

        {/* Pool breakdown */}
        <div>
          <div className="mono" style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
            color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 8,
          }}>Pool breakdown</div>
          {contribs.length === 0 ? (
            <div style={{
              fontSize: 12.5, fontFamily: "var(--ff-mono)",
              padding: "10px 12px", background: "var(--paper-2)",
              border: "1px solid var(--rule)", color: "var(--ink-3)",
            }}>No pool contributions to {dept.code}.</div>
          ) : (
            <div style={{ border: "1px solid var(--rule)" }}>
              {contribs.map((c, i) => (
                <div key={c.pool.id} style={{
                  display: "flex", justifyContent: "space-between", gap: 12,
                  alignItems: "baseline",
                  padding: "5px 10px",
                  fontSize: 11.5,
                  borderBottom: i < contribs.length - 1 ? "1px solid var(--rule)" : "none",
                }}>
                  <span style={{ color: "var(--ink-3)" }}>
                    <span style={{ color: "var(--ink-2)" }}>{c.pool.pool}</span>
                    <span className="mono" style={{
                      fontSize: 9.5, color: "var(--ink-4)", marginLeft: 6,
                    }}>{c.basis}</span>
                  </span>
                  <span className="num mono" style={{
                    fontWeight: 500, whiteSpace: "nowrap",
                    fontVariantNumeric: "tabular-nums",
                  }}>{fmt.dollars(c.value)}</span>
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
                }}>{fmt.dollars(total)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
