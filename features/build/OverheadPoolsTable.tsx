
import {
  AddRowButton, AllocationBasisCombobox, CellInput,
  DrilldownLabel, SectionLabel,
} from "@/components/ui";
import { fmt } from "@/lib/format";
import type { AllocationBasis, CapPool } from "@/lib/types";
import { useBuildState } from "@/lib/store";
import { deriveCenters } from "./OverheadKpiRail";

export function OverheadPoolsTable() {
  const {
    capPools, capCenterOrder, capCenterSources, allocationBases,
    addCapPool, updateCapPool, addAllocationBasis,
  } = useBuildState();
  return (
    <OverheadPoolsTableView
      capPools={capPools}
      capCenterOrder={capCenterOrder}
      capCenterSources={capCenterSources}
      allocationBases={allocationBases}
      addCapPool={addCapPool}
      updateCapPool={updateCapPool}
      addAllocationBasis={addAllocationBasis}
    />
  );
}

interface OverheadPoolsTableViewProps {
  capPools: CapPool[];
  capCenterOrder: string[];
  capCenterSources: Record<string, { name: string }>;
  allocationBases: AllocationBasis[];
  addCapPool: (centerKey: string) => void;
  updateCapPool: (id: string, patch: Partial<CapPool>) => void;
  addAllocationBasis: (input: { name: string; source: string; methodologyNote?: string }) => string;
}

/** Pure presentational shell — owns the empty-state branch and the
 *  per-center sections. Split from OverheadPoolsTable so the SSR-aware
 *  fixture can render the empty / populated / partial cases without
 *  fighting Zustand v5's getInitialState SSR snapshot. */
export function OverheadPoolsTableView({
  capPools, capCenterOrder, capCenterSources, allocationBases,
  addCapPool, updateCapPool, addAllocationBasis,
}: OverheadPoolsTableViewProps) {
  if (capPools.length === 0) {
    return (
      <div style={{
        background: "var(--paper)", border: "1px solid var(--rule)",
        padding: 22, fontSize: "var(--fs-ui)", color: "var(--ink-3)",
      }}>
        No cost pool data uploaded or added yet. Import a CAP workbook or
        add a cost pool to start allocating.
      </div>
    );
  }

  const centers = deriveCenters(capPools, capCenterOrder, capCenterSources);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {centers.map((c) => {
        const pools = capPools.filter((p) => p.centerGlCode === c.key);
        // The center's identity key IS its imported code (e.g. "011-1200",
        // "BLDG"); `seed:center:*` synth keys have no published code.
        const code = c.key.startsWith("seed:center:") ? undefined : c.key;
        return (
          <CenterSection
            key={c.key}
            name={c.name}
            code={code}
            pools={pools}
            total={c.total}
            bases={allocationBases}
            onAddPool={() => addCapPool(c.key)}
            onUpdatePool={updateCapPool}
            onCreateBasis={addAllocationBasis}
          />
        );
      })}
    </div>
  );
}

interface SectionProps {
  name: string;
  code?: string;
  pools: CapPool[];
  total: number;
  bases: AllocationBasis[];
  onAddPool: () => void;
  onUpdatePool: (id: string, patch: Partial<CapPool>) => void;
  onCreateBasis: (input: { name: string; source: string; methodologyNote?: string }) => string;
}

const GRID = "minmax(220px, 1.6fr) 60px 120px minmax(260px, 2fr)";
// Σ of column minimums + gap (3 × 14) — anything narrower clips the
// rightmost cell, so we scroll horizontally below this width.
const GRID_MIN_WIDTH = 705;

function CenterSection({ name, code, pools, total, bases, onAddPool, onUpdatePool, onCreateBasis }: SectionProps) {
  // Sum of allocation percentages. Should normally equal 100%; drift signals
  // an in-progress edit that needs rebalancing.
  const allocPctSum = pools.reduce((a, p) => a + p.allocationPercent, 0);
  const balanced = Math.abs(allocPctSum - 100) < 0.5;
  return (
    <div>
      <SectionLabel right={`${pools.length} pool${pools.length === 1 ? "" : "s"}`}>
        {code && (
          <span style={{
            color: "var(--ink-3)", marginRight: 8,
            letterSpacing: "0.02em", fontWeight: 400, textTransform: "none",
          }}>{code}</span>
        )}
        {name}
      </SectionLabel>
      <div style={{
        background: "var(--paper)",
        border: "1px solid var(--rule)",
        overflow: "hidden",
      }}>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: GRID_MIN_WIDTH }}>
          {/* Column header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: GRID,
            gap: 12,
            padding: "8px 18px",
            background: "var(--paper-2)",
            borderBottom: "1px solid var(--rule)",
          }}>
            <DrilldownLabel>Pool</DrilldownLabel>
            <DrilldownLabel align="right">%</DrilldownLabel>
            <DrilldownLabel align="right">$</DrilldownLabel>
            <DrilldownLabel>Basis</DrilldownLabel>
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

          {/* Reconciliation row — Total | sum% | center $ | */}
          <div style={{
            display: "grid",
            gridTemplateColumns: GRID,
            gap: 12,
            padding: "9px 18px",
            borderTop: "2px solid var(--ink)",
            background: "var(--paper-2)",
            fontSize: 12, fontWeight: 600,
          }}>
            <div className="mono" style={{
              fontSize: "var(--t-l9)", letterSpacing: "0.1em",
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
            <div/>
          </div>
        </div>
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
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: GRID,
      gap: 12,
      padding: "10px 18px",
      alignItems: "baseline",
      borderBottom: !isLast ? "1px solid var(--rule)" : "none",
      background: "var(--paper)",
      fontSize: "var(--t-l7)",
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
        type="currency" value={Math.round(pool.amount)} min={0}
        onChange={(v) => onUpdate({ amount: Number(v) || 0 })}
        align="right" prefix="$"
      />
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
