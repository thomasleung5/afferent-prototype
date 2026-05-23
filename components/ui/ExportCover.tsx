import type { ReactNode } from "react";

interface ExportCoverField {
  label: string;
  value: ReactNode;
}

interface Props {
  /** Tenant name rendered as the eyebrow above the title. */
  city: string;
  /** Report title (e.g. "User Fee Study"). */
  title: string;
  /** One-line lead beneath the title. */
  subtitle: string;
  /** Label/value pairs rendered in the metadata grid. */
  fields: ExportCoverField[];
}

/** Cover block used at the top of every print-preview route. Consolidates
 *  per-report variants that had drifted in padding, title size, and grid
 *  spacing — every export now shares the same chrome. */
export function ExportCover({ city, title, subtitle, fields }: Props) {
  return (
    <section className="section section-break" style={{
      paddingTop: 80, paddingBottom: 48,
      borderBottom: "1px solid var(--rule)",
      marginBottom: 48,
    }}>
      <div className="eyebrow">{city}</div>
      <div className="title display" style={{ fontSize: 32, marginTop: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 14, color: "var(--ink-2)", marginTop: 14, lineHeight: 1.5 }}>
        {subtitle}
      </div>

      <div style={{
        marginTop: 48,
        display: "grid", gridTemplateColumns: "150px 1fr",
        gap: "8px 16px", fontSize: 12.5,
      }}>
        {fields.map((f) => (
          <FieldRow key={f.label} label={f.label} value={f.value}/>
        ))}
      </div>
    </section>
  );
}

function FieldRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <div className="mono" style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>{label}</div>
      <div style={{ color: "var(--ink-2)" }}>{value}</div>
    </>
  );
}
