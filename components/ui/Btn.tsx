import { Link } from "@tanstack/react-router";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

type BtnKind = "ghost" | "primary" | "subtle";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style"> {
  kind?: BtnKind;
  style?: CSSProperties;
  children: ReactNode;
  /** When provided, the button renders as a router `<Link>` instead of a `<button>`. */
  href?: string;
}

const base: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 30,
  padding: "0 12px",
  fontSize: "var(--t-l7)",
  fontWeight: 500,
  border: "1px solid var(--rule-strong)",
  background: "var(--paper)",
  color: "var(--ink)",
  whiteSpace: "nowrap",
  textDecoration: "none",
  transition: "background 120ms, border-color 120ms",
};

const variants: Record<BtnKind, CSSProperties> = {
  ghost: base,
  primary: { ...base, background: "var(--accent)", color: "white", borderColor: "var(--accent)" },
  subtle: { ...base, background: "transparent", borderColor: "transparent", color: "var(--ink-2)" },
};

export function Btn({ kind = "ghost", style, disabled, href, children, ...rest }: Props) {
  const merged: CSSProperties = {
    ...variants[kind],
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    ...style,
  };

  if (href && !disabled) {
    return (
      <Link to={href} style={merged}>
        {children}
      </Link>
    );
  }

  return (
    <button {...rest} disabled={disabled} style={merged}>
      {children}
    </button>
  );
}
