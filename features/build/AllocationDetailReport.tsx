import { useMemo, useState } from "react";
import { SectionLabel } from "@/components/ui";
import { fmt } from "@/lib/format";
import { basisForPool } from "@/lib/data/capStepDown";
import type { GlNode, NodeKey } from "@/lib/data/capStepDownGl";
import { useBuildState } from "@/lib/store";

/** Per-pool Allocation Detail report in NBS published format.
 *
 *  For the selected pool, lists every node split into ALLOCABLE BUDGET UNITS
 *  (indirect — other cost centers) and RECEIVING BUDGET UNITS (direct
 *  departments and OTHER funds), with columns:
 *    Allocation Units · Allocated Percent · Gross Allocation ·
 *    Direct Billed · First Allocation · Second Allocation · Total
 *
 *  First Allocation = pool's own eligible × receiver percent (or pool's R1
 *  incoming × receiver percent for zero-eligible internal-service units —
 *  matches NBS's "Gross Allocation" column).
 *  Second Allocation = pool's R2 incoming × receiver percent, self
 *  excluded and renormalized.
 *
 *  Cross-checks the engine output against the source CAP PDF row-by-row. */
export function AllocationDetailReport() {
  const { capPools, allocationBases, derived } = useBuildState();
  const model = derived.capStepDown;

  // Center name → imported glCode (e.g. "011-1200" for City Manager).
  // Seed centers without a real imported glCode resolve to undefined, which
  // CenterCode renders as "—".
  const glCodeByCenter = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of model.nodes) {
      if (n.role !== "indirect") continue;
      if (n.glCode.startsWith("seed:")) continue;
      m.set(n.name, n.glCode);
    }
    return m;
  }, [model.nodes]);

  // Sort pools by their center order (then pool name) for predictability.
  const sortedPools = useMemo(() => {
    const byCenter = new Map<string, number>();
    model.stepOrder.forEach((k, i) => {
      const node = model.nodes.find((n) => n.key === k);
      if (node) byCenter.set(node.name, i);
    });
    return [...capPools].sort((a, b) => {
      const ai = byCenter.get(a.center) ?? 999;
      const bi = byCenter.get(b.center) ?? 999;
      if (ai !== bi) return ai - bi;
      return a.pool.localeCompare(b.pool);
    });
  }, [capPools, model.stepOrder, model.nodes]);

  const [selectedId, setSelectedId] = useState<string>(sortedPools[0]?.id ?? "");
  const selected = sortedPools.find((p) => p.id === selectedId) ?? sortedPools[0];

  if (!selected) {
    return (
      <div style={{
        background: "var(--paper)", border: "1px solid var(--rule)",
        padding: 22, fontSize: 13, color: "var(--ink-3)",
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
        glCodeByCenter={glCodeByCenter}
      />
      <CenterCostsToBeAllocated centerName={selected.center}/>
      <PoolDetailCard pool={selected}/>
    </div>
  );

  function CenterCostsToBeAllocated({ centerName }: { centerName: string }) {
    // Find this center's indirect node.
    const centerNode = model.nodes.find(
      (n) => n.role === "indirect" && n.name === centerName,
    );
    if (!centerNode) return null;
    const homeKey = centerNode.key;

    // Departmental = Σ eligible across all pools at this center.
    const departmental = capPools
      .filter((p) => p.center === centerName)
      .reduce((a, p) => a + p.amount * (p.eligiblePercent / 100), 0);

    // NBS column labeling rule: a source pool's contribution to this center
    // counts as Incoming FIRST iff the source's home center is UPSTREAM
    // (= earlier in stepOrder) of this center AND the contribution is in
    // Round 1. Everything else (upstream Round 2, self R1+R2, downstream
    // R1+R2) counts as Incoming SECOND. Self-allocations and downstream
    // cross-flows all land in the Second column even though they originated
    // in their own Round 1 — matches NBS's "Costs to be Allocated" report.
    const stepIndexByCenter = new Map<string, number>();
    model.stepOrder.forEach((k, i) => {
      const n = model.nodes.find((nn) => nn.key === k);
      if (n) stepIndexByCenter.set(n.name, i);
    });
    const targetStepIndex = stepIndexByCenter.get(centerName) ?? -1;

    // Seed every indirect center as a potential source row so the table
    // matches NBS's "Costs to be Allocated" layout (every allocable budget
    // unit listed, with "—" for zero contributions). Then sum each pool's
    // First/Second contributions into its source-center row.
    const sources = new Map<string, { first: number; second: number }>();
    for (const n of model.nodes) {
      if (n.role === "indirect") sources.set(n.name, { first: 0, second: 0 });
    }
    for (const sp of capPools) {
      const sourceStepIndex = stepIndexByCenter.get(sp.center) ?? -1;
      const isUpstream = sourceStepIndex !== -1 && targetStepIndex !== -1
        && sourceStepIndex < targetStepIndex;
      const r1 = model.firstAllocation[sp.id]?.[homeKey] ?? 0;
      const r2 = model.secondAllocation[sp.id]?.[homeKey] ?? 0;
      const first  = isUpstream ? r1 : 0;
      const second = isUpstream ? r2 : (r1 + r2);
      const cur = sources.get(sp.center) ?? { first: 0, second: 0 };
      cur.first  += first;
      cur.second += second;
      sources.set(sp.center, cur);
    }
    const sourceRows = [...sources.entries()]
      .map(([name, v]) => ({ name, ...v, total: v.first + v.second }))
      .sort((a, b) => {
        const ai = stepIndexByCenter.get(a.name) ?? 999;
        const bi = stepIndexByCenter.get(b.name) ?? 999;
        if (ai !== bi) return ai - bi;
        return a.name.localeCompare(b.name);
      });

    const totalFirst  = sourceRows.reduce((a, r) => a + r.first, 0);
    const totalSecond = sourceRows.reduce((a, r) => a + r.second, 0);
    const totalIncoming = totalFirst + totalSecond;
    const totalCosts = departmental + totalIncoming;

    if (totalIncoming <= 0.5 && departmental <= 0.5) return null;

    const COL = "minmax(220px, 1.8fr) 120px 120px 120px";
    return (
      <div style={{
        background: "var(--paper)", border: "1px solid var(--rule)",
      }}>
        <div style={{
          padding: "12px 18px",
          borderBottom: "1px solid var(--rule-strong)",
          background: "var(--paper-2)",
        }}>
          <div className="mono" style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
            textTransform: "uppercase", color: "var(--ink-3)",
          }}>Costs to be Allocated</div>
          <div style={{
            fontSize: 14, fontWeight: 600, color: "var(--ink)",
            marginTop: 4,
          }}>
            {glCodeByCenter.get(centerName) && (
              <span className="mono" style={{
                fontSize: 12, color: "var(--ink-3)", marginRight: 8,
                letterSpacing: "0.02em",
              }}>{glCodeByCenter.get(centerName)}</span>
            )}
            {centerName}
          </div>
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: COL, gap: 10,
          padding: "8px 18px",
          background: "var(--paper-2)",
          borderBottom: "1px solid var(--rule-strong)",
          fontFamily: "var(--ff-mono)", fontSize: 10, fontWeight: 700,
          letterSpacing: "0.08em", color: "var(--ink-3)", textTransform: "uppercase",
        }}>
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
            fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em",
            color: "var(--ink-3)", textTransform: "uppercase",
          }}>Incoming Costs</div>
        )}

        {sourceRows.map((r) => (
          <CostsRow
            key={r.name}
            label={r.name}
            glCode={glCodeByCenter.get(r.name)}
            first={r.first}
            second={r.second}
            total={r.total}
            isSelf={r.name === centerName}
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
    );
  }

  function PoolDetailCard({ pool }: { pool: typeof selected }) {
    const indirectNodes = model.nodes.filter((n) => n.role === "indirect");
    const directNodes   = model.nodes.filter((n) => n.role === "direct");
    const sortByGlCode = (a: GlNode, b: GlNode) => a.glCode.localeCompare(b.glCode);

    const { basis, directTo } = basisForPool(pool, allocationBases);
    const isDirectCharge = basis === "DIRECT";
    const eligibleAmount = pool.amount * (pool.eligiblePercent / 100);

    // Build per-receiver rows. NBS shows every allocable + receiving node,
    // including 0% rows (— in the cells).
    const buildRow = (node: GlNode) => {
      const receiver = (pool.receivers ?? []).find((r) => r.glCode === node.key);
      const units = receiver?.units;
      const percent = receiver?.percent ?? 0;
      const first  = model.firstAllocation[pool.id]?.[node.key] ?? 0;
      const second = model.secondAllocation[pool.id]?.[node.key] ?? 0;
      const directBilled = isDirectCharge && directTo && node.feeDept === directTo
        ? eligibleAmount : 0;
      const gross = first; // NBS publishes gross = first for non-DIRECT pools
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

    return (
      <div style={{
        background: "var(--paper)", border: "1px solid var(--rule)",
      }}>
        <PoolHeader
          pool={pool}
          centerGlCode={glCodeByCenter.get(pool.center)}
          eligibleAmount={eligibleAmount}
          basis={basis}
        />
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 1100 }}>
            <ColumnHeaders/>
            <SectionHeader label="Allocable Budget Units"/>
            {allocableRows.map((r) => (
              <DetailRow key={r.node.key} row={r}/>
            ))}
            <SectionHeader label="Receiving Budget Units"/>
            {receivingRows.map((r) => (
              <DetailRow key={r.node.key} row={r}/>
            ))}
            <TotalRow totals={totals}/>
          </div>
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
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(220px, 1.8fr) 120px 120px 120px",
      gap: 10,
      padding: emphasis ? "10px 18px" : "6px 18px",
      borderTop: divider === "top" ? "2px solid var(--ink)"
        : divider === "double" ? "2px solid var(--ink)"
        : undefined,
      borderBottom: divider === "double" ? "3px double var(--ink)"
        : "1px solid var(--rule)",
      background: emphasis ? "var(--paper)" : "transparent",
      fontFamily: "var(--ff-mono)",
      fontVariantNumeric: "tabular-nums",
      fontSize: emphasis ? 12.5 : 11.5,
      fontWeight: emphasis ? 600 : 400,
      alignItems: "baseline",
    }}>
      <div style={{
        fontFamily: "var(--ff-ui)",
        color: emphasis ? "var(--ink)" : "var(--ink-2)",
      }}>
        {glCode && (
          <span className="mono" style={{
            fontSize: 10, color: "var(--ink-4)", marginRight: 8,
            letterSpacing: "0.02em",
          }}>{glCode}</span>
        )}
        {label}
        {isSelf && (
          <span className="mono" style={{
            fontSize: 9.5, color: "var(--ink-4)", marginLeft: 8,
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
  pools, selectedId, onSelect, glCodeByCenter,
}: {
  pools: { id: string; center: string; pool: string; amount: number; eligiblePercent: number }[];
  selectedId: string;
  onSelect: (id: string) => void;
  glCodeByCenter: Map<string, string>;
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
          const eligible = p.amount * (p.eligiblePercent / 100);
          const selected = p.id === selectedId;
          const gl = glCodeByCenter.get(p.center);
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              style={{
                width: "100%",
                display: "grid",
                gridTemplateColumns: "80px minmax(180px, 1.5fr) minmax(220px, 2.4fr) 120px",
                gap: 12, alignItems: "baseline",
                padding: "8px 14px",
                background: selected ? "var(--accent-tint)" : "transparent",
                color: "var(--ink)",
                border: "none",
                borderTop: i > 0 ? "1px solid var(--rule)" : "none",
                cursor: "pointer",
                fontFamily: "var(--ff-ui)",
                fontSize: 12.5,
                textAlign: "left",
                fontWeight: selected ? 600 : 400,
              }}
            >
              <span className="mono" style={{
                color: gl ? "var(--ink-2)" : "var(--ink-4)",
                fontSize: 11, letterSpacing: "0.02em",
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
                color: "var(--ink-2)",
              }}>{fmt.dollarsK(eligible)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PoolHeader({
  pool, centerGlCode, eligibleAmount, basis,
}: {
  pool: { center: string; pool: string };
  centerGlCode: string | undefined;
  eligibleAmount: number;
  basis: string;
}) {
  return (
    <div style={{
      padding: "14px 18px",
      borderBottom: "1px solid var(--rule-strong)",
      background: "var(--paper-2)",
    }}>
      <div className="mono" style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
        textTransform: "uppercase", color: "var(--ink-3)",
      }}>Allocation Detail</div>
      <div style={{
        fontSize: 16, fontWeight: 600, color: "var(--ink)",
        marginTop: 4,
      }}>
        {centerGlCode && (
          <span className="mono" style={{
            fontSize: 13, color: "var(--ink-3)", marginRight: 8,
            letterSpacing: "0.02em",
          }}>{centerGlCode}</span>
        )}
        {pool.center} · {pool.pool}
      </div>
      <div style={{
        display: "flex", gap: 18, marginTop: 6,
        fontSize: 11.5, color: "var(--ink-3)",
      }}>
        <span>Allocable: <span className="num" style={{
          color: "var(--ink-2)", fontWeight: 500,
        }}>{fmt.dollars(eligibleAmount)}</span></span>
        <span>Basis: <span className="mono" style={{
          color: "var(--ink-2)", letterSpacing: "0.04em",
        }}>{basis}</span></span>
      </div>
    </div>
  );
}

const COL_GRID = "minmax(220px, 1.6fr) 80px 90px 100px 100px 100px 100px 100px";

function ColumnHeaders() {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: COL_GRID, gap: 10,
      padding: "10px 14px",
      background: "var(--paper-2)",
      borderBottom: "1px solid var(--rule-strong)",
      fontFamily: "var(--ff-mono)", fontSize: 10, fontWeight: 700,
      letterSpacing: "0.08em", color: "var(--ink-3)", textTransform: "uppercase",
    }}>
      <div>Budget Unit</div>
      <div style={{ textAlign: "right" }}>Units</div>
      <div style={{ textAlign: "right" }}>Pct</div>
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
      fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em",
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

function DetailRow({ row }: { row: Row }) {
  const dim = (v: number) => v < 0.5;
  const fmtMoney = (v: number) => dim(v) ? "—" : fmt.dollars(v);
  const fmtUnits = (v: number | undefined) =>
    v == null ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const fmtPct = (v: number) =>
    v <= 0 ? "—" : `${v.toFixed(3)}%`;
  return (
    <div style={{
      display: "grid", gridTemplateColumns: COL_GRID, gap: 10,
      padding: "6px 14px",
      borderBottom: "1px solid var(--rule)",
      fontFamily: "var(--ff-mono)",
      fontVariantNumeric: "tabular-nums",
      fontSize: 11.5,
      alignItems: "baseline",
    }}>
      <div style={{ fontFamily: "var(--ff-ui)", color: "var(--ink-2)", minWidth: 0 }}>
        <span style={{
          color: "var(--ink-4)", fontSize: 10,
          letterSpacing: "0.04em", marginRight: 8,
        }}>
          {row.node.glCode.startsWith("seed:") ? "—" : row.node.glCode}
        </span>
        <span style={{ color: "var(--ink)" }}>{row.node.name}</span>
      </div>
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
      <div className="num" style={{
        textAlign: "right",
        color: dim(row.directBilled) ? "var(--ink-4)" : "var(--ink-2)",
      }}>{fmtMoney(row.directBilled)}</div>
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
      display: "grid", gridTemplateColumns: COL_GRID, gap: 10,
      padding: "10px 14px",
      background: "var(--paper)",
      borderTop: "2px solid var(--ink)",
      fontFamily: "var(--ff-mono)",
      fontVariantNumeric: "tabular-nums",
      fontSize: 12, fontWeight: 600,
    }}>
      <div className="mono" style={{
        fontFamily: "var(--ff-mono)",
        fontSize: 10.5, letterSpacing: "0.1em",
        textTransform: "uppercase", color: "var(--ink-2)",
      }}>Total</div>
      <div className="num" style={{ textAlign: "right" }}>
        {totals.units.toLocaleString(undefined, { maximumFractionDigits: 2 })}
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
