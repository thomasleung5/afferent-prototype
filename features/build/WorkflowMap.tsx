import { Link } from "@tanstack/react-router";
import { SectionLabel } from "@/components/ui";

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
  { href: "/build/services",  label: "Services",        desc: "hours × role mix",                       metric: "37 services" },
  { href: "/build/salary",    label: "Direct Labor",    desc: "(salary + benefits) ÷ productive hours", metric: "73 positions" },
  { href: "/build/operating", label: "Operating",       desc: "non-labor · per dept",                   metric: "214 expense lines" },
  { href: "/build/cap",       label: "Cost Allocation", desc: "indirect → direct",                      metric: "14 indirect pools" },
  { href: "/build/workload",  label: "Workload",        desc: "annual volume",                          metric: "1,246 activity records" },
];

const WORKFLOW: Node[] = [
  {
    href: "/build/costs", label: "Cost of Service",
    desc: "hours × FBHR × volume", metric: "Deterministic computation", state: "Locked",
    colors: { bg: "#1d2236", title: "#ffffff", secondary: "#b7bcc8" },
  },
  {
    href: "/build/policy", label: "Recovery Policy",
    desc: "target % per service", metric: "72% target recovery", state: "Open",
    colors: { bg: "#e8edf7", border: "#c8d4ea", title: "#1d2236", secondary: "#6f6e74" },
  },
  {
    href: "/build/feestudy", label: "Fee Schedule",
    desc: "cost × target", metric: "+$420K annual impact", state: "Open",
    colors: { bg: "#2f3448", title: "#ffffff", secondary: "#c5cad6" },
  },
];

function StatusPill({ state }: { state: "Locked" | "Open" }) {
  const s = state === "Locked"
    ? { bg: "#f2f3f5", fg: "#6b7280" }
    : { bg: "#fef3c7", fg: "#92400e" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
      fontSize: 10, fontWeight: 700,
      padding: "1px 6px",
      background: s.bg, color: s.fg,
      borderRadius: 999,
      whiteSpace: "nowrap",
      lineHeight: 1.4,
    }}>
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: s.fg }}/>
      {state}
    </span>
  );
}

function NodeCard({ n, kind }: { n: Node; kind: "input" | "workflow" }) {
  const c = n.colors;
  const titleColor = c?.title ?? "#1d2236";
  const secondaryColor = c?.secondary ?? "#6f6e74";
  return (
    <Link to={n.href} style={{
      display: "flex", flexDirection: "column", gap: 10,
      padding: kind === "input" ? 14 : 16,
      minHeight: kind === "input" ? 168 : 184,
      border: `1px solid ${c?.border ?? c?.bg ?? "#d8d3c7"}`,
      background: c?.bg ?? "#ffffff",
      textDecoration: "none",
      color: titleColor,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{
          flex: 1,
          fontFamily: '"Inter Tight", system-ui, sans-serif',
          fontSize: 13.5, fontWeight: 600, color: titleColor,
        }}>{n.label}</div>
        {n.state && <StatusPill state={n.state}/>}
      </div>
      <div style={{
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        fontSize: 12.5, fontWeight: 400, color: secondaryColor, lineHeight: 1.5,
      }}>{n.desc}</div>
      <div style={{
        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
        fontSize: 11, fontWeight: 400, color: secondaryColor,
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
      <SectionLabel>Build model architecture</SectionLabel>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10,
        marginBottom: 16,
      }}>
        {INPUTS.map((n) => <NodeCard key={n.href} n={n} kind="input"/>)}
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 36px 1fr 36px 1fr",
        gap: 12,
        alignItems: "center",
      }}>
        <NodeCard n={WORKFLOW[0]} kind="workflow"/>
        <FlowArrow/>
        <NodeCard n={WORKFLOW[1]} kind="workflow"/>
        <FlowArrow/>
        <NodeCard n={WORKFLOW[2]} kind="workflow"/>
      </div>
    </div>
  );
}
