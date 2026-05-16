
import { DeptSummaryTable, Ledger, MetaGrid, type DeptSummaryRow } from "@/components/table";
import { DeptChip, Formula } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { DeptCode } from "@/lib/types";
import { DEPTS } from "@/lib/data/departments";
import { useBuildState } from "@/lib/store";

const ORDER: DeptCode[] = ["PLAN", "BLDG", "ENG"];

const labelOf = (d: DeptCode): string =>
  d === "PLAN" ? "Planning" : d === "BLDG" ? "Building" : "Engineering";

/** Per-dept direct labor rollup. Each row expands inline to a position ledger
 *  + method/formula/source metadata grid — the audit trail. */
export function LaborSummary() {
  const { positions, derived } = useBuildState();
  const labor = derived.labor;

  const totalComp = ORDER.reduce((a, d) => a + labor[d].totalComp, 0);
  const totalHrs  = ORDER.reduce((a, d) => a + labor[d].productiveHours, 0);
  const totalFte  = ORDER.reduce((a, d) => a + labor[d].fte, 0);
  const totalPositions = ORDER.reduce((a, d) => a + labor[d].positions, 0);

  const rows: DeptSummaryRow[] = ORDER.map((d) => {
    const r = labor[d];
    const directs = positions.filter((p) => p.dept === d);
    const ledger = [...directs]
      .map((p) => ({
        title: p.title,
        fte: p.fte,
        comp: (p.salary + p.benefits) * p.fte,
      }))
      .sort((a, b) => b.comp - a.comp)
      .slice(0, 8);

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
        hrs: Math.round(r.productiveHours).toLocaleString(),
        total: fmt.dollarsK(r.totalComp),
      },
      drilldown: (
        <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 14 }}>
          <Ledger
            cols={[
              { key: "title", label: "Position",       width: "1fr" },
              { key: "fte",   label: "FTE",            width: "90px",  align: "right" },
              { key: "share", label: "Share",          width: "80px",  align: "right" },
              { key: "comp",  label: "Comp",           width: "130px", align: "right" },
            ]}
            rows={ledger.map((p) => {
              const pct = r.totalComp > 0 ? Math.round((p.comp / r.totalComp) * 100) : 0;
              return {
                key: p.title,
                cells: {
                  title: <span style={{ color: "var(--ink-2)" }}>{p.title}</span>,
                  fte:   <span className="num" style={{ color: "var(--ink-3)" }}>{p.fte.toFixed(2)}</span>,
                  share: <span className="num" style={{ color: "var(--ink-3)" }}>{pct}%</span>,
                  comp:  <span className="num" style={{ fontWeight: 600 }}>{fmt.dollars(p.comp)}</span>,
                },
              };
            })}
            total={{
              title: (
                <span style={{
                  color: "var(--ink-3)", textTransform: "uppercase",
                  letterSpacing: "0.06em", fontSize: 10,
                }}>Total to {labelOf(d)}</span>
              ),
              fte:   <span className="num">{r.fte.toFixed(1)}</span>,
              share: <span className="num">100%</span>,
              comp:  <span className="num">{fmt.dollars(r.totalComp)}</span>,
            }}
          />

          <MetaGrid
            rows={[
              { label: "Method",      value: "Position-level salary + benefits × FTE" },
              { label: "Formula", value: (
                <>
                  <Formula>direct $/hr = Σ (salary + benefits) ÷ Σ productive hrs</Formula>
                  <span style={{ marginLeft: 8, color: "var(--ink-3)" }}>
                    = {fmt.dollarsK(r.totalComp)} ÷ {Math.round(r.productiveHours).toLocaleString()} hrs
                    {r.directRate > 0 && (
                      <span style={{ marginLeft: 6, color: "var(--ink)", fontWeight: 600 }}>
                        = ${Math.round(r.directRate)}/hr
                      </span>
                    )}
                  </span>
                </>
              )},
              { label: "Productive hrs", value: "Paid hrs less PTO, holiday, training · 1,720 hrs/FTE citywide default" },
              { label: "Roster source",  value: "FY 26-27 Salary Table.xlsx · imported Apr 18, 2026" },
              { label: "Carries into",   value: "Stacks with operating $/hr + CAP $/hr to form FBHR in Cost of Service" },
            ]}
          />
        </div>
      ),
    };
  });

  return (
    <DeptSummaryTable
      title="Direct labor by department"
      cols={[
        { key: "dept",      label: "Department",  width: "1.5fr" },
        { key: "positions", label: "Positions",   width: "160px" },
        { key: "avgRate",   label: "Avg $/hr",    width: "110px", align: "right", mono: true },
        { key: "hrs",       label: "Prod hrs",    width: "110px", align: "right", mono: true },
        { key: "total",     label: "Total labor", width: "160px", align: "right", mono: true },
      ]}
      rows={rows}
      footer={{
        dept: (
          <span style={{
            color: "var(--ink-3)", textTransform: "uppercase",
            letterSpacing: "0.06em", fontSize: 11,
          }}>Citywide</span>
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
        hrs: Math.round(totalHrs).toLocaleString(),
        total: fmt.dollarsK(totalComp),
      }}
    />
  );
}
