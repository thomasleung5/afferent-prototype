import { SectionLabel } from "@/components/ui";
import { useBuildState, type Domain } from "@/lib/store";

const DOMAIN_LABEL: Record<Domain, string> = {
  positions: "Direct Labor",
  operating: "Operating",
  services: "Services",
  fees: "Fee Schedule",
  workload: "Workload",
  cap: "Overhead Cost Allocation",
};

function formatImportedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

/** Recent imports feed on the Home screen. Reads the store's `imports` log
 *  (appended by each merge*) and renders newest-first. */
export function AuditTrail() {
  const { imports } = useBuildState();
  // Each log entry's `id` is Date.now() at write time, so descending id
  // matches reverse-chronological order without re-parsing `at`.
  const rows = [...imports].sort((a, b) => b.id - a.id);

  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule)",
      padding: 20,
    }}>
      <SectionLabel right={`${rows.length} import${rows.length === 1 ? "" : "s"}`}>
        Recent imports
      </SectionLabel>

      {rows.length === 0 ? (
        <div style={{
          padding: "16px 0 4px",
          fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55,
        }}>
          Imports will appear here after you upload source files (PDFs or
          pasted LLM JSON) from any Build page.
        </div>
      ) : (
        <>
          {rows.map((entry, i) => {
            const r = entry.result;
            return (
              <div key={entry.id} style={{
                display: "grid",
                gridTemplateColumns: "150px 130px minmax(220px, 1fr) auto",
                gap: 12,
                padding: "10px 0",
                borderBottom: i < rows.length - 1 ? "1px dashed var(--rule)" : "none",
                alignItems: "baseline",
              }}>
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  {formatImportedAt(entry.at)}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                  {DOMAIN_LABEL[entry.domain] ?? entry.domain}
                </div>
                <div
                  title={r.fileName}
                  style={{
                    fontSize: 12.5, color: "var(--ink-2)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    minWidth: 0,
                  }}
                >
                  {r.fileName}
                </div>
                <div className="mono num" style={{
                  fontSize: 11, fontWeight: 600,
                  color: "var(--ink-2)", textAlign: "right",
                  padding: "2px 6px",
                  background: "var(--paper-2)", border: "1px solid var(--rule)",
                  letterSpacing: "0.02em",
                }}>
                  {r.mapped}/{r.lowConfidence}/{r.unmapped}/{r.duplicates}
                </div>
              </div>
            );
          })}
          <div className="mono" style={{
            marginTop: 10, fontSize: 9.5, fontWeight: 600,
            color: "var(--ink-3)", letterSpacing: "0.1em", textTransform: "uppercase",
          }}>
            mapped / for review / unmapped / duplicates
          </div>
        </>
      )}
    </div>
  );
}
