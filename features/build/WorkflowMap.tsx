import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { SectionLabel } from "@/components/ui";

function useIsActive(href: string) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return pathname === href || pathname.startsWith(href + "/");
}

const ACTIVE_BG = "#1d2236";
const ACTIVE_BORDER = "#1d2236";
const HOVER_BORDER = "#1d2236";
const HOVER_SHADOW = "0 2px 8px rgba(29, 34, 54, 0.10)";

interface CardColors {
  bg: string;
  border?: string;
  title: string;
  secondary: string;
}

interface Node {
  href: string;
  label: string;
  desc: string;
  metric: string;
  state?: "Locked" | "Open";
  colors?: CardColors;
}

const INPUTS: Node[] = [
  { href: "/build/services",  label: "Services",        desc: "hours × role mix",                       metric: "37 services",          state: "Locked" },
  { href: "/build/salary",    label: "Direct Labor",    desc: "(salary + benefits) ÷ productive hours", metric: "73 positions",         state: "Locked" },
  { href: "/build/operating", label: "Operating",       desc: "non-labor · per dept",                   metric: "214 expense lines",    state: "Locked" },
  { href: "/build/cap",       label: "Cost Allocation", desc: "indirect → direct",                      metric: "14 indirect pools",    state: "Locked" },
  { href: "/build/workload",  label: "Workload",        desc: "annual volume",                          metric: "1,246 activity records", state: "Locked" },
];

const WORKFLOW: Node[] = [
  {
    href: "/build/costs", label: "Cost of Service",
    desc: "hours × FBHR × volume", metric: "Deterministic computation", state: "Locked",
    colors: { bg: "#1d2236", border: "#3a3f53", title: "#ffffff", secondary: "#b7bcc8" },
  },
  {
    href: "/build/policy", label: "Recovery Policy",
    desc: "target % per service", metric: "72% target recovery", state: "Open",
    colors: { bg: "#ebe8df", border: "#1d2236", title: "#1d2236", secondary: "#6f6e74" },
  },
  {
    href: "/build/feestudy", label: "Fee Schedule",
    desc: "cost × target", metric: "+$420K annual impact", state: "Open",
    colors: { bg: "#3a3f53", border: "#3a3f53", title: "#ffffff", secondary: "#c5cad6" },
  },
];

function StatusPill({ state }: { state: "Locked" | "Open" }) {
  const s = state === "Locked"
    ? { bg: "#ebeadb", fg: "#6b7355" }
    : { bg: "#f1ebde", fg: "#9a7f55" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
      fontSize: 10, fontWeight: 700,
      padding: "1px 6px",
      background: s.bg, color: s.fg,
      border: `1px solid ${s.fg}`,
      borderRadius: 999,
      whiteSpace: "nowrap",
      lineHeight: 1.4,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.fg }}/>
      {state}
    </span>
  );
}

function InputCard({ n }: { n: Node }) {
  const [hovered, setHovered] = useState(false);
  const active = useIsActive(n.href);
  return (
    <Link
      to={n.href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", flexDirection: "column", gap: 8,
        padding: 14,
        minHeight: 168,
        background: active ? ACTIVE_BG : "var(--paper)",
        border: `1px solid ${active ? ACTIVE_BORDER : hovered ? HOVER_BORDER : "var(--rule-strong)"}`,
        boxShadow: hovered && !active ? HOVER_SHADOW : "none",
        transition: "border-color 120ms, box-shadow 120ms",
        textDecoration: "none",
        color: "#1d2236",
      }}>
      {n.state && (
        <div style={{ alignSelf: "flex-end" }}>
          <StatusPill state={n.state}/>
        </div>
      )}
      <div style={{
        marginTop: 2,
        fontFamily: '"Inter Tight", system-ui, sans-serif',
        fontSize: 17, fontWeight: 600,
        lineHeight: 1.15, letterSpacing: "-0.015em",
        color: "#1d2236",
      }}>{n.label}</div>
      <div style={{
        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
        fontSize: 10.5,
        lineHeight: 1.45, letterSpacing: "0.02em",
        color: "#1d2236", opacity: 0.62,
      }}>{n.desc}</div>
      <div style={{
        marginTop: "auto", paddingTop: 8,
        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
        fontSize: 10, fontWeight: 500,
        lineHeight: 1.3, letterSpacing: "0.04em",
        color: "#1d2236", opacity: 0.42,
      }}>{n.metric}</div>
    </Link>
  );
}

function WorkflowCard({ n }: { n: Node }) {
  const [hovered, setHovered] = useState(false);
  const active = useIsActive(n.href);
  const c = n.colors;
  const titleColor = c?.title ?? "#1d2236";
  const baseBg = c?.bg ?? "#ffffff";
  const baseBorder = c?.border ?? c?.bg ?? "#d8d3c7";
  return (
    <Link
      to={n.href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", flexDirection: "column", gap: 8,
        padding: 14,
        minHeight: 184,
        border: `1px solid ${active ? ACTIVE_BORDER : hovered ? HOVER_BORDER : baseBorder}`,
        background: active ? ACTIVE_BG : baseBg,
        boxShadow: hovered && !active ? HOVER_SHADOW : "none",
        transition: "border-color 120ms, box-shadow 120ms",
        textDecoration: "none",
        color: titleColor,
      }}>
      {n.state && (
        <div style={{ alignSelf: "flex-end" }}>
          <StatusPill state={n.state}/>
        </div>
      )}
      <div style={{
        marginTop: 2,
        fontFamily: '"Inter Tight", system-ui, sans-serif',
        fontSize: 20, fontWeight: 600,
        lineHeight: 1.15, letterSpacing: "-0.015em",
        color: titleColor,
      }}>{n.label}</div>
      <div style={{
        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
        fontSize: 10.5,
        lineHeight: 1.45, letterSpacing: "0.02em",
        color: titleColor, opacity: 0.62,
      }}>{n.desc}</div>
      <div style={{
        marginTop: "auto", paddingTop: 8,
        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
        fontSize: 10, fontWeight: 500,
        lineHeight: 1.3, letterSpacing: "0.04em",
        color: titleColor, opacity: 0.42,
      }}>{n.metric}</div>
    </Link>
  );
}

function FlowArrow() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="22" height="10" viewBox="0 0 22 10" fill="none" aria-hidden="true">
        <path d="M0 5 H20" stroke="#1d2236" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M16 1 L20 5 L16 9" stroke="#1d2236" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    </div>
  );
}

export function WorkflowMap() {
  return (
    <div>
      <SectionLabel>Inputs</SectionLabel>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10,
        marginBottom: 16,
      }}>
        {INPUTS.map((n) => <InputCard key={n.href} n={n}/>)}
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 36px 1fr 36px 1fr",
        columnGap: 12,
      }}>
        <SectionLabel>Analysis</SectionLabel>
        <div/>
        <SectionLabel>Policy</SectionLabel>
        <div/>
        <SectionLabel>Output</SectionLabel>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 36px 1fr 36px 1fr",
        gap: 12,
        alignItems: "center",
      }}>
        <WorkflowCard n={WORKFLOW[0]}/>
        <FlowArrow/>
        <WorkflowCard n={WORKFLOW[1]}/>
        <FlowArrow/>
        <WorkflowCard n={WORKFLOW[2]}/>
      </div>
    </div>
  );
}
