
import { AddRowButton, AllocationBasisCombobox, CellInput, SectionLabel } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { AllocationBasis, CapPool } from "@/lib/types";
import { useBuildState } from "@/lib/store";
import { deriveCenters } from "./CapKpiRail";

export function CapPoolsTable() {
  const { capPools, capCenterOrder, allocationBases, addCapPool, updateCapPool, addAllocationBasis } = useBuildState();
  const centers = deriveCenters(capPools, capCenterOrder);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {centers.map((c) => {
        const pools = capPools.filter((p) => p.center === c.name);
        return (
          <CenterSection
            key={c.name}
            name={c.name}
            pools={pools}
            total={c.total}
            bases={allocationBases}
            onAddPool={() => addCapPool(c.name)}
            onUpdatePool={updateCapPool}
            onCreateBasis={addAllocationBasis}
          />
        );
      })}
      <div style={{
        fontSize: 11.5, color: "var(--ink-3)",
        padding: "4px 2px",
      }}>
        {centers.length} cost centers · {capPools.length} pools
      </div>
    </div>
  );
}

interface SectionProps {
  name: string;
  pools: CapPool[];
  total: number;
  bases: AllocationBasis[];
  onAddPool: () => void;
  onUpdatePool: (id: string, patch: Partial<CapPool>) => void;
  onCreateBasis: (input: { name: string; source: string; methodologyNote?: string }) => string;
}

const GRID = "minmax(220px, 1.6fr) 60px 120px 80px 120px minmax(260px, 2fr)";

function CenterSection({ name, pools, total, bases, onAddPool, onUpdatePool, onCreateBasis }: SectionProps) {
  const eligibleTotal = pools.reduce((a, p) => a + p.amount * (p.eligiblePercent / 100), 0);
  // Weighted eligible %: total eligible $ / total raw $. NOT a simple average
  // of row percentages — a $1M pool at 50% dominates a $1K pool at 100%.
  const weightedEligiblePct = total > 0 ? Math.round((eligibleTotal / total) * 100) : 0;
  // Sum of allocation percentages. Should normally equal 100%; drift signals
  // an in-progress edit that needs rebalancing.
  const allocPctSum = pools.reduce((a, p) => a + p.allocationPercent, 0);
  const balanced = Math.abs(allocPctSum - 100) < 0.5;
  return (
    <div>
      <SectionLabel right={`${pools.length} pool${pools.length === 1 ? "" : "s"}`}>
        {name}
      </SectionLabel>
      <div style={{
        background: "var(--paper)",
        border: "1px solid var(--rule)",
        overflow: "hidden",
      }}>
      {/* Column header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: 14,
        padding: "8px 18px",
        background: "var(--paper-2)",
        borderBottom: "1px solid var(--rule)",
        fontFamily: "var(--ff-mono)", fontSize: 10, fontWeight: 600,
        letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase",
      }}>
        <div>Pool</div>
        <div style={{ textAlign: "right" }}>%</div>
        <div style={{ textAlign: "right" }}>$</div>
        <div style={{ textAlign: "right" }}>Eligible %</div>
        <div style={{ textAlign: "right" }}>Eligible $</div>
        <div>Basis</div>
      </div>

      {/* Rows */}
      {pools.map((p, i) => {
        const isLast = i === pools.length - 1;
        return (
          <PoolRow
            key={p.id}
            pool={p}
            centerTotal={total}
            isLast={isLast}
            bases={bases}
            onUpdate={(patch) => onUpdatePool(p.id, patch)}
            onCreateBasis={onCreateBasis}
          />
        );
      })}

      {/* Reconciliation row — Total | sum% | raw $ | weighted % | eligible $ | */}
      <div style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: 14,
        padding: "9px 18px",
        borderTop: "2px solid var(--ink)",
        background: "var(--paper-2)",
        fontSize: 12, fontWeight: 600,
      }}>
        <div className="mono" style={{
          fontSize: 10, letterSpacing: "0.1em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>Total</div>
        <div
          className="num"
          style={{
            textAlign: "right",
            color: balanced ? "var(--ink)" : "var(--warn)",
          }}
          title={balanced
            ? "Allocation rebalanced to 100%"
            : `Allocation drifted to ${allocPctSum.toFixed(1)}% — edit pool shares to rebalance`}
        >
          {Math.round(allocPctSum)}%
        </div>
        <div className="num" style={{ textAlign: "right" }}>{fmt.dollars(total)}</div>
        <div
          className="num"
          style={{ textAlign: "right", color: "var(--ink-2)" }}
          title={total > 0 ? `${fmt.dollars(eligibleTotal)} eligible of ${fmt.dollars(total)} raw` : undefined}
        >
          {total > 0 ? `${weightedEligiblePct}%` : "—"}
        </div>
        <div className="num" style={{ textAlign: "right" }}>{fmt.dollars(eligibleTotal)}</div>
        <div/>
      </div>

      {/* Add-row footer */}
      <div style={{
        padding: "10px 18px",
        borderTop: "1px solid var(--rule-strong)",
        background: "var(--paper-2)",
      }}>
        <AddRowButton label="Add cost pool" onClick={onAddPool}/>
      </div>
      </div>
    </div>
  );
}

