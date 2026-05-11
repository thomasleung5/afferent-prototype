import type { ReactNode } from "react";

interface Props {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}

/** Section shell used by the Recovery Policy screen. Mirrors the legacy
 *  PolicySection: eyebrow, title, description, optional inline action, body. */
export function PolicySection({ eyebrow, title, description, action, children }: Props) {
  return (
    <section style={{
      display: "flex", flexDirection: "column", gap: 16,
      paddingTop: 8,
    }}>
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 16,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mono" style={{
            fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em",
            color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 6,
          }}>{eyebrow}</div>
          <div className="display" style={{
            fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ink)",
          }}>{title}</div>
          {description && (
            <div style={{
              fontSize: 13, color: "var(--ink-3)", lineHeight: 1.5, marginTop: 6,
              maxWidth: 720,
            }}>{description}</div>
          )}
        </div>
        {action && <div style={{ paddingTop: 8 }}>{action}</div>}
      </div>
      {children}
    </section>
  );
}
