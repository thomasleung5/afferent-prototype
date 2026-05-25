import { useMemo, useState } from "react";
import { CellInput, SectionLabel } from "@/components/ui";
import { fmt } from "@/lib/format";
import { basisForPool } from "@/lib/data/capStepDown";
import type { GlNode } from "@/lib/data/capStepDownGl";
import { useBuildState } from "@/lib/store";

/** Per-pool Allocation Detail report in the standard published CAP format.
 *
 *  For the selected pool, lists every node split into ALLOCABLE BUDGET UNITS
 *  (indirect — other cost centers) and RECEIVING BUDGET UNITS (direct
 *  departments and OTHER funds), with columns:
 *    Allocation Units · Allocated Percent · Gross Allocation ·
 *    Direct Billed · First Allocation · Second Allocation · Total
 *
 *  First Allocation = pool's own eligible × receiver percent (or pool's R1
 *  incoming × receiver percent for zero-eligible internal-service units —
 *  matches the published "Gross Allocation" column).
 *  Second Allocation = pool's R2 incoming × receiver percent, self
 *  excluded and renormalized.
 *
 *  Cross-checks the engine output against the source CAP PDF row-by-row. */
export function AllocationDetailReport() {
  const {
    capPools, allocationBases, capBasisUnits, capDirectAllocations,
    setDirectBill, derived,
  } = useBuildState();
  const model = derived.capStepDown;
  const basisUnitsByBasisId = useMemo(
    () => new Map(capBasisUnits.map((bu) => [bu.basisId, bu])),
    [capBasisUnits],
  );
  const directByPoolId = useMemo(
    () => new Map(capDirectAllocations.map((da) => [da.poolId, da])),
    [capDirectAllocations],
  );

  // Center identity key → imported glCode (e.g. "011-1200" for
  // City Manager). Synth `seed:center:*` keys resolve to undefined,
  // which CenterCode renders as "—".
  const glCodeByCenterKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of model.nodes) {
      if (n.role !== "indirect") continue;
      if (n.glCode.startsWith("seed:")) continue;
      m.set(n.key, n.glCode);
    }
    return m;
  }, [model.nodes]);

  // Center identity key → display name from the engine's indirect nodes
  // (the engine reads it from capCenterSources). Used to render row
  // labels in the Costs-to-be-Allocated table when iterating step order.
  const nameByCenterKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of model.nodes) {
      if (n.role === "indirect") m.set(n.key, n.name);
    }
    return m;
  }, [model.nodes]);

  // Sort pools by their center order (then pool name) for predictability.
  const sortedPools = useMemo(() => {
    const byCenterKey = new Map<string, number>();
    model.stepOrder.forEach((k, i) => byCenterKey.set(k, i));
    return [...capPools].sort((a, b) => {
      const ai = byCenterKey.get(a.centerGlCode) ?? 999;
      const bi = byCenterKey.get(b.centerGlCode) ?? 999;
      if (ai !== bi) return ai - bi;
      return a.pool.localeCompare(b.pool);
    });
  }, [capPools, model.stepOrder]);

  const [selectedId, setSelectedId] = useState<string>(sortedPools[0]?.id ?? "");
  const selected = sortedPools.find((p) => p.id === selectedId) ?? sortedPools[0];

  if (!selected) {
    return (
      <div style={{
        background: "var(--paper)", border: "1px solid var(--rule)",
        padding: 22, fontSize: "var(--fs-ui)", color: "var(--ink-3)",
      }}>
        No cost pools imported. Add or import pools to see allocation detail.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PoolPicker
        pools={sortedPools}
        selectedId={selected.id}
        onSelect={setSelectedId}
        glCodeByCenterKey={glCodeByCenterKey}
      />
      <CenterCostsToBeAllocated centerKey={selected.centerGlCode}/>
      <PoolDetailCard pool={selected}/>
    </div>
  );

  function CenterCostsToBeAllocated({ centerKey }: { centerKey: string }) {
    // Find this center's indirect node by its identity key.
    const centerNode = model.nodes.find(
      (n) => n.role === "indirect" && n.key === centerKey,
    );
    if (!centerNode) return null;
    const homeKey = centerNode.key;
    const centerName = centerNode.name;

    // Departmental = Σ net allocable across all pools at this center.
    const departmental = capPools
      .filter((p) => p.centerGlCode === centerKey)
      .reduce((a, p) => a + p.amount, 0);

    // Column labeling rule for the "Costs to be Allocated" report: a source
    // pool's contribution to this center counts as Incoming FIRST iff the
    // source's home center is UPSTREAM (= earlier in stepOrder) of this
    // center AND the contribution is in Round 1. Everything else (upstream
    // Round 2, self R1+R2, downstream R1+R2) counts as Incoming SECOND.
    const stepIndexByKey = new Map<string, number>();
    model.stepOrder.forEach((k, i) => stepIndexByKey.set(k, i));
    const targetStepIndex = stepIndexByKey.get(centerKey) ?? -1;

    // Seed every indirect center as a potential source row so the table
    // matches the "Costs to be Allocated" layout (every allocable budget
    // unit listed, with "—" for zero contributions). Then sum each pool's
    // First/Second contributions into its source-center row.
    const sources = new Map<string, { first: number; second: number }>();
    for (const n of model.nodes) {
      if (n.role === "indirect") sources.set(n.key, { first: 0, second: 0 });
    }
    for (const sp of capPools) {
      const sourceStepIndex = stepIndexByKey.get(sp.centerGlCode) ?? -1;
      const isUpstream = sourceStepIndex !== -1 && targetStepIndex !== -1
        && sourceStepIndex < targetStepIndex;
      const r1 = model.firstAllocation[sp.id]?.[homeKey] ?? 0;
      const r2 = model.secondAllocation[sp.id]?.[homeKey] ?? 0;
      const first  = isUpstream ? r1 : 0;
      const second = isUpstream ? r2 : (r1 + r2);
      const cur = sources.get(sp.centerGlCode) ?? { first: 0, second: 0 };
      cur.first  += first;
      cur.second += second;
      sources.set(sp.centerGlCode, cur);
    }
    const sourceRows = [...sources.entries()]
      .map(([key, v]) => ({
        key, name: nameByCenterKey.get(key) ?? key, ...v, total: v.first + v.second,
      }))
      .sort((a, b) => {
        const ai = stepIndexByKey.get(a.key) ?? 999;
        const bi = stepIndexByKey.get(b.key) ?? 999;
        if (ai !== bi) return ai - bi;
        return a.name.localeCompare(b.name);
      });

    const totalFirst  = sourceRows.reduce((a, r) => a + r.first, 0);
    const totalSecond = sourceRows.reduce((a, r) => a + r.second, 0);
    const totalIncoming = totalFirst + totalSecond;
    const totalCosts = departmental + totalIncoming;

    if (totalIncoming <= 0.5 && departmental <= 0.5) return null;

    const COL = "80px minmax(180px, 1.6fr) 120px 120px 120px";
    const centerGl = glCodeByCenterKey.get(centerKey);
    return (
      <div>
        <SectionLabel right={centerGl ? `${centerGl} · ${centerName}` : centerName}>
          Costs to be Allocated
        </SectionLabel>
        <div style={{
          background: "var(--paper)", border: "1px solid var(--rule)",
        }}>
          <div style={{
            display: "grid", gridTemplateColumns: COL, gap: 12,
            padding: "10px 18px",
            background: "var(--paper-2)",
            borderBottom: "1px solid var(--rule-strong)",
            fontFamily: "var(--ff-mono)", fontSize: "var(--t-l4)", fontWeight: 600,
            letterSpacing: "0.08em", color: "var(--ink-3)", textTransform: "uppercase",
          }}>
            <div>Code</div>
            <div>Source</div>
            <div style={{ textAlign: "right" }}>First</div>
            <div style={{ textAlign: "right" }}>Second</div>
            <div style={{ textAlign: "right" }}>Total</div>
          </div>

          <CostsRow
            label="Departmental Expenditures"
            first={departmental}
            second={0}
            total={departmental}
            emphasis
          />

          {sourceRows.length > 0 && (
            <div className="mono" style={{
              padding: "6px 18px",
              background: "var(--paper-2)",
              borderTop: "1px solid var(--rule)",
              borderBottom: "1px solid var(--rule)",
              fontSize: "var(--t-l9)", fontWeight: 700, letterSpacing: "0.14em",
              color: "var(--ink-3)", textTransform: "uppercase",
            }}>Incoming Costs</div>
          )}

          {sourceRows.map((r) => (
            <CostsRow
              key={r.key}
              label={r.name}
              glCode={glCodeByCenterKey.get(r.key)}
              first={r.first}
              second={r.second}
              total={r.total}
              isSelf={r.key === centerKey}
            />
          ))}

          <CostsRow
            label="Total Incoming Costs"
            first={totalFirst}
            second={totalSecond}
            total={totalIncoming}
            emphasis
            divider="top"
          />
          <CostsRow
            label="Total Costs to be Allocated"
            first={departmental + totalFirst}
            second={totalSecond}
            total={totalCosts}
            emphasis
            divider="double"
          />
        </div>
      </div>
    );
  }

  function PoolDetailCard({ pool }: { pool: typeof selected }) {
    const indirectNodes = model.nodes.filter((n) => n.role === "indirect");
    const directNodes   = model.nodes.filter((n) => n.role === "direct");
    const sortByGlCode = (a: GlNode, b: GlNode) => a.glCode.localeCompare(b.glCode);

    const { basis } = basisForPool(pool, allocationBases);
    const isDirectCharge = basis === "DIRECT";
    const eligibleAmount = pool.amount;

    // Build the per-receiver schedule for this pool. Non-DIRECT pools
    // share their basis's BasisUnitRow — units come from the schedule and
    // percent is derived as units / Σ units. DIRECT pools have their own
    // explicit DirectAllocationRow with hand-written percents.
    const schedule = new Map<string, { units?: number; percent: number }>();
    if (isDirectCharge) {
      const da = directByPoolId.get(pool.id);
      for (const r of da?.receivers ?? []) {
        schedule.set(r.glCode, { percent: r.percent });
      }
    } else {
      const bu = basisUnitsByBasisId.get(pool.basisId);
      const rows = bu?.receivers ?? [];
      const totalUnits = rows.reduce((a, r) => a + r.units, 0);
      for (const r of rows) {
        const pct = totalUnits > 0 ? (r.units / totalUnits) * 100 : 0;
        schedule.set(r.glCode, { units: r.units, percent: pct });
      }
    }

    // Build per-receiver rows. Every allocable + receiving node is listed,
    // including 0% rows (— in the cells). Gross / Direct Billed / First come
    // straight from the engine: First = Gross − Direct Billed, with any
    // user-entered direct bill already clamped to [0, Gross] inside the
    // engine. Total reconciles to (First + Second + Direct Billed) — the
    // dollars the receiver actually sees, regardless of which channel
    // delivered them.
    const buildRow = (node: GlNode) => {
      const sched = schedule.get(node.key);
      const units = sched?.units;
      const percent = sched?.percent ?? 0;
      const gross  = model.grossAllocation[pool.id]?.[node.key] ?? 0;
      const directBilled = model.directBillAllocation[pool.id]?.[node.key] ?? 0;
      const first  = model.firstAllocation[pool.id]?.[node.key] ?? 0;
      const second = model.secondAllocation[pool.id]?.[node.key] ?? 0;
      return {
        node, units, percent, gross, directBilled, first, second,
        total: first + second + directBilled,
      };
    };

    const allocableRows = indirectNodes.sort(sortByGlCode).map(buildRow);
    const receivingRows = directNodes.sort(sortByGlCode).map(buildRow);
    const allRows = [...allocableRows, ...receivingRows];

    const totals = allRows.reduce((acc, r) => ({
      units: (acc.units ?? 0) + (r.units ?? 0),
      percent: acc.percent + r.percent,
      gross: acc.gross + r.gross,
      directBilled: acc.directBilled + r.directBilled,
      first: acc.first + r.first,
      second: acc.second + r.second,
      total: acc.total + r.total,
    }), { units: 0, percent: 0, gross: 0, directBilled: 0, first: 0, second: 0, total: 0 });

    const centerGl = glCodeByCenterKey.get(pool.centerGlCode);
    const rightLabel = [
      centerGl,
      pool.center,
      pool.pool,
    ].filter(Boolean).join(" · ");
    return (
      <div>
        <SectionLabel right={rightLabel}>
          Allocation Detail
        </SectionLabel>
        <div style={{
          background: "var(--paper)", border: "1px solid var(--rule)",
        }}>
          <div style={{
            display: "flex", gap: 16,
            padding: "10px 14px",
            background: "var(--paper-2)",
            borderBottom: "1px solid var(--rule)",
            fontSize: 12, color: "var(--ink-3)",
          }}>
            <span title={`This pool claims ${pool.allocationPercent.toFixed(2)}% of ${pool.center}'s total budget`}>
              Pool share of center: <span className="num" style={{
                color: "var(--ink-2)", fontWeight: 500,
              }}>{pool.allocationPercent.toFixed(2)}%</span>
            </span>
            <span>Allocable: <span className="num" style={{
              color: "var(--ink-2)", fontWeight: 500,
            }}>{fmt.dollars(eligibleAmount)}</span></span>
            <span>Basis: <span className="mono" style={{
              color: "var(--ink-2)", letterSpacing: "0.04em",
            }}>{basis}</span></span>
          </div>
          <ColumnHeaders/>
          <SectionHeader label="Allocable Budget Units"/>
          {allocableRows.map((r) => (
            <DetailRow
              key={r.node.key}
              row={r}
              poolId={pool.id}
              onSetDirectBill={setDirectBill}
            />
          ))}
          <SectionHeader label="Receiving Budget Units"/>
          {receivingRows.map((r) => (
            <DetailRow
              key={r.node.key}
              row={r}
              poolId={pool.id}
              onSetDirectBill={setDirectBill}
            />
          ))}
          <TotalRow totals={totals}/>
        </div>
      </div>
    );
  }
}

