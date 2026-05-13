
import { fmt } from "@/lib/format";
import type { CapPool } from "@/lib/types";
import { useBuildState } from "@/lib/store";
import { deriveCenters } from "./CapKpiRail";

export function CapPoolsTable() {
  const { capPools, capCenterOrder } = useBuildState();
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
}

function CenterSection({ name, pools, total }: SectionProps) {
  return (
    <div style={{
      background: "var(--paper)",
      border: "1px solid var(--rule)",
      overflow: "hidden",
    }}>
      {/* Header strip — center name + eyebrow */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        padding: "13px 18px 12px",
        borderBottom: "1px solid var(--rule-strong)",
        background: "var(--paper)",
      }}>
        <div>
          <div className="display" style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
            {name}
          </div>
        </div>
      </div>

      {/* Column header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(220px, 1.6fr) 60px 120px minmax(220px, 1.6fr) minmax(220px, 1.6fr)",
        gap: 14,
        padding: "8px 18px",
        background: "var(--paper-2)",
        borderBottom: "1px solid var(--rule)",
        fontFamily: "var(--ff-mono)", fontSize: 10, fontWeight: 600,
        letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase",
      }}>
        <div>Pool</div>
        <div style={{ textAlign: "right" }}>%</div>
        <div style={{ textAlign: "right" }}>Amount</div>
        <div>Basis</div>
        <div>Explanation</div>
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
          />
        );
      })}

      {/* Subtotal footer */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(220px, 1.6fr) 60px 120px minmax(220px, 1.6fr) minmax(220px, 1.6fr)",
        gap: 14,
        padding: "9px 18px",
        borderTop: "2px solid var(--ink)",
        background: "var(--paper-2)",
        fontSize: 12, fontWeight: 600,
      }}>
        <div className="mono" style={{
          fontSize: 10, letterSpacing: "0.1em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>Subtotal</div>
        <div className="num" style={{ textAlign: "right" }}>100%</div>
        <div className="num" style={{ textAlign: "right" }}>{fmt.dollars(total)}</div>
        <div/>
        <div/>
      </div>
    </div>
  );
}

interface RowProps {
  pool: CapPool;
  centerTotal: number;
  isLast: boolean;
}

function PoolRow({ pool, centerTotal, isLast }: RowProps) {
  const pct = centerTotal > 0 ? Math.round((pool.amount / centerTotal) * 100) : 0;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(220px, 1.6fr) 60px 120px minmax(220px, 1.6fr) minmax(220px, 1.6fr)",
      gap: 14,
      padding: "10px 18px",
      alignItems: "baseline",
      borderBottom: !isLast ? "1px solid var(--rule)" : "none",
      background: "var(--paper)",
      fontSize: 12.5,
    }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
        {pool.pool}
      </div>
      <div className="num" style={{ textAlign: "right", color: "var(--ink-3)" }}>
        {pct}%
      </div>
      <div className="num" style={{ textAlign: "right", color: "var(--ink)" }}>
        {fmt.dollars(pool.amount)}
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 }}>
        {pool.basis}
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 }}>
        {pool.recoverability}
      </div>
    </div>
  );
}