interface RowProps {
  pool: CapPool;
  centerTotal: number;
  isLast: boolean;
  bases: AllocationBasis[];
  onUpdate: (patch: Partial<CapPool>) => void;
  onCreateBasis: (input: { name: string; source: string; methodologyNote?: string }) => string;
}

function PoolRow({ pool, centerTotal, isLast, bases, onUpdate, onCreateBasis }: RowProps) {
  const eligibleAmount = pool.amount * (pool.eligiblePercent / 100);
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: GRID,
      gap: 14,
      padding: "10px 18px",
      alignItems: "baseline",
      borderBottom: !isLast ? "1px solid var(--rule)" : "none",
      background: "var(--paper)",
      fontSize: 12.5,
    }}>
      <CellInput
        value={pool.pool}
        onChange={(v) => onUpdate({ pool: String(v) })}
      />
      <div
        title={centerTotal > 0
          ? `${pool.allocationPercent.toFixed(1)}% × ${fmt.dollars(centerTotal)} = ${fmt.dollars(pool.amount)}`
          : undefined}
        style={{ color: "var(--ink-3)" }}
      >
        <CellInput
          type="number" value={Math.round(pool.allocationPercent * 100) / 100}
          step={0.5} min={0}
          onChange={(v) => {
            const n = Number(v);
            const clamped = Number.isFinite(n) ? Math.max(0, n) : 0;
            onUpdate({ allocationPercent: clamped });
          }}
          align="right" suffix="%"
        />
      </div>
      <CellInput
        type="number" value={Math.round(pool.amount)} step={1000} min={0}
        onChange={(v) => onUpdate({ amount: Number(v) || 0 })}
        align="right" prefix="$"
      />
      <div title={eligibleTooltip(pool)} style={{ color: "var(--ink-2)" }}>
        <CellInput
          type="number" value={pool.eligiblePercent} step={5} min={0} max={100}
          onChange={(v) => {
            const n = Number(v);
            const clamped = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
            onUpdate({ eligiblePercent: clamped });
          }}
          align="right" suffix="%"
        />
      </div>
      <div
        className="num"
        title={`${fmt.dollars(pool.amount)} × ${pool.eligiblePercent}% eligible`}
        style={{
          textAlign: "right",
          color: pool.eligiblePercent === 0 ? "var(--ink-4)" : "var(--ink)",
        }}
      >
        {fmt.dollars(eligibleAmount)}
      </div>
      <AllocationBasisCombobox
        bases={bases}
        selectedId={pool.basisId}
        fallbackText={pool.basis}
        onSelect={(basisId, basisName) => onUpdate({ basisId, basis: basisName })}
        onCreate={onCreateBasis}
      />
    </div>
  );
}

/** Tooltip text for the Eligible % cell. Prefers the pool's own policy
 *  description (recoverability text), falls back to a generic explanation
 *  derived from the percent value. */
function eligibleTooltip(p: CapPool): string {
  const policy = p.recoverability?.trim();
  const generic =
    p.eligiblePercent >= 100 ? "Fully fee-eligible overhead"
    : p.eligiblePercent <= 0 ? "Excluded from fee-supported allocations"
    : `Partially eligible — ${p.eligiblePercent}% flows into fee allocations`;
  if (policy && policy.toLowerCase() !== "tbd") return `${generic} · ${policy}`;
  return generic;
}
