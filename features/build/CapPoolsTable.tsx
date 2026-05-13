
import { useState, type ReactNode } from "react";
import { DrilldownShell, DrilldownColumn, TraceBlock, Formula, SourcePill } from "@/components/ui";
import { fmt } from "@/lib/format";
import { CAP_POOL_BY_DEPT } from "@/lib/data/cap";
import type { CapPool, DeptCode } from "@/lib/types";
import { useBuildState } from "@/lib/store";
import { deriveCenters } from "./CapKpiRail";

const ORDER: DeptCode[] = ["PLAN", "BLDG", "ENG"];

export function CapPoolsTable() {
  const { capPools, capCenterOrder } = useBuildState();
  const [openId, setOpenId] = useState<string | undefined>();

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
            openId={openId}
            onRowClick={(id) => setOpenId(openId === id ? undefined : id)}
          />
        );
      })}
      <div style={{
        fontSize: 11.5, color: "var(--ink-3)",
        padding: "4px 2px",
      }}>
        {centers.length} cost centers · {capPools.length} pools · click a pool to trace its basis and step-down
      </div>
    </div>
  );
}

interface SectionProps {
  name: string;
  pools: CapPool[];
  total: number;
  openId?: string;
  onRowClick: (id: string) => void;
}

function CenterSection({ name, pools, total, openId, onRowClick }: SectionProps) {
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
        const isOpen = openId === p.id;
        const isLast = i === pools.length - 1;
        return (
          <PoolRow
            key={p.id}
            pool={p}
            centerTotal={total}
            isOpen={isOpen}
            isLast={isLast}
            onClick={() => onRowClick(p.id)}
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
  isOpen: boolean;
  isLast: boolean;
  onClick: () => void;
}

function PoolRow({ pool, centerTotal, isOpen, isLast, onClick }: RowProps) {
  const pct = centerTotal > 0 ? Math.round((pool.amount / centerTotal) * 100) : 0;
  return (
    <>
      <div
        onClick={onClick}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 1.6fr) 60px 120px minmax(220px, 1.6fr) minmax(220px, 1.6fr)",
          gap: 14,
          padding: "10px 18px 10px 15px",
          alignItems: "baseline",
          borderBottom: isOpen
            ? "1px solid var(--accent)"
            : !isLast ? "1px solid var(--rule)" : "none",
          background: isOpen ? "var(--paper-2)" : "var(--paper)",
          borderLeft: isOpen ? "3px solid var(--accent)" : "3px solid transparent",
          fontSize: 12.5,
          cursor: "pointer",
        }}
      >
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
      {isOpen && (
        <div style={{
          padding: "16px 20px",
          background: "var(--paper-2)",
          borderBottom: !isLast ? "1px solid var(--rule)" : "none",
        }}>
          <PoolDrilldown pool={pool}/>
        </div>
      )}
    </>
  );
}

function PoolDrilldown({ pool }: { pool: CapPool }) {
  const byDept = ORDER.map((d) => ({
    dept: d,
    amount: (CAP_POOL_BY_DEPT[d] ?? []).find((x) => x.poolId === pool.id)?.allocated ?? 0,
  }));
  const totalToDirect = byDept.reduce((a, b) => a + b.amount, 0);
  return (
    <DrilldownShell>
      <DrilldownColumn marker="①" title="Source · pool definition">
        <TraceBlock label="Pool ID"><span className="mono">{pool.id}</span></TraceBlock>
        <TraceBlock label="Center">{pool.center}</TraceBlock>
        <TraceBlock label="Receiving">{pool.receiving}</TraceBlock>
        <TraceBlock label="Total amount"><b className="num">{fmt.dollars(pool.amount)}</b></TraceBlock>
        <div style={{ marginTop: 10 }}>
          <SourcePill tone={pool.review === "Reviewed" ? "fact" : "policy"}>
            {pool.review.toUpperCase()}
          </SourcePill>
        </div>
      </DrilldownColumn>

      <DrilldownColumn marker="②" title="Allocation method">
        <TraceBlock label="Basis">{pool.basis}</TraceBlock>
        <TraceBlock label="Recoverability">{pool.recoverability}</TraceBlock>
        <div style={{
          padding: "10px 14px", marginTop: 12,
          background: "var(--paper)", border: "1px solid var(--rule)",
          fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9,
        }}>
          <SplitLine label="pool amount" value={fmt.dollars(pool.amount)}/>
          <SplitLine label="step-down to direct" value={fmt.dollars(totalToDirect)}/>
          <div style={{
            borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6,
            display: "flex", justifyContent: "space-between",
          }}>
            <span>retained on indirect</span>
            <b>{fmt.dollars(Math.max(0, pool.amount - totalToDirect))}</b>
          </div>
        </div>
      </DrilldownColumn>

      <DrilldownColumn marker="③" title="Step-down → direct depts">
        <div style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}>
          {byDept.map((b, i) => {
            const pct = totalToDirect > 0 ? Math.round((b.amount / totalToDirect) * 100) : 0;
            return (
              <div key={b.dept} style={{
                display: "grid", gridTemplateColumns: "80px 70px 1fr",
                gap: 12, padding: "7px 12px",
                borderBottom: i < byDept.length - 1 ? "1px solid var(--rule)" : "none",
                alignItems: "baseline", fontSize: 12.5,
              }}>
                <span className="mono" style={{ color: "var(--ink-2)" }}>{b.dept}</span>
                <span className="num" style={{ color: "var(--ink-3)", textAlign: "right" }}>{pct}%</span>
                <span className="num" style={{ textAlign: "right", fontWeight: 500 }}>
                  {fmt.dollars(b.amount)}
                </span>
              </div>
            );
          })}
          <div style={{
            display: "grid", gridTemplateColumns: "80px 70px 1fr",
            gap: 12, padding: "8px 12px",
            background: "var(--paper-2)", borderTop: "2px solid var(--ink)",
            fontSize: 12, fontWeight: 600,
          }}>
            <span className="mono" style={{
              color: "var(--ink-3)", textTransform: "uppercase",
              letterSpacing: "0.06em", fontSize: 10,
            }}>Total</span>
            <span className="num" style={{ textAlign: "right" }}>100%</span>
            <span className="num" style={{ textAlign: "right" }}>{fmt.dollars(totalToDirect)}</span>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <Formula>allocated $ = pool × driver_share</Formula>
        </div>
      </DrilldownColumn>
    </DrilldownShell>
  );
}

function SplitLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "var(--ink-3)" }}>{label}</span>
      <b>{value}</b>
    </div>
  );
}
