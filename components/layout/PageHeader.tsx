import type { ReactNode } from "react";

interface Props {
  eyebrow?: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, subtitle, actions }: Props) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      gap: 24, paddingBottom: 12,
    }}>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        {eyebrow && (
          <div className="mono" style={{
            marginBottom: 8,
            fontSize: 10.5, fontWeight: 600, letterSpacing: "0.14em",
            textTransform: "uppercase", color: "var(--ink-3)",
          }}>{eyebrow}</div>
        )}
        <div className="display" style={{
          fontSize: 28, fontWeight: 600, letterSpacing: "-0.018em", lineHeight: 1.15,
        }}>{title}</div>
        {subtitle && (
          <div style={{ marginTop: 10, fontSize: 14, color: "var(--ink-3)", lineHeight: 1.5, maxWidth: 720 }}>
            {subtitle}
          </div>
        )}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}
