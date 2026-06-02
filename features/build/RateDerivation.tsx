
import { useMemo, useState } from "react";
import {
  DataTable, type Column,
} from "@/components/table";
import {
  DeptChip, SectionLabel,
} from "@/components/ui";
import { fmt } from "@/lib/format";
import type { DeptCode } from "@/lib/types";
import { deptName } from "@/lib/data/departments";
import { useBuildState } from "@/lib/store";
import {
  deptCapacityWarnings, type DeptCapacityWarning,
} from "@/lib/capacity";
import { FunctionalBucketSupport } from "./FunctionalBucketSupport";

const labelOf = deptName;

interface Row {
  id: DeptCode;
  dept: DeptCode;
  deptName: string;
  fbhr: number;
  productiveHours: number;
  directHours: number;
  utilizationPct: number;
}

export function RateDerivation() {
  const { derived } = useBuildState();
  const [openId, setOpenId] = useState<string | undefined>();

  // Capacity warnings grouped by dept so the Department cell can render
  // an inline ⚠ glyph with a hover-readable tooltip.
  const warningsByDept = useMemo(() => {
    const m = new Map<DeptCode, DeptCapacityWarning[]>();
    for (const w of deptCapacityWarnings(derived.utilization)) {
      const list = m.get(w.dept) ?? [];
      list.push(w);
      m.set(w.dept, list);
    }
    return m;
  }, [derived.utilization]);

  // Skip depts that aren't actually modeled in the active jurisdiction
  // (no productive hours → no rate to render).
  const activeDepts = derived.activeFeeDepts.filter((d) => derived.fbhr[d].productiveHours > 0);
  const rows: Row[] = activeDepts.map((d) => {
    const f = derived.fbhr[d];
    const fa = derived.functionalAllocation.byDept[d];
    const directHours = fa?.rateBasisDirectHours ?? 0;
    const pct = f.productiveHours > 0 ? (directHours / f.productiveHours) * 100 : 0;
    return {
      id: d,
      dept: d,
      deptName: labelOf(d),
      fbhr: f.fbhr,
      productiveHours: f.productiveHours,
      directHours,
      utilizationPct: pct,
    };
  });

  const cols: Column<Row>[] = [
    {
      key: "deptName",
      label: "Department",
      width: "minmax(220px, 2fr)",
      render: (r) => {
        const warns = warningsByDept.get(r.dept);
        return (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <DeptChip code={r.dept}/>
            <span style={{ fontSize: "var(--fs-ui)", fontWeight: 500 }}>{r.deptName}</span>
            {warns && warns.length > 0 && (
              <span
                title={warns.map(formatDeptWarning).join(" · ")}
                style={{ color: "var(--warn)", fontSize: 13, lineHeight: 1 }}
              >⚠</span>
            )}
          </div>
        );
      },
    },
    {
      key: "fbhr",
      label: "FBHR",
      width: "120px",
      align: "right",
      render: (r) => (
        <span className="num" style={{ color: "var(--accent)" }}>
          ${Math.round(r.fbhr)}
        </span>
      ),
    },
    {
      key: "productiveHours",
      label: "Prod Hours",
      width: "120px",
      align: "right",
      render: (r) => <span className="num">{fmt.int(r.productiveHours)}</span>,
    },
    {
      key: "directHours",
      label: "Direct Hours",
      width: "120px",
      align: "right",
      render: (r) => (
        <span className="num" style={{
          color: r.directHours > 0 ? "var(--ink)" : "var(--ink-3)",
        }}>
          {r.directHours > 0 ? fmt.int(r.directHours) : "—"}
        </span>
      ),
    },
    {
      key: "utilizationPct",
      label: "Utilization",
      width: "110px",
      align: "right",
      render: (r) => (
        <span className="num" style={{
          color: r.utilizationPct > 0 ? "var(--ink)" : "var(--ink-3)",
        }}>
          {r.utilizationPct > 0 ? `${Math.round(r.utilizationPct)}%` : "—"}
        </span>
      ),
    },
  ];

  return (
    <div>
      <SectionLabel right={`${rows.length} departments`}>
        Fully burdened hourly rate by department
      </SectionLabel>
      <DataTable
        cols={cols}
        rows={rows}
        openId={openId}
        onRowClick={(r) => setOpenId(openId === r.id ? undefined : r.id)}
        drilldownIndicator
        renderDrilldown={(r) => (
          <div style={{ padding: "16px 20px", background: "var(--paper-2)" }}>
            <FunctionalBucketSupport dept={r.dept}/>
          </div>
        )}
      />
    </div>
  );
}

/** Tooltip text for the ⚠ glyph next to a dept name on the FBHR table. */
function formatDeptWarning(w: DeptCapacityWarning): string {
  if (w.kind === "utilization-critical") {
    return `Utilization ${Math.round(w.pct)}% — over capacity (>125%)`;
  }
  return `${fmt.int(w.allocated)} demand hrs against 0 productive hours`;
}
