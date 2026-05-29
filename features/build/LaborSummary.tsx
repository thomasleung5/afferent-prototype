
import { useSearch } from "@tanstack/react-router";
import { DeptSummaryTable, Ledger, MetaGrid, type DeptSummaryRow } from "@/components/table";
import { DeptCellHeader, RateFormula, SectionLabel, TotalEyebrow } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { DeptCode } from "@/lib/types";
import { deptName, FEE_DEPTS } from "@/lib/data/departments";
import { useBuildState } from "@/lib/store";

const ORDER: DeptCode[] = FEE_DEPTS;
const labelOf = deptName;

/** Per-dept direct labor rollup. Each row expands inline to a position ledger
 *  + method/formula/source metadata grid — the audit trail. */
export function LaborSummary() {
  const { operating, derived } = useBuildState();
  const labor = derived.labor;
  const { dept: searchDept } = useSearch({ from: "/build/direct-labor" });

  const totalComp = ORDER.reduce((a, d) => a + labor[d].totalComp, 0);
  const totalHrs  = ORDER.reduce((a, d) => a + labor[d].productiveHours, 0);
  const totalFte  = ORDER.reduce((a, d) => a + labor[d].fte, 0);
  const totalPositions = ORDER.reduce((a, d) => a + labor[d].positions, 0);

  // Only show depts with at least one role in the active jurisdiction.
  // Avoids zero-data rows for depts the current jurisdiction doesn't model.
  const activeDepts = ORDER.filter((d) => labor[d].positions > 0);
  const rows: DeptSummaryRow[] = activeDepts.map((d) => {
    const r = labor[d];
    // PR-I: labor lives at GL/account granularity, not per-role. The
    // drilldown ledger groups by account name (Regular Salaries,
    // Retirement, etc.); FTE has no per-account meaning so it's omitted.
    const compByAccount = new Map<string, number>();
    for (const o of operating) {
      if (o.costType !== "Labor") continue;
      if (o.dept !== d) continue;
      compByAccount.set(o.line, (compByAccount.get(o.line) ?? 0) + o.amount);
    }
    const ledger = [...compByAccount.entries()]
      .map(([account, comp]) => ({ account, comp }))
      .sort((a, b) => b.comp - a.comp);

    return {
      key: d,
      cells: {
        dept: <DeptCellHeader code={d}/>,
        positions: (
          <span>
            {r.positions}
            <span style={{ color: "var(--ink-3)", fontWeight: 400, marginLeft: 6 }}>
              · {r.fte.toFixed(1)} FTE
            </span>
          </span>
        ),
        avgRate: r.directRate > 0 ? `$${Math.round(r.directRate)}` : "—",
        hrs: fmt.int(r.productiveHours),
        total: fmt.dollarsK(r.totalComp),
      },
      drilldown: (
        <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 12 }}>
          <Ledger
            cols={[
              { key: "account", label: "Account", width: "1fr" },
              { key: "share",   label: "Share",   width: "90px",  align: "right" },
              { key: "comp",    label: "Amount",  width: "130px", align: "right" },
            ]}
            rows={ledger.map((p) => {
              const pct = r.totalComp > 0 ? Math.round((p.comp / r.totalComp) * 100) : 0;
              return {
                key: p.account,
                cells: {
                  account: <span style={{ color: "var(--ink-2)" }}>{p.account}</span>,
                  share:   <span className="num" style={{ color: "var(--ink-3)" }}>{pct}%</span>,
                  comp:    <span className="num" style={{ fontWeight: 600 }}>{fmt.dollars(p.comp)}</span>,
                },
              };
            })}
            total={{
              account: <TotalEyebrow>Total {labelOf(d)}</TotalEyebrow>,
              share: <span className="num">100%</span>,
              comp:  <span className="num">{fmt.dollars(r.totalComp)}</span>,
            }}
          />

          <MetaGrid
            rows={[
              { label: "Formula", value: (
                <RateFormula
                  formula="direct $/hr = Σ (salary + benefits) ÷ Σ productive hrs"
                  numerator={r.totalComp}
                  hours={r.productiveHours}
                  rate={r.directRate}
                />
              )},
            ]}
          />
        </div>
      ),
    };
  });

  return (
    <div>
      <SectionLabel right={`${rows.length} departments · ${totalPositions} positions`}>
        Direct labor by department
      </SectionLabel>
      <DeptSummaryTable
        autoOpenKey={searchDept}
        cols={[
        { key: "dept",      label: "Department",  width: "1.5fr" },
        { key: "positions", label: "Positions",   width: "160px" },
        { key: "avgRate",   label: "Avg $/hr",    width: "110px", align: "right", mono: true },
        { key: "hrs",       label: "Prod hrs",    width: "110px", align: "right", mono: true },
        { key: "total",     label: "Labor $",     width: "160px", align: "right", mono: true },
      ]}
      rows={rows}
      footer={{
        dept: <TotalEyebrow size="l8">Total</TotalEyebrow>,
        positions: (
          <span>
            {totalPositions}
            <span style={{ color: "var(--ink-3)", fontWeight: 400, marginLeft: 6 }}>
              · {totalFte.toFixed(1)} FTE
            </span>
          </span>
        ),
        avgRate: "—",
        hrs: fmt.int(totalHrs),
        total: fmt.dollarsK(totalComp),
      }}
      />
    </div>
  );
}
