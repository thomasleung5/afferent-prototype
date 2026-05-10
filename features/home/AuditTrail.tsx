import { ACTIVITY } from "@/lib/data/activity";
import { SectionLabel } from "@/components/ui";

/** Read-only audit-trail card on the Home screen. */
export function AuditTrail() {
  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule)",
      padding: 20,
    }}>
      <SectionLabel>Audit trail</SectionLabel>
      {ACTIVITY.map((a, i) => (
        <div key={i} style={{
          display: "grid", gridTemplateColumns: "100px 1fr 90px", gap: 10,
          padding: "10px 0",
          borderBottom: i < ACTIVITY.length - 1 ? "1px dashed var(--rule)" : "none",
          alignItems: "baseline",
        }}>
          <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{a.date}</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.45 }}>{a.text}</div>
          <div style={{ textAlign: "right" }}>
            <span className="mono" style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
              color: "var(--ink-2)", textTransform: "uppercase",
              padding: "2px 6px",
              background: "var(--paper-2)", border: "1px solid var(--rule)",
            }}>{a.src}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
