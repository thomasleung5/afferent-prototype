import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ModelSettingsMenu } from "./ModelSettingsMenu";
import { StaleStudyBanner } from "./StaleStudyBanner";
import { StudyMenu } from "@/features/studies/StudyMenu";
import { useAuth } from "@/lib/auth/AuthContext";

interface NavItem {
  href: string;
  label: string;
  /** A href is "active" when the pathname starts with this prefix (defaults to href). */
  prefix?: string;
}

const NAV: NavItem[] = [
  { href: "/",           label: "Home" },
  { href: "/opportunity", label: "Revenue Opportunity" },
  { href: "/build/services", label: "Build Model",    prefix: "/build" },
  { href: "/source-data", label: "Source Data" },
  { href: "/monitoring", label: "Revenue Monitoring", prefix: "/monitoring" },
  { href: "/annual",     label: "Annual Update",      prefix: "/annual" },
];

export function TopBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Print/export routes get a clean shell — no app chrome.
  if (pathname.startsWith("/export")) return null;
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
        <StudyMenu/>

        <div style={{ flex: 1 }}/>
        <AuthChip/>
      </div>

      <StaleStudyBanner/>
      <SubNav pathname={pathname}/>
    </div>
  );
}

function SubNav({ pathname }: { pathname: string }) {
  const isActive = (n: NavItem) => {
    const base = n.prefix ?? n.href;
    if (base === "/") return pathname === "/";
    return pathname === base || pathname.startsWith(base + "/");
  };
  return (
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
  );
}

/** Right-side chip — shows initials when signed in. Clicking opens a
 *  small dropdown anchored under the chip with the account email and
 *  a Sign out action. Falls back to the legacy "MR" stub (static, no
 *  dropdown) when Supabase isn't configured (local dev). */
function AuthChip() {
  const { session, signOut, configured } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Outside-click + ESC close — mirrors StudyMenu / ModelSettingsMenu
  // so the dismissal semantics across every TopBar popover stay
  // identical.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!configured) {
    return (
      <div className="mono" style={chipBaseStyle}>MR</div>
    );
  }
  const email = session?.user.email ?? "";
  const initials = initialsFromEmail(email);
  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="mono"
        data-testid="auth-chip-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={email ? `Account menu for ${email}` : "Account menu"}
        title={email || undefined}
        style={{
          ...chipBaseStyle,
          cursor: "pointer",
          color: "var(--ink)",
          padding: 0,
        }}
      >
        {initials || "?"}
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 30,
            width: 240,
            background: "var(--paper)",
            border: "1px solid var(--rule-strong)",
            boxShadow: "0 10px 24px rgba(29,34,54,0.10)",
          }}
        >
          {email && (
            <div style={{
              padding: "8px 14px 6px",
              borderBottom: "1px solid var(--rule)",
              background: "var(--paper-2)",
            }}>
              <div className="mono" style={{
                fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.12em",
                color: "var(--ink-3)", textTransform: "uppercase",
              }}>Signed in</div>
              <div style={{
                fontSize: "var(--t-l7)", color: "var(--ink-2)", marginTop: 2,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }} title={email}>{email}</div>
            </div>
          )}
          <button
            type="button"
            data-testid="auth-chip-signout"
            onClick={() => { setOpen(false); void signOut(); }}
            style={{
              display: "block", width: "100%", textAlign: "left",
              padding: "10px 14px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "var(--fs-ui)", color: "var(--ink)", fontWeight: 500,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--paper-2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

const chipBaseStyle: React.CSSProperties = {
  width: 28, height: 28,
  border: "1px solid var(--rule-strong)",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: "var(--t-l4)", fontWeight: 600,
  background: "var(--paper-2)",
};

function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
