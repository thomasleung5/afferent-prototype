
import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";

interface Props {
  open: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  width?: number;
  children: ReactNode;
}

/** Slide-out detail drawer used for row drilldowns across the Build screens.
 *  Anchors right, dims the page, closes on backdrop click or ESC. */
export function Drawer({
  open, onClose, eyebrow, title, subtitle,
  width = 520, children,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 80,
        background: "rgba(29,34,54,0.32)",
        display: "flex", justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width, maxWidth: "94vw", height: "100%",
          background: "var(--paper)",
          borderLeft: "1px solid var(--rule-strong)",
          boxShadow: "-12px 0 32px rgba(0,0,0,0.10)",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          padding: "16px 22px",
          borderBottom: "1px solid var(--rule)",
          background: "var(--paper-2)",
          display: "flex", alignItems: "flex-start", gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {eyebrow && (
              <div className="mono" style={{
                fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.14em",
                color: "var(--ink-3)", textTransform: "uppercase",
              }}>{eyebrow}</div>
            )}
            <div className="display" style={{
              fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em",
              marginTop: 3, color: "var(--ink)",
            }}>{title}</div>
            {subtitle && (
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                {subtitle}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close drawer"
            style={{
              width: 28, height: 28,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              border: "1px solid var(--rule)",
              background: "var(--paper)",
              color: "var(--ink-2)",
              cursor: "pointer",
            }}
          >
            <Icon name="close" size={13}/>
          </button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "20px 22px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
