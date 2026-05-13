
import { useMemo } from "react";
import { Drawer } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { CapPool, DeptCode } from "@/lib/types";
import { computeStepDown, type MatrixDeptCode } from "@/lib/data/capStepDown";
import { useBuildState } from "@/lib/store";
import { Section, Row } from "./ServiceDetail";

const ORDER: DeptCode[] = ["PLAN", "BLDG", "ENG"];

interface Props {
  pool: CapPool | null;
  onClose: () => void;
}

/** Pool drilldown — source / basis / recoverability + how the pool steps down
 *  to each direct dept. Read-only: pool-level allocation is governed by the
 *  CAP step-down engine, not direct edits here. */
export function CapPoolDetail({ pool, onClose }: Props) {
  const { capPools, capCenterOrder } = useBuildState();
  const model = useMemo(
    () => computeStepDown(capPools, capCenterOrder),
    [capPools, capCenterOrder],
  );
  if (!pool) return null;
  const byDept = ORDER.map((d) => ({
    dept: d,
    amount: model.alloc2[pool.id]?.[d as MatrixDeptCode] ?? 0,
  }));
  const totalToDirect = byDept.reduce((a, b) => a + b.amount, 0);

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow={`Cost allocation pool · ${pool.center}`}
      title={pool.pool}
      subtitle={<span className="mono" style={{ fontSize: 11 }}>{pool.id}</span>}
      width={560}
    >
      <Section title="Source">
        <Row label="Center">{pool.center}</Row>
        <Row label="Receiving">{pool.receiving}</Row>
        <Row label="Status">
          <span style={{ color: pool.review === "Reviewed" ? "var(--pos)" : "var(--warn)" }}>
            {pool.review}
          </span>
        </Row>
      </Section>

      <Section title="Allocation basis">
        <Row label="Basis">{pool.basis}</Row>
        <Row label="Recoverability">{pool.recoverability}</Row>
      </Section>

      <Section title="Pool amount">
        <div style={{
          padding: "12px 14px", background: "var(--paper-2)", border: "1px solid var(--rule)",
          fontFamily: "var(--ff-mono)", fontSize: 13, fontWeight: 600,
        }}>
          {fmt.dollars(pool.amount)}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
          Pool totals are set by the Cost Allocation Plan import. To override
          the final allocated $ that lands on a direct department, edit that
          dept's allocation in the rollup above the table.
        </div>
      </Section>

      <Section title="Step-down → direct depts">
        <div style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}>
          {byDept.map((r, i) => {
            const pct = totalToDirect > 0 ? Math.round((r.amount / totalToDirect) * 100) : 0;
            return (
              <div key={r.dept} style={{
                display: "grid", gridTemplateColumns: "80px 70px 1fr",
                gap: 12, padding: "8px 12px",
                borderBottom: i < byDept.length - 1 ? "1px solid var(--rule)" : "none",
                alignItems: "baseline", fontSize: 12.5,
              }}>
                <span className="mono" style={{ color: "var(--ink-2)" }}>{r.dept}</span>
                <span className="num" style={{ color: "var(--ink-3)" }}>{pct}%</span>
                <span className="num" style={{ textAlign: "right", fontWeight: 500 }}>
                  {fmt.dollars(r.amount)}
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
            <span className="mono" style={{ color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total</span>
            <span className="num" style={{ color: "var(--ink-3)" }}>100%</span>
            <span className="num" style={{ textAlign: "right" }}>{fmt.dollars(totalToDirect)}</span>
          </div>
        </div>
      </Section>
    </Drawer>
  );
}
