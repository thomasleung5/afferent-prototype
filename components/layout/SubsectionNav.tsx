import { Link, useRouterState } from "@tanstack/react-router";

export interface SubsectionNavItem {
  href: string;
  label: string;
  /** Short caption rendered under the label. Optional. */
  hint?: string;
  /** Additional path prefixes that also count as active. Useful when one
   *  card stands in for nested routes. */
  matchPrefixes?: string[];
}

interface Props {
  items: SubsectionNavItem[];
}

/** Secondary card-style navigation. Sits between the primary SubNav at
 *  the top of the page and a tertiary step-nav (e.g. CapStepNav) inside
 *  a page. Each card is a Link; the active card is inverted (ink bg,
 *  paper text) so the current location is obvious. Slightly tighter than
 *  CapStepNav and inset on paper-2 so it reads as subordinate to the
 *  primary nav above. */
export function SubsectionNav({ items }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (it: SubsectionNavItem) => {
    if (it.matchPrefixes?.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
    return pathname === it.href || pathname.startsWith(it.href + "/");
  };

  return (
    <div style={{
      display: "flex", alignItems: "stretch",
      border: "1px solid var(--rule)",
      background: "var(--paper-2)",
    }}>
      {items.map((it, i) => {
        const active = isActive(it);
        return (
          <Link
            key={it.href}
            to={it.href}
            style={{
              flex: 1,
              display: "flex", alignItems: "flex-start",
              padding: "11px 14px",
              background: active ? "var(--ink)" : "transparent",
              color: active ? "var(--paper)" : "var(--ink-3)",
              borderRight: i < items.length - 1 ? "1px solid var(--rule)" : "none",
              textDecoration: "none",
              fontFamily: "var(--ff-ui)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 12, fontWeight: 600, marginBottom: it.hint ? 3 : 0,
                color: active ? "var(--paper)" : "var(--ink-2)",
              }}>
                {it.label}
              </div>
              {it.hint && (
                <div style={{
                  fontSize: 10, lineHeight: 1.35,
                  color: active ? "rgba(255,255,255,0.65)" : "var(--ink-3)",
                }}>{it.hint}</div>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
