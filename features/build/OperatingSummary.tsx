
import { useSearch } from "@tanstack/react-router";
import { DeptSummaryTable, Ledger, MetaGrid, type DeptSummaryRow } from "@/components/table";
import { DeptCellHeader, RateFormula, SectionLabel, TotalEyebrow } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { DeptCode } from "@/lib/types";
import { deptName, FEE_DEPTS } from "@/lib/data/departments";
import { useBuildState } from "@/lib/store";

const ORDER: DeptCode[] = FEE_DEPTS;
const labelOf = deptName;

/** Per-dept operating rollup with category ledger drilldown. Shared CDS lines
 *  flow in via productive-hours allocation; each dept row expands to show
 *  category-by-category contributions + the operating $/hr derivation. */
export function OperatingSummary() {
  const { operating, derived } = useBuildState();
  const byDept = derived.operatingByDept;
  const { dept: searchDept } = useSearch({ from: "/build/operating" });
  const includedTotal = operating.filter((l) => l.include).reduce((a, l) => a + l.amount, 0);
  const excluded = operating.filter((l) => !l.include);
  const excludedTotal = excluded.reduce((a, l) => a + l.amount, 0);

  // Only emit a row when the department actually has operating data in
  // the active jurisdiction.
  const activeDepts = ORDER.filter((d) => {
    const r = byDept[d];
    return r && (r.total > 0 || operating.some((l) => l.dept === d));
  });

  const rows: DeptSummaryRow[] = activeDepts.map((d) => {
    const r = byDept[d];
    const direct = operating.filter((l) => l.include && l.dept === d);
    const shared = operating.filter((l) => l.include && l.dept === "SHARED:CDS");
    const byCat: Record<string, number> = {};
    direct.forEach((l) => { byCat[l.category] = (byCat[l.category] ?? 0) + l.amount; });
    const ledger = Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => ({
        cat,
        lines: direct.filter((l) => l.category === cat).length,
        amt,
        shared: false,
      }));
    if (r.shared > 0) {
      ledger.push({ cat: "Shared services allocation", lines: shared.length, amt: r.shared, shared: true });
    }
    ledger.sort((a, b) => b.amt - a.amt);
    const topCat = ledger[0];
    const driverPct = topCat && r.total > 0 ? Math.round((topCat.amt / r.total) * 100) : 0;

    return {
      key: d,
      cells: {
        dept: <DeptCellHeader code={d}/>,
        opCost: fmt.dollarsK(r.total),
        perHr: r.rate > 0 ? `$${Math.round(r.rate)}` : "—",
        driver: topCat ? (
          <span>
            <span style={{ color: "var(--ink)" }}>{topCat.cat}</span>
            <span style={{ color: "var(--ink-3)", marginLeft: 6 }}>{driverPct}%</span>
          </span>
        ) : <span style={{ color: "var(--ink-3)" }}>—</span>,
      },
      drilldown: (
        <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 12 }}>
          <Ledger
            cols={[
              { key: "label", label: "Category", width: "1fr" },
              { key: "lines", label: "Lines",    width: "80px",  align: "right" },
              { key: "share", label: "Share",    width: "80px",  align: "right" },
              { key: "amt",   label: "Amount",   width: "130px", align: "right" },
            ]}
            rows={ledger.map((l) => {
              const pct = r.total > 0 ? Math.round((l.amt / r.total) * 100) : 0;
              return {
                key: l.cat,
                cells: {
                  label: (
                    <span style={{ color: "var(--ink-2)" }}>
                      {l.cat}
                      {l.shared && (
                        <span style={{ color: "var(--ink-3)", marginLeft: 6, fontSize: "var(--t-l4)" }}>· allocated</span>
                      )}
                    </span>
                  ),
                  lines: <span className="num" style={{ color: "var(--ink-3)" }}>{l.lines}</span>,
                  share: <span className="num" style={{ color: "var(--ink-3)" }}>{pct}%</span>,
                  amt:   <span className="num" style={{ fontWeight: 600 }}>{fmt.dollars(l.amt)}</span>,
                },
              };
            })}
            total={{
              label: <TotalEyebrow>Total {labelOf(d)}</TotalEyebrow>,
              lines: <span className="num">{direct.length + (r.shared > 0 ? shared.length : 0)}</span>,
              share: <span className="num">100%</span>,
              amt:   <span className="num">{fmt.dollars(r.total)}</span>,
            }}
          />
          <RateFormula
            formula="operating $/hr = operating $ ÷ productive hrs"
            numerator={r.total}
            hours={derived.fbhr[d].productiveHours}
            rate={r.rate}
          />
          {(() => {
            const excludedCount = excluded.filter((l) => l.dept === d || l.dept === "SHARED:CDS").length;
            if (excludedCount === 0) return null;
            return (
              <MetaGrid rows={[{
                label: "Excluded",
                value: `${excludedCount} line(s) — capital outlay, one-time, or pass-through items not in the rate`,
              }]}/>
            );
          })()}
        </div>
      ),
    };
  });

  return (
    <div>
      <SectionLabel right={`${rows.length} departments`}>
        Operating costs by department
      </SectionLabel>
      <DeptSummaryTable
        autoOpenKey={searchDept}
        cols={[
        { key: "dept",   label: "Department",     width: "1.5fr" },
        { key: "opCost", label: "Operating $",    width: "160px", align: "right", mono: true },
        { key: "perHr",  label: "$/hr",           width: "110px", align: "right", mono: true },
        { key: "driver", label: "Largest driver", width: "1.5fr" },
      ]}
      rows={rows}
      footer={{
        dept: <TotalEyebrow size="l8">Total</TotalEyebrow>,
        opCost: fmt.dollarsK(includedTotal),
        perHr: "—",
        driver: (
          <span style={{ color: "var(--ink-3)" }}>
            {excluded.length} excluded · {fmt.dollarsK(excludedTotal)}
          </span>
        ),
      }}
      />
    </div>
  );
}
