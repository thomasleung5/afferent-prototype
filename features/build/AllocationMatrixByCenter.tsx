
import { useMemo, useState } from "react";
import { SectionLabel } from "@/components/ui";
import { fmt } from "@/lib/format";
import { basisForPool } from "@/lib/data/capStepDown";
import type { GlNode, GlStepDownModel, NodeKey } from "@/lib/data/capStepDownGl";
import { ALLOCATION_BASES } from "@/lib/data/allocationBases";
import { useBuildState } from "@/lib/store";
import {
  TracePanel, TraceSection, SummaryStrip, TraceStat,
  CollapsibleMetadata, MetadataRow,
} from "./TracePanel";

interface OpenCell {
  center: string;
  nodeKey: NodeKey;
}

/** Step 5 of the CAP flow. Center × direct-node aggregated matrix. Columns
 *  are the engine's direct nodes (per-glCode PLAN/BLDG/ENG receivers, plus
 *  any other direct nodes the registry produces). Cells come from the
 *  step-down engine — always engine-driven. */
export function AllocationMatrixByCenter() {
  const { capPools, capCenterOrder, derived } = useBuildState();
  const [openCell, setOpenCell] = useState<OpenCell | null>(null);

  const model = derived.capStepDown;
  const cols: GlNode[] = model.nodes.filter((n) => n.role === "direct");
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

  const centerCell = (center: string, nodeKey: NodeKey): number =>
    (poolsByCenter.get(center) ?? []).reduce(
      (a, p) => a + (allocSrc[p.id]?.[nodeKey] ?? 0),
      0,
    );

  const centerRowTotal = (center: string): number =>
    cols.reduce((a, n) => a + centerCell(center, n.key), 0);

  const colTotal = (nodeKey: NodeKey): number =>
    capPools.reduce((a, p) => a + (allocSrc[p.id]?.[nodeKey] ?? 0), 0);

  const totalCap = capPools.reduce((a, p) => a + p.amount * (p.eligiblePercent / 100), 0);
  const grandTotal = capCenterOrder.reduce((a, c) => a + centerRowTotal(c), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <SectionLabel right={`${capCenterOrder.length} centers · ${cols.length} direct nodes`}>
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
            {cols.map((n) => (
              <div key={n.key} title={n.glCode} style={{
                textAlign: "right", color: "var(--ink-2)",
                fontFamily: "var(--ff-ui)", fontSize: 11, fontWeight: 500,
                letterSpacing: 0, textTransform: "none", lineHeight: 1.3,
                overflow: "hidden",
              }}>
                <div style={{
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{n.name}</div>
                <div className="mono" style={{
                  fontSize: 9.5, color: "var(--ink-4)", letterSpacing: "0.04em",
                  textTransform: "uppercase", marginTop: 2,
                }}>{n.glCode.startsWith("seed:") ? "—" : n.glCode}</div>
              </div>
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
                {cols.map((n) => {
                  const v = centerCell(center, n.key);
                  const zero = v < 0.5;
                  const isOpen = openCell?.center === center && openCell?.nodeKey === n.key;
                  return (
                    <button
                      key={n.key}
                      onClick={() => !zero && setOpenCell(isOpen ? null : { center, nodeKey: n.key })}
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
            {cols.map((n) => {
              const t = colTotal(n.key);
              const zero = t < 0.5;
              return (
                <div key={n.key} className="num" style={{
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
          nodeKey={openCell.nodeKey}
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
      <span>Click any non-zero cell to see its formula, driver inputs, and the contributions from each pool in the center.</span>
    </div>
  );
}

function CenterCellTrace({
  center, nodeKey, model, onClose,
}: {
  center: string; nodeKey: NodeKey;
  model: GlStepDownModel;
  onClose: () => void;
}) {
  const { capPools, allocationBases } = useBuildState();
  const node = model.nodes.find((n) => n.key === nodeKey);
  if (!node) return null;

  const pools = capPools.filter((p) => p.center === center);
  const allocSrc = model.alloc2;

  const contribs = pools
    .map((p) => {
      const value = allocSrc[p.id]?.[nodeKey] ?? 0;
      const first  = model.firstAllocation[p.id]?.[nodeKey] ?? 0;
      const second = model.secondAllocation[p.id]?.[nodeKey] ?? 0;
      const { basis } = basisForPool(p, allocationBases);
      const basisMeta = ALLOCATION_BASES.find((b) => b.key === basis);
      return {
        pool: p, value, first, second,
        basis, basisLongName: basisMeta?.longName ?? basis,
      };
    })
    .filter((r) => r.value > 0.5)
    .sort((a, b) => b.value - a.value);
  const totalToNode = contribs.reduce((a, c) => a + c.value, 0);
  const centerEligible = pools.reduce((a, p) => a + p.amount * (p.eligiblePercent / 100), 0);
  const centerShare = centerEligible > 0 ? (totalToNode / centerEligible) * 100 : 0;

  return (
    <TracePanel
      eyebrow="Center allocation trace"
      from={center}
      to={node.name}
      onClose={onClose}
    >
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
            sub={`Reaching ${node.name} after step-down`}
          />
          <TraceStat
            label="Final allocation"
            value={fmt.dollars(totalToNode)}
            sub={contribs.length > 0
              ? `Built from ${contribs.length} pool${contribs.length === 1 ? "" : "s"}`
              : "No contributions"}
            emphasis
          />
        </SummaryStrip>
      </TraceSection>

      <TraceSection title="How this allocation was built">
        {contribs.length === 0 ? (
          <div style={{
            padding: "14px 18px",
            background: "var(--paper-2)",
            border: "1px solid var(--rule)",
            fontSize: 12.5, color: "var(--ink-3)",
          }}>
            No pool from <strong>{center}</strong> contributes to <strong>{node.name}</strong>.
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
              const pct = totalToNode > 0 ? (c.value / totalToNode) * 100 : 0;
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
                  <div style={{
                    textAlign: "right", fontVariantNumeric: "tabular-nums",
                  }}>
                    <div className="num" style={{
                      fontSize: 12.5, fontWeight: 500,
                    }}>{fmt.dollars(c.value)}</div>
                    {c.second > 0.5 && (
                      <div className="mono" style={{
                        fontSize: 10, color: "var(--ink-4)", marginTop: 2,
                      }}>{fmt.dollars(c.first)} 1st + {fmt.dollars(c.second)} 2nd</div>
                    )}
                  </div>
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
              <div>Total to {node.name}</div>
              <div/>
              <div/>
              <div className="num" style={{
                textAlign: "right", color: "var(--accent)",
                fontVariantNumeric: "tabular-nums",
              }}>{fmt.dollars(totalToNode)}</div>
            </div>
          </div>
        )}
      </TraceSection>

      <CollapsibleMetadata title="Allocation metadata">
        <MetadataRow label="Center">{center}</MetadataRow>
        <MetadataRow label="Pools in center">{pools.length.toString()}</MetadataRow>
        <MetadataRow label="Eligible (center)">{fmt.dollars(centerEligible)}</MetadataRow>
        <MetadataRow label="Recipient node">{node.name}</MetadataRow>
        <MetadataRow label="Recipient glCode">{node.glCode.startsWith("seed:") ? "—" : node.glCode}</MetadataRow>
        <MetadataRow label="Allocation to recipient">{fmt.dollars(totalToNode)}</MetadataRow>
        <MetadataRow label="Share of center">{centerShare.toFixed(2)}%</MetadataRow>
        <MetadataRow label="Contributing pools">{contribs.length.toString()}</MetadataRow>
      </CollapsibleMetadata>
    </TracePanel>
  );
}
