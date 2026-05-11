import { Link } from "@tanstack/react-router";
import { SECTIONS, type Section } from "@/lib/data/annual";

const TONE_COLOR = {
  neutral: "var(--ink-3)",
  neg:     "var(--neg)",
  warn:    "var(--warn)",
  pos:     "var(--pos)",
};

function SectionCard({ s }: { s: Section }) {
  const impactColor = TONE_COLOR[s.impact.tone];
  const allClear = s.needsReview === 0;
  return (
    <Link to="/annual/sections" style={{ textDecoration: "none" }}>
      <div style={{
        background: "var(--paper)", border: "1px solid var(--rule)",
        padding: "18px 20px",
        display: "flex", flexDirection: "column", gap: 12,
        cursor: "pointer",
        transition: "border-color 80ms",
      }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--rule-strong)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--rule)"; }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div className="mono" style={{
              fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em",
              color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 4,
            }}>{s.k}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{s.label}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>{s.sub}</div>
          </div>
          <div style={{
            fontSize: 11, fontWeight: 600, color: impactColor,
            whiteSpace: "nowrap", textAlign: "right",
          }}>{s.impact.label}</div>
        </div>

        {/* Progress bar */}
        <div>
          <div style={{ height: 4, background: "var(--rule)", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${s.autoPct}%`,
              background: s.needsReview > 10 ? "var(--warn)" : "var(--pos)",
              transition: "width 300ms ease",
            }}/>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 16 }}>
            <div>
              <div className="mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase" }}>Auto</div>
              <div className="num" style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: "var(--pos)" }}>{s.autoPct}%</div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase" }}>Review</div>
              <div className="num" style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: allClear ? "var(--ink)" : "var(--warn)" }}>
                {allClear ? "—" : s.needsReview}
              </div>
            </div>
          </div>
          <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>conf {s.conf}</div>
        </div>
      </div>
    </Link>
  );
}

export function SectionOverviewGrid() {
  const totalReview = SECTIONS.reduce((a, s) => a + s.needsReview, 0);
  const avgAuto = Math.round(SECTIONS.reduce((a, s) => a + s.autoPct, 0) / SECTIONS.length);

  return (
    <div>
      {/* Summary strip */}
      <div style={{
        display: "flex", gap: 0, background: "var(--paper)", border: "1px solid var(--rule)",
        marginBottom: 16,
      }}>
        {[
          { label: "Sections", value: `${SECTIONS.length}` },
          { label: "Auto-mapped", value: `${avgAuto}%`, tone: "pos" as const },
          { label: "Need review", value: `${totalReview}`, tone: totalReview > 0 ? "warn" as const : "pos" as const },
          { label: "Fiscal year", value: "FY 2026-27" },
          { label: "Imported", value: "Apr 24, 2026" },
        ].map((item, i) => (
          <div key={i} style={{
            padding: "10px 16px",
            borderLeft: i > 0 ? "1px solid var(--rule)" : "none",
          }}>
            <div className="mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase" }}>
              {item.label}
            </div>
            <div style={{
              fontSize: 12.5, fontWeight: 500, marginTop: 2,
              color: item.tone === "pos" ? "var(--pos)" : item.tone === "warn" ? "var(--warn)" : "var(--ink-2)",
            }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Section grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {SECTIONS.map((s) => <SectionCard key={s.k} s={s}/>)}
      </div>
    </div>
  );
}
