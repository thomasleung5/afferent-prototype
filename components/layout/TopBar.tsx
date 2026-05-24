import { Link, useRouterState } from "@tanstack/react-router";
import { ModelSettingsMenu } from "./ModelSettingsMenu";

interface NavItem {
  href: string;
  label: string;
  /** A href is "active" when the pathname starts with this prefix (defaults to href). */
  prefix?: string;
}

const NAV: NavItem[] = [
  { href: "/",           label: "Home" },
  { href: "/gap",        label: "Revenue Gap" },
  { href: "/build/services", label: "Build Model",    prefix: "/build" },
  { href: "/monitoring", label: "Revenue Monitoring", prefix: "/monitoring" },
  { href: "/annual",     label: "Annual Update",      prefix: "/annual" },
];

export function TopBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Print/export routes get a clean shell — no app chrome.
  if (pathname.startsWith("/export")) return null;
  const isActive = (n: NavItem) => {
    const base = n.prefix ?? n.href;
    if (base === "/") return pathname === "/";
    return pathname === base || pathname.startsWith(base + "/");
  };

  return (
    <div style={{
      borderBottom: "1px solid var(--rule)",
      background: "var(--paper)",
      position: "sticky", top: 0, zIndex: 10,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 22,
        padding: "10px 28px", height: 52,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
            <rect x="1" y="1" width="20" height="20" stroke="var(--ink)" strokeWidth="1.5"/>
            <path d="M6 15 L11 5 L16 15" stroke="var(--ink)" strokeWidth="1.5" fill="none"/>
            <path d="M8 11 L14 11" stroke="var(--ink)" strokeWidth="1.5"/>
          </svg>
          <div className="display" style={{
            fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em",
          }}>Afferent</div>
        </div>

        <div style={{ width: 1, height: 18, background: "var(--rule)" }}/>

        <ModelSettingsMenu/>

        <div style={{ flex: 1 }}/>
        <div className="mono" style={{
          width: 28, height: 28,
          border: "1px solid var(--rule-strong)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "var(--t-l4)", fontWeight: 600,
          background: "var(--paper-2)",
        }}>MR</div>
      </div>

      <div style={{
        borderTop: "1px solid var(--rule)",
        background: "var(--paper-2)",
        padding: "0 28px",
        display: "flex", gap: 0, height: 38, alignItems: "stretch",
      }}>
        {NAV.map((n) => {
          const on = isActive(n);
          return (
            <Link key={n.href} to={n.href} style={{
              padding: "0 14px",
              display: "inline-flex", alignItems: "center",
              fontSize: "var(--t-l7)", fontWeight: 500,
              color: on ? "var(--ink)" : "var(--ink-3)",
              borderBottom: on ? "2px solid var(--ink)" : "2px solid transparent",
              marginBottom: -1,
              whiteSpace: "nowrap",
              textDecoration: "none",
            }}>{n.label}</Link>
          );
        })}
      </div>

    </div>
  );
}

