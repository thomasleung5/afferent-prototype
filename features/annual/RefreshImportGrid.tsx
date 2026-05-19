import { Btn, Icon, SectionLabel } from "@/components/ui";
import { useBuildState } from "@/lib/store";
import {
  deriveRefreshSections, deriveRefreshSummary, type RefreshSectionCard,
} from "@/lib/data/annual";

export function RefreshImportGrid() {
  const state = useBuildState();
  const input = {
    imports: state.imports,
    positions: state.positions,
    operating: state.operating,
    workload: state.workload,
    services: state.services,
    capPools: state.capPools,
    comparisons: state.derived.comparisons,
    impact: state.derived.impact,
  };
  const cards = deriveRefreshSections(input);
  const summary = deriveRefreshSummary(input);
  const importedDomains = summary.inputsRefreshed;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Drop zone */}
      <div style={{
        background: "var(--paper)", border: "2px dashed var(--rule-strong)",
        padding: "14px 20px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
          <div className="mono" style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
            color: "var(--ink-3)", textTransform: "uppercase",
          }}>
            Refresh source files
          </div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
            Last refresh: <span style={{ color: "var(--ink-2)" }}>{summary.lastRefresh}</span>
            {summary.hasImports
              ? <>
                  {" · "}{importedDomains} of {summary.totalInputs} input{summary.totalInputs === 1 ? "" : "s"}
                  {" · "}{summary.totalRows.toLocaleString()} rows
                  {" · "}<span style={{ color: "var(--pos)" }}>{summary.autoPct}% auto-mapped</span>
                  {summary.totalReview > 0 && <span style={{ color: "var(--warn)" }}> · {summary.totalReview} need review</span>}
                </>
              : <> {" · "}Seed baseline · upload sources to refresh</>}
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 6, lineHeight: 1.5 }}>
          Upload current-year exports for staffing, operating, workload, fee schedules, benchmark fees, and CAP inputs.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {[
            "Budget export",
            "Staffing / FTE",
            "Operating costs",
            "Workload metrics",
            "Fee schedule",
            "CAP / indirect costs",
            "Benchmark fees",
          ].map((label) => (
            <span key={label} className="mono" style={{
              fontSize: 10.5, color: "var(--ink-2)",
              padding: "2px 8px",
              border: "1px solid var(--rule)",
              background: "var(--paper-2)",
              letterSpacing: "0.04em",
            }}>{label}</span>
          ))}
        </div>
      </div>

      {/* Per-section cards */}
      <div>
        <SectionLabel right={`${cards.length} sections · ${importedDomains} refreshed`}>
          Imports by model section
        </SectionLabel>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {cards.map((c) => <SectionCard key={c.domain} card={c}/>)}
        </div>
      </div>
    </div>
  );
}

function SectionCard({ card }: { card: RefreshSectionCard }) {
  const pct = card.rows > 0 ? Math.round((card.mapped / card.rows) * 100) : 0;
  const showSeed = !card.hasImports;
  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div>
          <div className="mono" style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em",
            color: "var(--ink-3)", textTransform: "uppercase",
          }}>{card.section}</div>
          <div className="display" style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{card.name}</div>
        </div>
        <span className="mono" style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
          padding: "2px 7px", border: "1px solid var(--rule)",
          background: "var(--paper-2)", color: "var(--ink-2)",
        }}>{showSeed ? "Seed" : card.conf}</span>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ height: 6, background: "var(--rule)", overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: showSeed ? "100%" : `${pct}%`,
            background: showSeed
              ? "var(--ink-4)"
              : (card.review > 10 ? "var(--warn)" : "var(--pos)"),
          }}/>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 14 }}>
        {showSeed
          ? [
              { label: "In model",   value: card.seedCount.toLocaleString(), color: "var(--ink)" },
              { label: "Imported",   value: "—",                              color: "var(--ink-4)" },
              { label: "Need review", value: "—",                             color: "var(--ink-4)" },
            ].map((stat) => <Stat key={stat.label} {...stat}/>)
          : [
              { label: "Imported",    value: card.rows.toLocaleString(),   color: "var(--ink)" },
              { label: "Auto-mapped", value: card.mapped.toLocaleString(), color: "var(--pos)" },
              { label: "Need review", value: String(card.review),          color: card.review > 10 ? "var(--warn)" : "var(--ink)" },
            ].map((stat) => <Stat key={stat.label} {...stat}/>)}
      </div>

      <div style={{
        marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--rule)",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
      }}>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
          {showSeed
            ? "Never refreshed · using seed baseline"
            : `Last refreshed ${formatStamp(card.lastImport!)} · ${card.importCount} import${card.importCount === 1 ? "" : "s"}`}
        </span>
        <Btn kind="ghost" href={card.href}>
          <Icon name="arrow-up-to-line" size={11}/> {showSeed ? "Import" : "Re-import"}
        </Btn>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className="mono" style={{
        fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>{label}</div>
      <div className="num" style={{ fontSize: 14, fontWeight: 500, marginTop: 4, color }}>
        {value}
      </div>
    </div>
  );
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
