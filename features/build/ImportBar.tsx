
import { SectionLabel, StatusPill } from "@/components/ui";
import { useBuildState } from "@/lib/store";
import type { Domain } from "@/lib/store";

const DOMAIN_LABEL: Record<Domain, string> = {
  positions: "Direct Labor",
  operating: "Operating",
  services:  "Services",
  fees:      "Fee Schedule",
  workload:  "Workload",
  cap:       "Cost Allocation",
};

/** Imports history — shown on the Overview screen. Lists every parsed file
 *  with its mapped / low-confidence / unmapped counts, grouped by domain. */
export function ImportBar() {
  const { imports } = useBuildState();
  const recent = [...imports].reverse().slice(0, 8);

  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule)", padding: 22,
    }}>
      <SectionLabel right="From the DropZone on each Build tab">
        Imports history
      </SectionLabel>

      {recent.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", padding: "12px 0" }}>
          No files imported yet. Drag a fee schedule, salary table, budget book,
          or workload export into any Build tab to populate the model.
        </div>
      ) : (
        <div style={{ background: "var(--paper-2)", border: "1px solid var(--rule)" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "140px minmax(220px, 1.6fr) 90px 90px 110px 100px",
            gap: 14, padding: "8px 14px",
            borderBottom: "1px solid var(--rule-strong)",
            background: "var(--paper)",
            fontFamily: "var(--ff-mono)", fontSize: 10, fontWeight: 600,
            letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase",
          }}>
            <div>Domain</div>
            <div>File</div>
            <div style={{ textAlign: "right" }}>Rows</div>
            <div style={{ textAlign: "right" }}>Mapped</div>
            <div style={{ textAlign: "right" }}>Status</div>
            <div style={{ textAlign: "right" }}>When</div>
          </div>
          {recent.map((imp, i) => {
            const reviewN = imp.result.unmapped + imp.result.lowConfidence;
            return (
              <div key={imp.id} style={{
                display: "grid",
                gridTemplateColumns: "140px minmax(220px, 1.6fr) 90px 90px 110px 100px",
                gap: 14, padding: "8px 14px",
                borderBottom: i < recent.length - 1 ? "1px solid var(--rule)" : "none",
                fontSize: 12, alignItems: "center",
              }}>
                <span className="mono" style={{
                  fontSize: 10.5, color: "var(--ink-2)", letterSpacing: "0.06em",
                }}>{DOMAIN_LABEL[imp.domain]}</span>
                <span style={{ color: "var(--ink-2)" }}>
                  {imp.result.fileName}
                  {imp.result.detected && (
                    <span style={{ color: "var(--ink-3)", marginLeft: 6, fontSize: 11 }}>
                      · {imp.result.detected}
                    </span>
                  )}
                </span>
                <span className="num" style={{ textAlign: "right", color: "var(--ink-2)" }}>
                  {imp.result.rows}
                </span>
                <span className="num" style={{ textAlign: "right", color: "var(--pos)" }}>
                  {imp.result.mapped}
                </span>
                <span style={{ display: "flex", justifyContent: "flex-end" }}>
                  {reviewN > 0
                    ? <StatusPill kind="review">{reviewN} review</StatusPill>
                    : <StatusPill kind="ok">Imported</StatusPill>}
                </span>
                <span className="mono" style={{
                  textAlign: "right", fontSize: 11, color: "var(--ink-3)",
                }}>
                  {new Date(imp.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
