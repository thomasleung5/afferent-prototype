import type { CSSProperties, ReactNode } from "react";

interface Props {
  children: ReactNode;
  padding?: number | string;
  style?: CSSProperties;
}

/** Standard paper card: --paper background + --rule border. */
export function Card({ children, padding = 22, style }: Props) {
  return (
    <div style={{
      background: "var(--paper)",
      border: "1px solid var(--rule)",
      padding,
      ...style,
    }}>
      {children}
    </div>
  );
}