function CostsRow({
  label, glCode, first, second, total, emphasis, divider, isSelf,
}: {
  label: string;
  glCode?: string;
  first: number;
  second: number;
  total: number;
  emphasis?: boolean;
  divider?: "top" | "double";
  isSelf?: boolean;
}) {
  const fmtMoney = (v: number) => v < 0.5 ? "—" : fmt.dollars(v);
  const dimColor = (v: number) => v < 0.5 ? "var(--ink-4)" : "var(--ink)";
  return (
    <div className={emphasis ? undefined : "tbl-row-hover-grid"} style={{
      display: "grid",
      gridTemplateColumns: "80px minmax(180px, 1.6fr) 120px 120px 120px",
      gap: 12,
      padding: emphasis ? "10px 18px" : "6px 18px",
      borderTop: divider === "top" ? "2px solid var(--ink)"
        : divider === "double" ? "2px solid var(--ink)"
        : undefined,
      borderBottom: divider === "double" ? "3px double var(--ink)"
        : "1px solid var(--rule)",
      background: emphasis ? "var(--paper)" : "transparent",
      fontFamily: "var(--ff-mono)",
      fontVariantNumeric: "tabular-nums",
      fontSize: emphasis ? 13 : 12.5,
      fontWeight: emphasis ? 600 : 400,
      alignItems: "baseline",
    }}>
      <div className="mono" style={{
        fontSize: "var(--t-l4)",
        color: glCode ? "var(--ink-3)" : "var(--ink-4)",
        letterSpacing: "0.02em", fontWeight: 400,
      }}>{glCode ?? ""}</div>
      <div style={{
        fontFamily: "var(--ff-ui)",
        color: emphasis ? "var(--ink)" : "var(--ink-2)",
      }}>
        {label}
        {isSelf && (
          <span className="mono" style={{
            fontSize: "var(--t-l9)", color: "var(--ink-4)", marginLeft: 8,
            letterSpacing: "0.08em", textTransform: "uppercase",
            fontWeight: 600,
          }}>self</span>
        )}
      </div>
      <div className="num" style={{ textAlign: "right", color: dimColor(first) }}>
        {fmtMoney(first)}
      </div>
      <div className="num" style={{ textAlign: "right", color: dimColor(second) }}>
        {fmtMoney(second)}
      </div>
      <div className="num" style={{
        textAlign: "right",
        color: emphasis ? "var(--accent)" : dimColor(total),
      }}>{fmtMoney(total)}</div>
    </div>
  );
}

