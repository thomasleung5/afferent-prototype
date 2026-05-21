import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  switchJurisdiction, useActiveFiscalYear, useActiveJurisdiction,
} from "@/lib/active";
import { JURISDICTIONS } from "@/lib/data/jurisdictions";
import { useBuildState } from "@/lib/store";

interface NavItem {
  href: string;
  label: string;
  /** A href is "active" when the pathname starts with this prefix (defaults to href). */
  prefix?: string;
}

const NAV: NavItem[] = [
  { href: "/",           label: "Home" },
  { href: "/gap",        label: "Revenue Gap" },
  { href: "/build",      label: "Build Model",        prefix: "/build" },
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
        display: "flex", alignItems: "center", gap: 20,
        padding: "10px 28px", height: 52,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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

        <ActiveContext/>

        <div style={{ flex: 1 }}/>
        <div className="mono" style={{
          width: 28, height: 28,
          border: "1px solid var(--rule-strong)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10.5, fontWeight: 600,
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
              fontSize: 12.5, fontWeight: 500,
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

/** Active jurisdiction + fiscal year cluster.
 *
 *  Renders a plain label when only one jurisdiction has data (and only
 *  one fiscal year is selectable). Promotes to a small <select> the
 *  moment more options exist, so the same TopBar transparently grows
 *  into a multi-jurisdiction switcher when stub jurisdictions go live. */
function ActiveContext() {
  const jurisdiction = useActiveJurisdiction();
  const fiscalYear = useActiveFiscalYear();
  const { setActiveFiscalYear } = useBuildState();
  const selectable = useMemo(
    () => JURISDICTIONS.filter((j) => j.dataAvailable),
    [],
  );
  // Always make the *active* jurisdiction selectable even if its
  // dataAvailable flag is false (e.g. someone selected a stub) so the
  // dropdown can still show its current state.
  const jurisdictionOptions = useMemo(() => {
    if (selectable.some((j) => j.id === jurisdiction.id)) return selectable;
    return [...selectable, jurisdiction];
  }, [selectable, jurisdiction]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {jurisdictionOptions.length > 1 ? (
        <select
          value={jurisdiction.id}
          onChange={(e) => { void switchJurisdiction(e.target.value); }}
          style={selectStyle}
        >
          {jurisdictionOptions.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}{j.dataAvailable ? "" : " (demo)"}
            </option>
          ))}
        </select>
      ) : (
        <div style={{ fontSize: 12.5, fontWeight: 500 }}>{jurisdiction.name}</div>
      )}

      {jurisdiction.fiscalYears.length > 1 ? (
        <select
          value={fiscalYear}
          onChange={(e) => setActiveFiscalYear(e.target.value)}
          style={{ ...selectStyle, ...fiscalStyle }}
        >
          {jurisdiction.fiscalYears.map((fy) => (
            <option key={fy} value={fy}>{fy}</option>
          ))}
        </select>
      ) : (
        <span className="mono" style={{
          padding: "3px 7px",
          border: "1px solid var(--rule)",
          background: "var(--paper-2)",
          fontSize: 10.5,
          color: "var(--ink-3)",
        }}>{fiscalYear}</span>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  background: "var(--paper)",
  border: "1px solid var(--rule)",
  color: "var(--ink)",
  fontFamily: "inherit",
  fontSize: 12.5,
  fontWeight: 500,
  padding: "3px 22px 3px 8px",
  // Caret rendered via background image so we don't have to ship a new icon.
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 6' fill='none'><path d='M1 1 L4 5 L7 1' stroke='%236f6e74' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 7px center",
  backgroundSize: "8px 6px",
};

const fiscalStyle: React.CSSProperties = {
  fontFamily: "var(--ff-mono)",
  fontSize: 10.5,
  fontWeight: 400,
  color: "var(--ink-3)",
  background: "var(--paper-2)",
};
