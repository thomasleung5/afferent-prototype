import { Link } from "@tanstack/react-router";
import type { CSSProperties, MouseEvent } from "react";

export interface InlineLink {
  to: string;
  search?: Record<string, unknown>;
  text: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}

const LINK_STYLE: CSSProperties = {
  fontSize: "var(--t-l8)",
  color: "var(--accent)",
  textDecoration: "underline",
  textUnderlineOffset: 3,
};

/** Horizontal row of accent-underlined drilldown links separated by
 *  `·` dots. Used inside drilldowns to surface cross-page audit links
 *  (Service / Cost of Service / Fee Schedule / Fee Benchmarks /
 *  Functional Allocation). */
export function InlineLinkRow({
  links, style,
}: {
  links: InlineLink[];
  style?: CSSProperties;
}) {
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", alignItems: "baseline",
      gap: 14, marginTop: 12, ...style,
    }}>
      {links.map((l, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "baseline", gap: 14 }}>
          {i > 0 && <span aria-hidden style={{ color: "var(--rule-strong)" }}>·</span>}
          <Link
            to={l.to}
            search={l.search}
            onClick={l.onClick}
            style={LINK_STYLE}
          >{l.text}</Link>
        </span>
      ))}
    </div>
  );
}