function PoolPicker({
  pools, selectedId, onSelect, glCodeByCenterKey,
}: {
  pools: { id: string; center: string; centerGlCode: string; pool: string; amount: number; allocationPercent: number }[];
  selectedId: string;
  onSelect: (id: string) => void;
  glCodeByCenterKey: Map<string, string>;
}) {
  return (
    <div>
      <SectionLabel right={`${pools.length} pools`}>
        Select pool
      </SectionLabel>
      <div style={{
        background: "var(--paper)", border: "1px solid var(--rule)",
        maxHeight: 220, overflowY: "auto",
      }}>
        {pools.map((p, i) => {
          const eligible = p.amount;
          const selected = p.id === selectedId;
          const gl = glCodeByCenterKey.get(p.centerGlCode);
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              style={{
                width: "100%",
                display: "grid",
                gridTemplateColumns: "80px minmax(180px, 1.5fr) minmax(220px, 2.4fr) 70px 120px",
                gap: 12, alignItems: "baseline",
                padding: "8px 14px",
                background: selected ? "var(--accent-tint)" : "transparent",
                color: "var(--ink)",
                border: "none",
                borderTop: i > 0 ? "1px solid var(--rule)" : "none",
                cursor: "pointer",
                fontFamily: "var(--ff-ui)",
                fontSize: "var(--t-l7)",
                textAlign: "left",
                fontWeight: selected ? 600 : 400,
              }}
              title={`${p.allocationPercent.toFixed(2)}% of ${p.center}'s budget`}
            >
              <span className="mono" style={{
                fontSize: "var(--t-l4)",
                color: gl ? "var(--ink-3)" : "var(--ink-4)",
                letterSpacing: "0.02em", fontWeight: 400,
              }}>{gl ?? "—"}</span>
              <span style={{
                color: "var(--ink-2)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{p.center}</span>
              <span style={{
                color: "var(--ink)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{p.pool}</span>
              <span className="num mono" style={{
                textAlign: "right", fontVariantNumeric: "tabular-nums",
                color: p.allocationPercent > 0 ? "var(--ink-2)" : "var(--ink-4)",
              }}>{p.allocationPercent > 0 ? `${p.allocationPercent.toFixed(2)}%` : "—"}</span>
              <span className="num mono" style={{
                textAlign: "right", fontVariantNumeric: "tabular-nums",
                color: "var(--ink-2)",
              }}>{fmt.dollarsK(eligible)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// First / Second / Total columns share the 120px width used by the
// Costs to be Allocated table above so the two schedules line up
// visually when stacked.
const COL_GRID = "80px minmax(180px, 1.4fr) 80px 90px 100px 100px 120px 120px 120px";

function ColumnHeaders() {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: COL_GRID, gap: 12,
      padding: "10px 14px",
      background: "var(--paper-2)",
      borderBottom: "1px solid var(--rule-strong)",
      fontFamily: "var(--ff-mono)", fontSize: "var(--t-l4)", fontWeight: 600,
      letterSpacing: "0.08em", color: "var(--ink-3)", textTransform: "uppercase",
    }}>
      <div>Code</div>
      <div>Budget Unit</div>
      <div style={{ textAlign: "right" }}>Units</div>
      <div style={{ textAlign: "right" }}>%</div>
      <div style={{ textAlign: "right" }}>Gross</div>
      <div style={{ textAlign: "right" }}>Direct Billed</div>
      <div style={{ textAlign: "right" }}>First</div>
      <div style={{ textAlign: "right" }}>Second</div>
      <div style={{ textAlign: "right" }}>Total</div>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="mono" style={{
      padding: "8px 14px",
      background: "var(--paper-2)",
      borderBottom: "1px solid var(--rule)",
      borderTop: "1px solid var(--rule)",
      fontSize: "var(--t-l9)", fontWeight: 700, letterSpacing: "0.14em",
      color: "var(--ink-3)", textTransform: "uppercase",
    }}>{label}</div>
  );
}

interface Row {
  node: GlNode;
  units: number | undefined;
  percent: number;
  gross: number;
  directBilled: number;
  first: number;
  second: number;
  total: number;
}

function DetailRow({
  row, poolId, onSetDirectBill,
}: {
  row: Row;
  poolId: string;
  onSetDirectBill: (poolId: string, nodeKey: string, amount: number) => void;
}) {
  const dim = (v: number) => v < 0.5;
  const fmtMoney = (v: number) => dim(v) ? "—" : fmt.dollars(v);
  const fmtUnits = (v: number | undefined) =>
    v == null ? "—" : fmt.units(v);
  const fmtPct = (v: number) =>
    v <= 0 ? "—" : `${v.toFixed(3)}%`;
  // Brief inline error when the user tries to enter a value > Gross. Clears
  // itself after a moment so the input returns to its quiet state.
  const [error, setError] = useState<string | null>(null);
  const editable = row.gross >= 0.5;
  const commitDirectBill = (next: number) => {
    if (!Number.isFinite(next) || next < 0) {
      onSetDirectBill(poolId, row.node.key, 0);
      return;
    }
    if (next > row.gross + 0.005) {
      setError("Direct billed cannot exceed gross");
      window.setTimeout(() => setError(null), 2400);
      // Revert: re-broadcast the current committed value so CellInput's
      // internal draft snaps back to it.
      onSetDirectBill(poolId, row.node.key, row.directBilled);
      return;
    }
    setError(null);
    onSetDirectBill(poolId, row.node.key, next);
  };
  return (
    <div className="tbl-row-hover-grid" style={{
      display: "grid", gridTemplateColumns: COL_GRID, gap: 12,
      padding: "6px 14px",
      borderBottom: "1px solid var(--rule)",
      fontFamily: "var(--ff-mono)",
      fontVariantNumeric: "tabular-nums",
      fontSize: "var(--t-l7)",
      alignItems: "baseline",
    }}>
      <div className="mono" style={{
        fontSize: "var(--t-l4)",
        color: row.node.glCode.startsWith("seed:") ? "var(--ink-4)" : "var(--ink-3)",
        letterSpacing: "0.02em", fontWeight: 400,
      }}>
        {row.node.glCode.startsWith("seed:") ? "—" : row.node.glCode}
      </div>
      <div style={{
        fontFamily: "var(--ff-ui)", color: "var(--ink)", minWidth: 0,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{row.node.name}</div>
      <div className="num" style={{
        textAlign: "right",
        color: row.units == null ? "var(--ink-4)" : "var(--ink-2)",
      }}>{fmtUnits(row.units)}</div>
      <div className="num" style={{
        textAlign: "right",
        color: row.percent <= 0 ? "var(--ink-4)" : "var(--ink-2)",
      }}>{fmtPct(row.percent)}</div>
      <div className="num" style={{
        textAlign: "right",
        color: dim(row.gross) ? "var(--ink-4)" : "var(--ink-2)",
      }}>{fmtMoney(row.gross)}</div>
      <div style={{
        textAlign: "right",
        position: "relative",
      }}>
        {editable ? (
          <CellInput
            type="currency"
            prefix="$"
            value={row.directBilled > 0 ? row.directBilled : ""}
            placeholder="—"
            align="right"
            min={0}
            onChange={(v) => commitDirectBill(typeof v === "number" ? v : Number(v))}
          />
        ) : (
          <span className="num" style={{ color: "var(--ink-4)" }}>—</span>
        )}
        {error && (
          <div role="alert" style={{
            position: "absolute", right: 0, top: "100%",
            marginTop: 2, zIndex: 5,
            background: "var(--paper)",
            border: "1px solid var(--neg)",
            color: "var(--neg)",
            fontFamily: "var(--ff-ui)",
            fontSize: "var(--t-l8)",
            padding: "4px 8px",
            whiteSpace: "nowrap",
            boxShadow: "0 4px 10px rgba(29,34,54,0.08)",
          }}>
            {error}
          </div>
        )}
      </div>
      <div className="num" style={{
        textAlign: "right",
        color: dim(row.first) ? "var(--ink-4)" : "var(--ink)",
      }}>{fmtMoney(row.first)}</div>
      <div className="num" style={{
        textAlign: "right",
        color: dim(row.second) ? "var(--ink-4)" : "var(--ink)",
      }}>{fmtMoney(row.second)}</div>
      <div className="num" style={{
        textAlign: "right",
        color: dim(row.total) ? "var(--ink-4)" : "var(--ink)",
        fontWeight: dim(row.total) ? 400 : 600,
      }}>{fmtMoney(row.total)}</div>
    </div>
  );
}

function TotalRow({
  totals,
}: {
  totals: { units: number; percent: number; gross: number; directBilled: number; first: number; second: number; total: number };
}) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: COL_GRID, gap: 12,
      padding: "10px 14px",
      background: "var(--paper)",
      borderTop: "2px solid var(--ink)",
      fontFamily: "var(--ff-mono)",
      fontVariantNumeric: "tabular-nums",
      fontSize: "var(--t-l7)", fontWeight: 600,
    }}>
      <div/>
      <div className="mono" style={{
        fontFamily: "var(--ff-mono)",
        fontSize: "var(--t-l4)", letterSpacing: "0.1em",
        textTransform: "uppercase", color: "var(--ink-2)",
      }}>Total</div>
      <div className="num" style={{ textAlign: "right" }}>
        {fmt.units(totals.units)}
      </div>
      <div className="num" style={{ textAlign: "right" }}>
        {totals.percent.toFixed(3)}%
      </div>
      <div className="num" style={{ textAlign: "right" }}>{fmt.dollars(totals.gross)}</div>
      <div className="num" style={{
        textAlign: "right",
        color: totals.directBilled < 0.5 ? "var(--ink-4)" : "var(--ink)",
      }}>{totals.directBilled < 0.5 ? "—" : fmt.dollars(totals.directBilled)}</div>
      <div className="num" style={{ textAlign: "right" }}>{fmt.dollars(totals.first)}</div>
      <div className="num" style={{
        textAlign: "right",
        color: totals.second < 0.5 ? "var(--ink-4)" : "var(--ink)",
      }}>{totals.second < 0.5 ? "—" : fmt.dollars(totals.second)}</div>
      <div className="num" style={{
        textAlign: "right", color: "var(--accent)",
      }}>{fmt.dollars(totals.total)}</div>
    </div>
  );
}
