
import { DeptSummaryTable, Ledger, MetaGrid, type DeptSummaryRow } from "@/components/table";
import { DeptChip, Formula } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { DeptCode } from "@/lib/types";
import { useBuildState } from "@/lib/store";

const ORDER: DeptCode[] = ["PLAN", "BLDG", "ENG"];
const labelOf = (d: DeptCode) => d === "PLAN" ? "Planning" : d === "BLDG" ? "Building" : "Engineering";

/** Per-dept operating rollup with category ledger drilldown. Shared CDS lines
 *  flow in via productive-hours allocation; each dept row expands to show
 *  category-by-category contributions + the operating $/hr derivation. */
export function OperatingSummary() {
  const { operating, derived } = useBuildState();
  const byDept = derived.operatingByDept;
  const includedTotal = operating.filter((l) => l.include).reduce((a, l) => a + l.amount, 0);
  const excluded = operating.filter((l) => !l.include);
  const excludedTotal = excluded.reduce((a, l) => a + l.amount, 0);

  const rows: DeptSummaryRow[] = ORDER.map((d) => {
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
        dept: (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <DeptChip code={d}/>
            <span style={{ fontWeight: 500 }}>{labelOf(d)}</span>
          </span>
        ),
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
        <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 14 }}>
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
                        <span style={{ color: "var(--ink-3)", marginLeft: 6, fontSize: 10.5 }}>· allocated</span>
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
              label: (
                <span style={{
                  color: "var(--ink-3)", textTransform: "uppercase",
                  letterSpacing: "0.06em", fontSize: 10,
                }}>Total to {labelOf(d)}</span>
              ),
              lines: <span className="num">{direct.length + (r.shared > 0 ? shared.length : 0)}</span>,
              share: <span className="num">100%</span>,
              amt:   <span className="num">{fmt.dollars(r.total)}</span>,
            }}
          />
          <MetaGrid
            rows={[
              { label: "Method",  value: "Department-direct lines + shared services allocation by productive-hours share" },
              { label: "Formula", value: (
                <>
                  <Formula>operating $/hr = operating $ ÷ productive hrs</Formula>
                  <span style={{ marginLeft: 8, color: "var(--ink-3)" }}>
                    = {fmt.dollarsK(r.total)} ÷ {Math.round(derived.fbhr[d].productiveHours).toLocaleString()} hrs
                    {r.rate > 0 && (
                      <span style={{ marginLeft: 6, color: "var(--ink)", fontWeight: 600 }}>
                        = ${Math.round(r.rate)}/hr
                      </span>
                    )}
                  </span>
                </>
              )},
              { label: "Routing", value: "Fund-program code (dept-direct) · shared-allocation key (SHARED)" },
              { label: "Source",  value: "FY 26-27 Budget Book.pdf pp. 142–158 · analyst additions" },
              { label: "Excluded", value: `${excluded.filter((l) => l.dept === d || l.dept === "SHARED:CDS").length} line(s) — capital outlay, one-time, or pass-through items not in the rate` },
            ]}
          />
        </div>
      ),
    };
  });

  return (
    <DeptSummaryTable
      title="Operating costs by department"
      cols={[
        { key: "dept",   label: "Department",     width: "1.5fr" },
        { key: "opCost", label: "Operating $",    width: "160px", align: "right", mono: true },
        { key: "perHr",  label: "$/hr",           width: "110px", align: "right", mono: true },
        { key: "driver", label: "Largest driver", width: "1.5fr" },
      ]}
      rows={rows}
      footer={{
        dept: (
          <span style={{
            color: "var(--ink-3)", textTransform: "uppercase",
            letterSpacing: "0.06em", fontSize: 11,
          }}>Citywide</span>
        ),
        opCost: fmt.dollarsK(includedTotal),
        perHr: "—",
        driver: (
          <span style={{ color: "var(--ink-3)" }}>
            {excluded.length} excluded · {fmt.dollarsK(excludedTotal)}
          </span>
        ),
      }}
    />
  );
}
