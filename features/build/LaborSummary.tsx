
import { useSearch } from "@tanstack/react-router";
import { DeptSummaryTable, Ledger, MetaGrid, type DeptSummaryRow } from "@/components/table";
import { DeptChip, Formula, SectionLabel } from "@/components/ui";
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
        dept: (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <DeptChip code={d}/>
            <span style={{ fontWeight: 500 }}>{labelOf(d)}</span>
          </span>
        ),
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
              account: (
                <span style={{
                  color: "var(--ink-3)", textTransform: "uppercase",
                  letterSpacing: "0.06em", fontSize: "var(--t-l9)",
                }}>Total to {labelOf(d)}</span>
              ),
              share: <span className="num">100%</span>,
              comp:  <span className="num">{fmt.dollars(r.totalComp)}</span>,
            }}
          />

          <MetaGrid
            rows={[
              { label: "Formula", value: (
                <>
                  <Formula>direct $/hr = Σ (salary + benefits) ÷ Σ productive hrs</Formula>
                  <span style={{ marginLeft: 8, color: "var(--ink-3)" }}>
                    = {fmt.dollarsK(r.totalComp)} ÷ {fmt.int(r.productiveHours)} hrs
                    {r.directRate > 0 && (
                      <span style={{ marginLeft: 6, color: "var(--ink)", fontWeight: 600 }}>
                        = ${Math.round(r.directRate)}/hr
                      </span>
                    )}
                  </span>
                </>
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
        dept: (
          <span style={{
            color: "var(--ink-3)", textTransform: "uppercase",
            letterSpacing: "0.06em", fontSize: "var(--t-l8)",
          }}>Total</span>
        ),
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
