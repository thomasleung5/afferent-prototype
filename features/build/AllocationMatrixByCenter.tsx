
import { useMemo, useState } from "react";
import { SectionLabel } from "@/components/ui";
import { fmt } from "@/lib/format";
import {
  ALL_DEPTS, DIRECT_DEPTS,
  basisForPool, computeStepDown,
  type MatrixDeptCode,
} from "@/lib/data/capStepDown";
import { ALLOCATION_BASES } from "@/lib/data/allocationBases";
import { useBuildState } from "@/lib/store";
import {
  TracePanel, TraceSection, SummaryStrip, TraceStat,
  CollapsibleMetadata, MetadataRow,
} from "./TracePanel";

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
    (poolsByCenter.get(center) ?? []).reduce(
      (a, p) => a + p.amount * (p.eligiblePercent / 100), 0,
    );

  const centerCell = (center: string, deptCode: MatrixDeptCode): number =>
    (poolsByCenter.get(center) ?? []).reduce(
      (a, p) => a + (allocSrc[p.id]?.[deptCode] ?? 0),
      0,
    );

  const centerRowTotal = (center: string): number =>
    cols.reduce((a, d) => a + centerCell(center, d.code), 0);

  const colTotal = (deptCode: MatrixDeptCode): number =>
    capPools.reduce((a, p) => a + (allocSrc[p.id]?.[deptCode] ?? 0), 0);

  const totalCap = capPools.reduce((a, p) => a + p.amount * (p.eligiblePercent / 100), 0);
  const grandTotal = capCenterOrder.reduce((a, c) => a + centerRowTotal(c), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <SectionLabel right={`${capCenterOrder.length} centers · ${DIRECT_DEPTS.length} direct depts`}>
          Allocation Matrix
        </SectionLabel>
        <div style={{
          background: "var(--paper)", border: "1px solid var(--rule)",
          overflowX: "auto",
        }}>
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
            <div style={{ textAlign: "right" }}>Eligible $</div>
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
              {fmt.dollarsK(totalCap)}
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

  // Contributing pools — one row per pool that lands non-zero $ on the
  // selected dept. Sorted desc for the breakdown.
  const contribs = pools
    .map((p) => {
      const value = allocSrc[p.id]?.[deptCode] ?? 0;
      const { basis } = basisForPool(p, allocationBases);
      const basisMeta = ALLOCATION_BASES.find((b) => b.key === basis);
      return { pool: p, value, basis, basisLongName: basisMeta?.longName ?? basis };
    })
    .filter((r) => r.value > 0.5)
    .sort((a, b) => b.value - a.value);
  const totalToDept = contribs.reduce((a, c) => a + c.value, 0);
  const centerEligible = pools.reduce((a, p) => a + p.amount * (p.eligiblePercent / 100), 0);
  const centerShare = centerEligible > 0 ? (totalToDept / centerEligible) * 100 : 0;

  return (
    <TracePanel
      eyebrow="Center allocation trace"
      from={center}
      to={dept.name}
      onClose={onClose}
    >
      {/* Section 1 — Summary */}
      <TraceSection>
        <SummaryStrip cols={3}>
          <TraceStat
            label="Center eligible cost"
            value={fmt.dollars(centerEligible)}
            sub={`${pools.length} pool${pools.length === 1 ? "" : "s"} in ${center}`}
          />
          <TraceStat
            label="Share of center"
            value={`${centerShare.toFixed(1)}%`}
            sub={`Reaching ${dept.name} after step-down`}
          />
          <TraceStat
            label="Final allocation"
            value={fmt.dollars(totalToDept)}
            sub={contribs.length > 0
              ? `Built from ${contribs.length} pool${contribs.length === 1 ? "" : "s"}`
              : "No contributions"}
            emphasis
          />
        </SummaryStrip>
      </TraceSection>

      {/* Section 2 — Pool-by-pool breakdown (the "math" for a center cell) */}
      <TraceSection title="How this allocation was built">
        {contribs.length === 0 ? (
          <div style={{
            padding: "14px 18px",
            background: "var(--paper-2)",
            border: "1px solid var(--rule)",
            fontSize: 12.5, color: "var(--ink-3)",
          }}>
            No pool from <strong>{center}</strong> contributes to <strong>{dept.name}</strong>.
          </div>
        ) : (
          <div style={{
            border: "1px solid var(--rule)",
            background: "var(--paper-2)",
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "minmax(220px, 2fr) minmax(160px, 1.4fr) 1fr 100px",
              gap: 14,
              padding: "10px 16px",
              borderBottom: "1px solid var(--rule)",
              background: "var(--paper)",
            }}>
              {["Pool", "Basis", "Share of total", ""].map((h, i) => (
                <div key={i} className="mono" style={{
                  fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em",
                  color: "var(--ink-3)", textTransform: "uppercase",
                  textAlign: i === 3 ? "right" : "left",
                }}>{h || "Contribution"}</div>
              ))}
            </div>
            {contribs.map((c, i) => {
              const pct = totalToDept > 0 ? (c.value / totalToDept) * 100 : 0;
              return (
                <div key={c.pool.id} style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(220px, 2fr) minmax(160px, 1.4fr) 1fr 100px",
                  gap: 14, alignItems: "center",
                  padding: "10px 16px",
                  borderBottom: i < contribs.length - 1 ? "1px solid var(--rule)" : "none",
                  fontSize: 12.5,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontWeight: 500, color: "var(--ink)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{c.pool.pool}</div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: "var(--ink-2)", fontSize: 12 }}>{c.basisLongName}</div>
                    <div className="mono" style={{
                      fontSize: 10, color: "var(--ink-4)",
                      letterSpacing: "0.08em", marginTop: 2,
                    }}>{c.basis}</div>
                  </div>
                  <div style={{
                    height: 6, background: "var(--paper)",
                    border: "1px solid var(--rule)", overflow: "hidden",
                  }}>
                    <div style={{
                      width: `${pct}%`, height: "100%",
                      background: "var(--accent)",
                      transition: "width 240ms ease-out",
                    }}/>
                  </div>
                  <div className="num" style={{
                    textAlign: "right", fontVariantNumeric: "tabular-nums",
                    fontSize: 12.5, fontWeight: 500,
                  }}>{fmt.dollars(c.value)}</div>
                </div>
              );
            })}
            <div style={{
              display: "grid",
              gridTemplateColumns: "minmax(220px, 2fr) minmax(160px, 1.4fr) 1fr 100px",
              gap: 14, alignItems: "center",
              padding: "12px 16px",
              borderTop: "2px solid var(--ink)",
              background: "var(--paper)",
              fontSize: 13, fontWeight: 500,
            }}>
              <div>Total to {dept.name}</div>
              <div/>
              <div/>
              <div className="num" style={{
                textAlign: "right", color: "var(--accent)",
                fontVariantNumeric: "tabular-nums",
              }}>{fmt.dollars(totalToDept)}</div>
            </div>
          </div>
        )}
      </TraceSection>

      {/* Section 3 — Auditor metadata */}
      <CollapsibleMetadata title="Allocation metadata">
        <MetadataRow label="Center">{center}</MetadataRow>
        <MetadataRow label="Pools in center">{pools.length.toString()}</MetadataRow>
        <MetadataRow label="Eligible (center)">{fmt.dollars(centerEligible)}</MetadataRow>
        <MetadataRow label="Recipient">{dept.name} ({dept.code})</MetadataRow>
        <MetadataRow label="Allocation to recipient">{fmt.dollars(totalToDept)}</MetadataRow>
        <MetadataRow label="Share of center">{centerShare.toFixed(2)}%</MetadataRow>
        <MetadataRow label="Contributing pools">{contribs.length.toString()}</MetadataRow>
      </CollapsibleMetadata>
    </TracePanel>
  );
}
