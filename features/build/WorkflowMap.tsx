import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { SectionLabel } from "@/components/ui";
import { fmt } from "@/lib/format";
import { useBuildState } from "@/lib/store";

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
}

interface Node {
  href: string;
  label: string;
  desc: string;
  metric: string;
  colors?: CardColors;
}

// Workflow palette: dark navy → cream → dark gray, signalling the
// phase transition from cost analysis → policy decision → published
// output. Inputs row stays neutral so the workflow row reads as the
// key step in the page.
const COST_OF_SERVICE_COLORS: CardColors = {
  bg: "#1d2236", border: "#3a3f53", title: "#ffffff",
};
const RECOVERY_POLICY_COLORS: CardColors = {
  bg: "#ebe8df", border: "#1d2236", title: "#1d2236",
};
const FEE_SCHEDULE_COLORS: CardColors = {
  bg: "#3a3f53", border: "#3a3f53", title: "#ffffff",
};

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

function impactLabel(gap: number): string {
  if (Math.abs(gap) < 500) return "$0 annual impact";
  const sign = gap > 0 ? "+" : "−";
  return `${sign}${fmt.dollarsK(Math.abs(gap))} annual impact`;
}

function Card({ n, titleSize, minHeight }: { n: Node; titleSize: number; minHeight: number }) {
  const [hovered, setHovered] = useState(false);
  const active = useIsActive(n.href);
  const baseBg = n.colors?.bg ?? "var(--paper)";
  const baseBorder = n.colors?.border ?? n.colors?.bg ?? "var(--rule-strong)";
  const titleColor = n.colors?.title ?? "#1d2236";
  return (
    <Link
      to={n.href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", flexDirection: "column", gap: 8,
        padding: 14,
        minHeight,
        background: active ? ACTIVE_BG : baseBg,
        border: `1px solid ${active ? ACTIVE_BORDER : hovered ? HOVER_BORDER : baseBorder}`,
        boxShadow: hovered && !active ? HOVER_SHADOW : "none",
        transition: "border-color 120ms, box-shadow 120ms",
        textDecoration: "none",
        color: active ? "#ffffff" : titleColor,
      }}>
      <div style={{
        marginTop: 2,
        fontFamily: '"Inter Tight", system-ui, sans-serif',
        fontSize: titleSize, fontWeight: 600,
        lineHeight: 1.15, letterSpacing: "-0.015em",
      }}>{n.label}</div>
      <div style={{
        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
        fontSize: 10.5,
        lineHeight: 1.45, letterSpacing: "0.02em",
        opacity: 0.62,
      }}>{n.desc}</div>
      <div style={{
        marginTop: "auto", paddingTop: 8,
        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
        fontSize: 10, fontWeight: 500,
        lineHeight: 1.3, letterSpacing: "0.04em",
        opacity: 0.42,
      }}>{n.metric}</div>
    </Link>
  );
}

function FlowArrow() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="22" height="10" viewBox="0 0 22 10" fill="none" aria-hidden="true">
        <path d="M0 5 H20" stroke="#a8a6ab" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M16 1 L20 5 L16 9" stroke="#a8a6ab" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    </div>
  );
}

export function WorkflowMap() {
  const {
    services, positions, operating, capPools, workload, derived,
  } = useBuildState();

  // All metric strings come from live store state — no hardcoded counts.
  const inputs: Node[] = [
    {
      href: "/build/services", label: "Services",
      desc: "hours × role mix",
      metric: plural(services.length, "service", "services"),
    },
    {
      href: "/build/salary", label: "Direct Labor",
      desc: "(salary + benefits) ÷ productive hours",
      metric: plural(positions.length, "position", "positions"),
    },
    {
      href: "/build/operating", label: "Operating",
      desc: "non-labor · per dept",
      metric: plural(operating.length, "expense line", "expense lines"),
    },
    {
      href: "/build/cap", label: "Overhead Cost Allocation",
      desc: "indirect → direct",
      metric: plural(capPools.length, "cost pool", "cost pools"),
    },
    {
      href: "/build/workload", label: "Workload",
      desc: "annual volume",
      metric: plural(workload.length, "activity record", "activity records"),
    },
  ];

  const workflow: Node[] = [
    {
      href: "/build/costs", label: "Cost of Service",
      desc: "hours × FBHR × volume",
      metric: plural(derived.comparisons.length, "service costed", "services costed"),
      colors: COST_OF_SERVICE_COLORS,
    },
    {
      href: "/build/policy", label: "Recovery Policy",
      desc: "target % per service",
      metric: `${Math.round(derived.impact.overallPct)}% target recovery`,
      colors: RECOVERY_POLICY_COLORS,
    },
    {
      href: "/build/feestudy", label: "Fee Schedule",
      desc: "cost × target",
      metric: impactLabel(derived.impact.recoverableGap),
      colors: FEE_SCHEDULE_COLORS,
    },
  ];

  return (
    <div>
      <SectionLabel>Inputs</SectionLabel>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10,
        marginBottom: 16,
      }}>
        {inputs.map((n) => <Card key={n.href} n={n} titleSize={17} minHeight={168}/>)}
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
        <Card n={workflow[0]} titleSize={20} minHeight={184}/>
        <FlowArrow/>
        <Card n={workflow[1]} titleSize={20} minHeight={184}/>
        <FlowArrow/>
        <Card n={workflow[2]} titleSize={20} minHeight={184}/>
      </div>
    </div>
  );
}
