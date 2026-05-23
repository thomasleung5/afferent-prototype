/** Dashed-outline "SHARED" pill used to mark Shared CDS rows in the
 *  Operating tables (and any other surface that flags a row as
 *  shared-services rather than department-owned). */
export function SharedChip() {
  return (
    <span className="mono" style={{
      display: "inline-block",
      padding: "2px 6px",
      border: "1px dashed var(--rule-strong)",
      background: "var(--paper-2)",
      fontSize: "var(--t-l4)", fontWeight: 600, letterSpacing: "0.04em",
      color: "var(--ink-2)",
    }}>SHARED</span>
  );
}
