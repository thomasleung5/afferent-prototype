import { Btn, Icon } from "@/components/ui";

interface ImportCard {
  name: string;
  rows: number;
  mapped: number;
  review: number;
  conf: string;
  section: string;
}

const CARDS: ImportCard[] = [
  { name: "Adopted Budget",       rows:  842, mapped:  811, review: 31, conf: "High",        section: "Operating + Direct Labor" },
  { name: "Salary and Benefits",  rows:   73, mapped:   67, review:  6, conf: "Medium",      section: "Direct Labor" },
  { name: "Staffing / FTE",       rows:   73, mapped:   73, review:  0, conf: "High",        section: "Direct Labor" },
  { name: "CAP / Indirect Costs", rows:   14, mapped:   12, review:  2, conf: "Medium-High", section: "Cost Allocation" },
  { name: "Workload Volumes",     rows: 1246, mapped: 1229, review: 17, conf: "Medium",      section: "Workload" },
  { name: "Current Fee Schedule", rows:  216, mapped:  214, review:  2, conf: "High",        section: "Fee schedule" },
];

export function RefreshImportGrid() {
  const totalRows   = CARDS.reduce((a, c) => a + c.rows, 0);
  const totalMapped = CARDS.reduce((a, c) => a + c.mapped, 0);
  const totalReview = CARDS.reduce((a, c) => a + c.review, 0);
  const autoPct     = Math.round(totalMapped / totalRows * 100);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Drop zone placeholder */}
      <div style={{
        background: "var(--paper)", border: "2px dashed var(--rule-strong)",
        padding: "28px 32px", textAlign: "center",
      }}>
        <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 8 }}>
          Drop this year's source files
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 16 }}>
          xlsx, csv, pdf, or a zip of all six exports
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            Last import: <span style={{ color: "var(--ink)" }}>FY26-27 annual refresh.zip · 6 files</span>
            {" · "}{totalRows.toLocaleString()} rows
            {" · "}<span style={{ color: "var(--pos)" }}>{autoPct}% auto-mapped</span>
            {totalReview > 0 && <span style={{ color: "var(--warn)" }}> · {totalReview} need review</span>}
            {" · "}Apr 24, 2026
          </div>
        </div>
      </div>

      {/* Import cards */}
      <div>
        <div className="mono" style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em",
          color: "var(--ink-3)", textTransform: "uppercase",
          marginBottom: 10,
        }}>Imports by model section</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {CARDS.map((c, i) => {
            const pct = Math.round(c.mapped / c.rows * 100);
            return (
              <div key={i} style={{ background: "var(--paper)", border: "1px solid var(--rule)", padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <div>
                    <div className="mono" style={{
                      fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em",
                      color: "var(--ink-3)", textTransform: "uppercase",
                    }}>{c.section}</div>
                    <div className="display" style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{c.name}</div>
                  </div>
                  <span className="mono" style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                    padding: "2px 7px", border: "1px solid var(--rule)",
                    background: "var(--paper-2)", color: "var(--ink-2)",
                  }}>{c.conf}</span>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div style={{ height: 6, background: "var(--rule)", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", width: `${pct}%`,
                      background: c.review > 10 ? "var(--warn)" : "var(--pos)",
                    }}/>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 14 }}>
                  {[
                    { label: "Imported",    value: c.rows.toLocaleString(),   color: "var(--ink)" },
                    { label: "Auto-mapped", value: c.mapped.toLocaleString(), color: "var(--pos)" },
                    { label: "Need review", value: String(c.review),          color: c.review > 10 ? "var(--warn)" : "var(--ink)" },
                  ].map((stat) => (
                    <div key={stat.label}>
                      <div className="mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase" }}>
                        {stat.label}
                      </div>
                      <div className="num" style={{ fontSize: 16, fontWeight: 600, marginTop: 2, color: stat.color }}>
                        {stat.value}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{
                  marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--rule)",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
                    Imported Apr 18, 2026
                  </span>
                  <Btn kind="ghost"><Icon name="share" size={11}/> Re-import</Btn>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
