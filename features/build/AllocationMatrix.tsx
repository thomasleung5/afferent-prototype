
import { useState, type ReactNode } from "react";
import { SectionLabel } from "@/components/ui";
import { fmt } from "@/lib/format";
import { basisForPool, ALL_DEPTS } from "@/lib/data/capStepDown";
import type { GlNode, GlStepDownModel, NodeKey } from "@/lib/data/capStepDownGl";
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
  nodeKey: NodeKey;
}

/** Step 4 of the CAP flow. Pool × node step-down matrix. Columns are the
 *  engine's glCode-keyed nodes (one indirect node per cost center, one or
 *  more direct nodes per fee dept). Cells come from the step-down engine —
 *  always engine-driven, regardless of whether per-receiver amounts were
 *  imported. Receiver imports feed driver units, not cell values. */
export function AllocationMatrix() {
  const { capPools, allocationBases, derived } = useBuildState();
  const [view, setView] = useState<View>("final");
  const [openCell, setOpenCell] = useState<OpenCell | null>(null);

  const model = derived.capStepDown;
  const indirectNodes = model.nodes.filter((n) => n.role === "indirect");
  const directNodes   = model.nodes.filter((n) => n.role === "direct");

  // Initial view shows every node (pools sit on home indirect); Final shows
  // only the direct receivers — by then indirects are all zero.
  const cols: GlNode[] = view === "initial" ? model.nodes : directNodes;
  const allocSrc = view === "initial" ? model.alloc1 : model.alloc2;

  const grid =
    `minmax(220px, 2.2fr) 96px 96px ${cols.map(() => "minmax(78px, 1fr)").join(" ")} 100px`;

  const rowTotal = (poolId: string): number =>
    cols.reduce((a, n) => a + (allocSrc[poolId]?.[n.key] ?? 0), 0);

  const colTotal = (nodeKey: NodeKey): number =>
    capPools.reduce((a, p) => a + (allocSrc[p.id]?.[nodeKey] ?? 0), 0);

  const totalEligible = capPools.reduce((a, p) => a + p.amount * (p.eligiblePercent / 100), 0);
  const grandTotal = capPools.reduce((a, p) => a + rowTotal(p.id), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <SectionLabel right={`${capPools.length} pools · ${cols.length} ${view === "initial" ? "nodes" : "direct nodes"}`}>
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
            {cols.map((n) => (
              <div key={n.key} title={n.glCode} style={{
                textAlign: "right",
                color: n.role === "direct" ? "var(--ink-2)" : "var(--ink-4)",
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

          {view === "initial" && (
            <GroupLabel>Indirect cost centers (Σ {indirectNodes.length}) · Direct nodes (Σ {directNodes.length})</GroupLabel>
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
                {cols.map((n) => {
                  const v = allocSrc[p.id]?.[n.key] ?? 0;
                  const zero = v < 0.5;
                  const isOpen = openCell?.poolId === p.id && openCell?.nodeKey === n.key;
                  const dim = view === "initial" && n.role === "indirect" && zero;
                  return (
                    <button
                      key={n.key}
                      onClick={() => !zero && setOpenCell(isOpen ? null : { poolId: p.id, nodeKey: n.key })}
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
        <CellTrace
          poolId={openCell.poolId}
          nodeKey={openCell.nodeKey}
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
      <span>Click any non-zero cell to see its formula, driver inputs, and (for Final) the contributions from each indirect node that produced the value.</span>
    </div>
  );
}

function CellTrace({
  poolId, nodeKey, view, model, onClose,
}: {
  poolId: string; nodeKey: NodeKey; view: View;
  model: GlStepDownModel;
  onClose: () => void;
}) {
  const { capPools, allocationBases, derived } = useBuildState();
  const pool = capPools.find((p) => p.id === poolId);
  const node = model.nodes.find((n) => n.key === nodeKey);
  if (!pool || !node) return null;

  const { basis, directTo } = basisForPool(pool, allocationBases);
  const isDirectCharge = basis === "DIRECT";
  const initialValue = model.alloc1[pool.id]?.[node.key] ?? 0;
  const finalValue   = model.alloc2[pool.id]?.[node.key] ?? 0;
  const cellValue = view === "initial" ? initialValue : finalValue;

  // Driver values across every node for this pool's basis. Denominators are
  // pulled from derived.capDrivers (per-node, per-basis units).
  const basisMeta = ALLOCATION_BASES.find((b) => b.key === basis);
  const driverByNode = isDirectCharge
    ? {} as Record<NodeKey, number>
    : Object.fromEntries(
        model.nodes.map((n) => [n.key, derived.capDrivers[n.key]?.[basis] ?? 0]),
      ) as Record<NodeKey, number>;
  const driverTotal = isDirectCharge
    ? 0
    : Object.values(driverByNode).reduce((a, v) => a + v, 0);
  const nodeDriver = driverByNode[node.key] ?? 0;
  const nodeShare = driverTotal > 0 ? (nodeDriver / driverTotal) * 100 : 0;
  const eligibleAmount = pool.amount * (pool.eligiblePercent / 100);

  const stepContribs = model.contributions
    .filter((c) => c.poolId === pool.id && c.toKey === node.key && c.amount > 0.5)
    .sort((a, b) => a.stepIndex - b.stepIndex);

  const directTargetName = directTo
    ? ALL_DEPTS.find((d) => d.code === directTo)?.name ?? directTo
    : undefined;

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
          detail: directTargetName
            ? `Routed entirely to ${directTargetName}`
            : "Routed to a single node",
        },
        {
          label: "Final allocation",
          value: fmt.dollars(cellValue),
          detail: `${node.name}'s full share of the pool`,
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
          label: `${node.name} share`,
          value: `${nodeDriver.toLocaleString()} / ${driverTotal.toLocaleString()} ${basisMeta?.unit ?? "units"}`,
          detail: "Node's slice of the basis denominator",
        },
        {
          label: "Allocation %",
          value: `${nodeShare.toFixed(1)}%`,
          detail: `${nodeDriver.toLocaleString()} ÷ ${driverTotal.toLocaleString()}`,
        },
        {
          label: "Final allocation",
          value: fmt.dollars(cellValue),
          detail: `${nodeShare.toFixed(1)}% × ${fmt.dollars(eligibleAmount)}`,
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
      to={node.name}
      onClose={onClose}
    >
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
              ? "Single-node routing"
              : basisMeta ? <span className="mono" style={{ letterSpacing: "0.1em" }}>{basisMeta.label}</span> : undefined}
          />
          <TraceStat
            label="Node share"
            value={
              view === "initial" ? "100%"
              : isDirectCharge ? "100%"
              : `${nodeShare.toFixed(1)}%`
            }
            sub={
              view === "initial" ? "Pre-step-down placement"
              : isDirectCharge ? "Routed to a single node"
              : `${nodeDriver.toLocaleString()} ÷ ${driverTotal.toLocaleString()} ${basisMeta?.unit ?? ""}`
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
              <div key={`${c.stepIndex}-${c.fromKey}`} style={{
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
              <span>Final allocation to {node.name}</span>
              <span className="num mono" style={{
                fontVariantNumeric: "tabular-nums",
                color: "var(--accent)",
              }}>{fmt.dollars(finalValue)}</span>
            </div>
          </div>
        )}
      </TraceSection>

      <CollapsibleMetadata title="Allocation metadata">
        <MetadataRow label="Pool ID">{pool.id}</MetadataRow>
        <MetadataRow label="Cost center">{pool.center}</MetadataRow>
        <MetadataRow label="Pool name">{pool.pool}</MetadataRow>
        <MetadataRow label="Raw amount">{fmt.dollars(pool.amount)}</MetadataRow>
        <MetadataRow label="Eligible %">{pool.eligiblePercent}%</MetadataRow>
        <MetadataRow label="Excluded">{fmt.dollars(pool.amount * (1 - pool.eligiblePercent / 100))}</MetadataRow>
        <MetadataRow label="Basis code">{basis}</MetadataRow>
        {pool.basis && <MetadataRow label="Basis rationale">{pool.basis}</MetadataRow>}
        {isDirectCharge && directTargetName && (
          <MetadataRow label="Direct target">{directTargetName}</MetadataRow>
        )}
        <MetadataRow label="Receiver node">{node.name}</MetadataRow>
        <MetadataRow label="Receiver glCode">{node.glCode.startsWith("seed:") ? "—" : node.glCode}</MetadataRow>
        {!isDirectCharge && (
          <>
            <MetadataRow label={`${node.name} driver value`}>{nodeDriver.toLocaleString()} {basisMeta?.unit ?? ""}</MetadataRow>
            <MetadataRow label="Total driver">{driverTotal.toLocaleString()} {basisMeta?.unit ?? ""}</MetadataRow>
          </>
        )}
        <MetadataRow label="Initial placement">{fmt.dollars(initialValue)}</MetadataRow>
        <MetadataRow label="Final placement">{fmt.dollars(finalValue)}</MetadataRow>
      </CollapsibleMetadata>
    </TracePanel>
  );
}
