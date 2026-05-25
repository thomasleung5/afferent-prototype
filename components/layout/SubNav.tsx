import { Link, useRouterState } from "@tanstack/react-router";

export interface SubNavItem {
  href: string;
  label: string;
}

interface Props {
  items: SubNavItem[];
}

export function SubNav({ items }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div style={{
      borderBottom: "1px solid var(--rule)",
      background: "var(--paper)",
      padding: "0 28px",
      display: "flex", gap: 0, alignItems: "stretch",
      overflowX: "auto",
    }}>
      {items.map((it, i) => {
        const on = pathname === it.href;
        return (
          <Link key={it.href} to={it.href} style={{
            padding: "10px 14px",
            display: "inline-flex", alignItems: "center",
            fontSize: 12, fontWeight: 500, whiteSpace: "nowrap",
            color: on ? "var(--ink)" : "var(--ink-3)",
            background: on ? "var(--paper-2)" : "transparent",
            borderRight: i < items.length - 1 ? "1px solid var(--rule)" : "none",
            borderBottom: on ? "2px solid var(--accent)" : "2px solid transparent",
            marginBottom: -1,
            textDecoration: "none",
          }}>
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
