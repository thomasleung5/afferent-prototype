import { SECTIONS, type SectionKey } from "@/lib/data/annual";

interface Props {
  value: SectionKey;
  onChange: (k: SectionKey) => void;
}

export function SectionPicker({ value, onChange }: Props) {
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 0,
      background: "var(--paper)", border: "1px solid var(--rule)",
    }}>
      {SECTIONS.map((s, i) => {
        const active = s.k === value;
        const hasReview = s.needsReview > 0;
        return (
          <button
            key={s.k}
            onClick={() => onChange(s.k)}
            style={{
              padding: "10px 14px",
              borderLeft: i > 0 ? "1px solid var(--rule)" : "none",
              borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1,
              fontSize: 12, fontWeight: 500,
              color: active ? "var(--ink)" : "var(--ink-3)",
              background: active ? "var(--paper-2)" : "transparent",
              cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
              whiteSpace: "nowrap",
            }}
          >
            {s.label}
            {hasReview && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "1px 5px",
                background: "var(--warn-tint)", color: "var(--warn)",
                borderRadius: 999, border: "1px solid var(--warn)",
              }}>
                {s.needsReview}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
