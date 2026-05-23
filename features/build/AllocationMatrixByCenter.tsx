
import { useMemo, useState } from "react";
import { SectionLabel } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { GlNode, GlStepDownModel, NodeKey } from "@/lib/data/capStepDownGl";
import { useBuildState } from "@/lib/store";
import {
  TracePanel, TraceSection, SummaryStrip, TraceStat,
  BigFormula, CollapsibleMetadata, MetadataRow,
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
  // Columns = direct receiver nodes, sorted by glCode so the x-axis reads
  // in fund-program order (matches NBS publications). Seed nodes (no real
  // glCode) sort last so the imported receivers stay grouped on the left.
  const cols: GlNode[] = [...model.nodes.filter((n) => n.role === "direct")]
    .sort((a, b) => {
      const aSeed = a.glCode.startsWith("seed:");
      const bSeed = b.glCode.startsWith("seed:");
      if (aSeed !== bSeed) return aSeed ? 1 : -1;
      return a.glCode.localeCompare(b.glCode);
    });
  // Cost center → imported glCode for the row-label glCode prefix.
  const glCodeByCenter = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of model.nodes) {
      if (n.role !== "indirect") continue;
      if (n.glCode.startsWith("seed:")) continue;
      m.set(n.name, n.glCode);
    }
    return m;
  }, [model.nodes]);
  const allocSrc = model.alloc2;

  // Real <table> + <colgroup> own the column widths; sticky behavior is
  // applied to actual <th>/<td> cells. One table inside one horizontal
  // scroll container — no overlay tables, no cloned columns, no transforms.
  const CENTER_W = 260;       // px — sticky left
  const COL_W = 96;           // px — every non-frozen matrix column
  const ROW_TOTAL_W = 110;    // px — sticky right
  const tableWidth = CENTER_W + cols.length * COL_W + ROW_TOTAL_W;

  // Sticky cells must clip with ellipsis so long Center names never bleed
  // past the column edge into scrolling cells underneath.
  const cellPad = "9px 12px";
  const stickyEllipsis = {
    overflow: "hidden" as const,
    whiteSpace: "nowrap" as const,
    textOverflow: "ellipsis" as const,
    boxSizing: "border-box" as const,
  };

  // z-index layering:
  //   2 — sticky body cells (above scrolling body cells beneath them)
  //   4 — sticky header/footer corner cells (above everything)
  const stickyLeftBody = {
    ...stickyEllipsis,
    position: "sticky" as const, left: 0, zIndex: 2,
    background: "var(--paper)",
    padding: cellPad,
    boxShadow: "1px 0 0 var(--rule)",
    textAlign: "left" as const,
  };
  const stickyRightBody = {
    ...stickyEllipsis,
    position: "sticky" as const, right: 0, zIndex: 2,
    background: "var(--paper)",
    padding: cellPad,
    boxShadow: "-1px 0 0 var(--rule)",
    textAlign: "right" as const,
  };
  const stickyLeftBand = {
    ...stickyEllipsis,
    position: "sticky" as const, left: 0, zIndex: 4,
    background: "var(--paper-2)",
    padding: cellPad,
    boxShadow: "1px 0 0 var(--rule)",
    textAlign: "left" as const,
  };
  const stickyRightBand = {
    ...stickyEllipsis,
    position: "sticky" as const, right: 0, zIndex: 4,
    background: "var(--paper-2)",
    padding: cellPad,
    boxShadow: "-1px 0 0 var(--rule)",
    textAlign: "right" as const,
  };

  const poolsByCenter = useMemo(() => {
    const m = new Map<string, typeof capPools>();
    for (const p of capPools) {
      const list = m.get(p.center) ?? [];
      list.push(p);
      m.set(p.center, list);
    }
    return m;
  }, [capPools]);

  const centerCell = (center: string, nodeKey: NodeKey): number =>
    (poolsByCenter.get(center) ?? []).reduce(
      (a, p) => a + (allocSrc[p.id]?.[nodeKey] ?? 0),
      0,
    );

  const centerRowTotal = (center: string): number =>
    cols.reduce((a, n) => a + centerCell(center, n.key), 0);

  const colTotal = (nodeKey: NodeKey): number =>
    capPools.reduce((a, p) => a + (allocSrc[p.id]?.[nodeKey] ?? 0), 0);

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
          position: "relative",
        }}>
          <table style={{
            borderCollapse: "separate",
            borderSpacing: 0,
            tableLayout: "fixed",
            width: tableWidth,
            fontVariantNumeric: "tabular-nums",
          }}>
            <colgroup>
              <col style={{ width: CENTER_W }}/>
              {cols.map((n) => <col key={n.key} style={{ width: COL_W }}/>)}
              <col style={{ width: ROW_TOTAL_W }}/>
            </colgroup>
            <thead>
              <tr>
                <th style={{
                  ...stickyLeftBand,
                  borderBottom: "1px solid var(--rule-strong)",
                  fontFamily: "var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
                  letterSpacing: "0.06em", color: "var(--ink-3)", textTransform: "uppercase",
                }}>Cost Center</th>
                {cols.map((n) => (
                  <th key={n.key} title={n.glCode} style={{
                    padding: cellPad,
                    background: "var(--paper-2)",
                    borderBottom: "1px solid var(--rule-strong)",
                    textAlign: "right",
                    verticalAlign: "bottom",
                    color: "var(--ink-2)",
                    fontFamily: "var(--ff-ui)", fontSize: 11, fontWeight: 500,
                    letterSpacing: 0, textTransform: "none", lineHeight: 1.3,
                    overflow: "hidden",
                  }}>
                    <div style={{
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{n.name}</div>
                    <div className="mono" style={{
                      fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.04em",
                      textTransform: "uppercase", marginTop: 2,
                    }}>{n.glCode.startsWith("seed:") ? "—" : n.glCode}</div>
                  </th>
                ))}
                <th style={{
                  ...stickyRightBand,
                  borderBottom: "1px solid var(--rule-strong)",
                  fontFamily: "var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
                  letterSpacing: "0.06em", color: "var(--ink-3)", textTransform: "uppercase",
                }}>Row total</th>
              </tr>
            </thead>
            <tbody>
              {capCenterOrder.map((center, i) => {
                const pools = poolsByCenter.get(center) ?? [];
                if (pools.length === 0) return null;
                const rt = centerRowTotal(center);
                const isLast = i === capCenterOrder.length - 1;
                const rowBorder = isLast ? "none" : "1px solid var(--rule)";
                return (
                  <tr key={center} className="tbl-row-hover">
                    <td style={{
                      ...stickyLeftBody,
                      borderBottom: rowBorder,
                      fontFamily: "var(--ff-ui)", fontSize: 13, lineHeight: 1.3,
                      fontWeight: 500, color: "var(--ink)",
                    }}>
                      {glCodeByCenter.get(center) && (
                        <span className="mono" style={{
                          fontSize: 10.5, color: "var(--ink-3)", marginRight: 6,
                          letterSpacing: "0.02em", fontWeight: 400,
                        }}>{glCodeByCenter.get(center)}</span>
                      )}
                      {center}
                    </td>
                    {cols.map((n) => {
                      const v = centerCell(center, n.key);
                      const zero = v < 0.5;
                      const isOpen = openCell?.center === center && openCell?.nodeKey === n.key;
                      return (
                        <td key={n.key} style={{
                          padding: 0,
                          borderBottom: rowBorder,
                          background: isOpen ? "var(--accent-tint)" : "transparent",
                          textAlign: "right",
                        }}>
                          <button
                            type="button"
                            onClick={() => !zero && setOpenCell(isOpen ? null : { center, nodeKey: n.key })}
                            title={zero ? "—" : `${fmt.dollars(v)} — click for trace`}
                            style={{
                              display: "block", width: "100%",
                              textAlign: "right", padding: "7px 10px",
                              fontSize: 12.5,
                              fontFamily: "var(--ff-mono)",
                              fontVariantNumeric: "tabular-nums",
                              color: zero ? "var(--ink-4)" : "var(--ink)",
                              fontWeight: isOpen ? 600 : 400,
                              background: "transparent",
                              border: isOpen ? "1px solid var(--accent)" : "1px solid transparent",
                              cursor: zero ? "default" : "pointer",
                            }}
                          >
                            {zero ? "—" : fmt.dollarsK(v)}
                          </button>
                        </td>
                      );
                    })}
                    <td className="num" style={{
                      ...stickyRightBody,
                      borderBottom: rowBorder,
                      fontFamily: "var(--ff-mono)",
                      fontSize: 12.5, color: "var(--ink)",
                    }}>{fmt.dollarsK(rt)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="mono" style={{
                  ...stickyLeftBand,
                  borderTop: "2px solid var(--ink)",
                  fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em",
                  textTransform: "uppercase", color: "var(--ink-3)",
                }}>Column total</td>
                {cols.map((n) => {
                  const t = colTotal(n.key);
                  const zero = t < 0.5;
                  return (
                    <td key={n.key} className="num" style={{
                      padding: cellPad,
                      background: "var(--paper-2)",
                      borderTop: "2px solid var(--ink)",
                      textAlign: "right", fontSize: 12.5,
                      fontFamily: "var(--ff-mono)",
                      color: zero ? "var(--ink-4)" : "var(--ink)",
                    }}>{zero ? "—" : fmt.dollarsK(t)}</td>
                  );
                })}
                <td className="num" style={{
                  ...stickyRightBand,
                  borderTop: "2px solid var(--ink)",
                  fontFamily: "var(--ff-mono)",
                  fontSize: 13, color: "var(--ink)", fontWeight: 600,
                }}>{fmt.dollarsK(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
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
      <span>Click any non-zero cell to see how it's calculated.</span>
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
  const { capPools } = useBuildState();
  const node = model.nodes.find((n) => n.key === nodeKey);
  if (!node) return null;

  const pools = capPools.filter((p) => p.center === center);
  const allocSrc = model.alloc2;

  const totalToNode = pools.reduce(
    (a, p) => a + (allocSrc[p.id]?.[nodeKey] ?? 0),
    0,
  );
  // Per-pool First / Second contributions to this recipient node. The
  // engine's two-phase step-down produces these — we surface them so the
  // user can audit which pool delivered which dollars.
  const perPool = pools
    .map((p) => {
      const first  = model.firstAllocation[p.id]?.[nodeKey] ?? 0;
      const second = model.secondAllocation[p.id]?.[nodeKey] ?? 0;
      return { id: p.id, pool: p.pool, first, second, total: first + second };
    })
    .filter((r) => r.total > 0.5)
    .sort((a, b) => b.total - a.total);
  const firstTotal = perPool.reduce((a, r) => a + r.first, 0);
  const secondTotal = perPool.reduce((a, r) => a + r.second, 0);
  const centerEligible = pools.reduce((a, p) => a + p.amount, 0);
  const centerShare = centerEligible > 0 ? (totalToNode / centerEligible) * 100 : 0;

  const recipientGl = node.glCode.startsWith("seed:") ? "—" : node.glCode;
  const breakdownGrid = "minmax(220px, 2fr) 1fr 1fr 1fr";
  const fmtMoney = (v: number) => v < 0.5 ? "—" : fmt.dollars(v);

  return (
    <TracePanel
      eyebrow="Center allocation trace"
      from={center}
      to={node.name}
      onClose={onClose}
    >
      <TraceSection>
        <SummaryStrip cols={4}>
          <TraceStat
            label="Center"
            value={center}
            sub={`${pools.length} pool${pools.length === 1 ? "" : "s"}`}
          />
          <TraceStat
            label="Recipient"
            value={node.name}
            sub={node.role === "indirect" ? "Indirect cost center" : "Direct receiver"}
          />
          <TraceStat
            label="Share of center"
            value={`${centerShare.toFixed(1)}%`}
            sub={`of ${fmt.dollars(centerEligible)} allocable`}
          />
          <TraceStat
            label="Final allocation"
            value={fmt.dollars(totalToNode)}
            emphasis
          />
        </SummaryStrip>
      </TraceSection>

      <TraceSection title="How this allocation is calculated">
        <BigFormula>
          {fmt.dollars(firstTotal)}
          {"  +  "}
          {fmt.dollars(secondTotal)}
          {"  =  "}
          <span style={{ color: "var(--accent)" }}>{fmt.dollars(totalToNode)}</span>
        </BigFormula>

        {perPool.length === 0 ? (
          <div style={{
            marginTop: 14,
            padding: "14px 18px",
            background: "var(--paper-2)",
            border: "1px solid var(--rule)",
            fontSize: 12.5, color: "var(--ink-3)",
          }}>
            No pool from <strong>{center}</strong> contributes to <strong>{node.name}</strong>.
          </div>
        ) : (
          <div style={{
            marginTop: 14,
            border: "1px solid var(--rule)",
            background: "var(--paper-2)",
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: breakdownGrid,
              gap: 14,
              padding: "10px 16px",
              borderBottom: "1px solid var(--rule)",
              background: "var(--paper)",
            }}>
              {["Pool", "First", "Second", "Total"].map((h, i) => (
                <div key={i} className="mono" style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
                  color: "var(--ink-3)", textTransform: "uppercase",
                  textAlign: i === 0 ? "left" : "right",
                }}>{h}</div>
              ))}
            </div>
            {perPool.map((r, i) => (
              <div key={r.id} style={{
                display: "grid",
                gridTemplateColumns: breakdownGrid,
                gap: 14, alignItems: "center",
                padding: "8px 16px",
                borderBottom: i < perPool.length - 1 ? "1px solid var(--rule)" : "none",
                fontSize: 12.5,
              }}>
                <div style={{
                  minWidth: 0,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  color: "var(--ink)", fontWeight: 500,
                }}>{r.pool}</div>
                <div className="num" style={{
                  textAlign: "right",
                  color: r.first < 0.5 ? "var(--ink-4)" : "var(--ink-2)",
                  fontVariantNumeric: "tabular-nums",
                }}>{fmtMoney(r.first)}</div>
                <div className="num" style={{
                  textAlign: "right",
                  color: r.second < 0.5 ? "var(--ink-4)" : "var(--ink-2)",
                  fontVariantNumeric: "tabular-nums",
                }}>{fmtMoney(r.second)}</div>
                <div className="num" style={{
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 600,
                }}>{fmtMoney(r.total)}</div>
              </div>
            ))}
            <div style={{
              display: "grid",
              gridTemplateColumns: breakdownGrid,
              gap: 14, alignItems: "center",
              padding: "10px 16px",
              borderTop: "2px solid var(--ink)",
              background: "var(--paper)",
              fontSize: 13, fontWeight: 500,
            }}>
              <div>Total</div>
              <div className="num" style={{
                textAlign: "right", fontVariantNumeric: "tabular-nums",
              }}>{fmt.dollars(firstTotal)}</div>
              <div className="num" style={{
                textAlign: "right", fontVariantNumeric: "tabular-nums",
              }}>{fmt.dollars(secondTotal)}</div>
              <div className="num" style={{
                textAlign: "right", color: "var(--accent)",
                fontVariantNumeric: "tabular-nums", fontWeight: 600,
              }}>{fmt.dollars(totalToNode)}</div>
            </div>
          </div>
        )}
      </TraceSection>

      <CollapsibleMetadata title="Allocation metadata">
        <MetadataRow label="Center">{center}</MetadataRow>
        <MetadataRow label="Pools in center">{pools.length.toString()}</MetadataRow>
        <MetadataRow label="Allocable (center)">{fmt.dollars(centerEligible)}</MetadataRow>
        <MetadataRow label="Recipient node">{node.name}</MetadataRow>
        <MetadataRow label="Recipient glCode">{recipientGl}</MetadataRow>
        <MetadataRow label="First Allocation">{fmt.dollars(firstTotal)}</MetadataRow>
        <MetadataRow label="Second Allocation">{fmt.dollars(secondTotal)}</MetadataRow>
        <MetadataRow label="Allocation to recipient">{fmt.dollars(totalToNode)}</MetadataRow>
        <MetadataRow label="Share of center">{centerShare.toFixed(2)}%</MetadataRow>
        <MetadataRow label="Recipient group">{node.role === "indirect" ? "Indirect cost center" : "Direct receiver"}</MetadataRow>
      </CollapsibleMetadata>
    </TracePanel>
  );
}
