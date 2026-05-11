import type { ReactNode } from "react";

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

export interface FilterGroup {
  id: string;
  label?: string;
  options: FilterOption[];
  value: string;
  onChange: (v: string) => void;
}

interface Props {
  title?: string;
  filters?: FilterGroup[];
  shownCount?: number;
  totalCount?: number;
  extraRight?: ReactNode;
}

function FilterChips({ label, options, value, onChange }: FilterGroup) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {label && (
        <span className="mono" style={{
          fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
          color: "var(--ink-3)", textTransform: "uppercase", marginRight: 2,
        }}>{label}</span>
      )}
      <div style={{ display: "inline-flex", border: "1px solid var(--rule)", background: "var(--paper)" }}>
        {options.map((o, i) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              style={{
                padding: "4px 10px",
                fontSize: 11.5, fontWeight: active ? 600 : 500,
                color: active ? "var(--paper)" : "var(--ink-2)",
                background: active ? "var(--ink)" : "transparent",
                borderLeft: i > 0 ? "1px solid var(--rule)" : "none",
                cursor: "pointer", whiteSpace: "nowrap",
                fontFeatureSettings: '"tnum" 1',
              }}
            >
              {o.label}
              {o.count != null && (
                <span style={{ marginLeft: 6, opacity: active ? 0.7 : 0.55, fontSize: 10.5, fontWeight: 500 }}>
                  {o.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TableToolbar({ title, filters, shownCount, totalCount, extraRight }: Props) {
  return (
    <div style={{
      display: "flex", alignItems: "center", flexWrap: "wrap",
      gap: 14, padding: "12px 16px",
      background: "var(--paper)",
      borderBottom: "1px solid var(--rule)",
    }}>
      {title && (
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.005em", marginRight: 6 }}>
          {title}
        </div>
      )}
      {filters?.map((f) => (
        <FilterChips key={f.id} {...f}/>
      ))}
      <div style={{ flex: 1 }}/>
      {extraRight}
      {shownCount != null && totalCount != null && shownCount !== totalCount && (
        <div className="num" style={{ fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
          {shownCount} of {totalCount}
        </div>
      )}
    </div>
  );
}
