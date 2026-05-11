import { Link } from "@tanstack/react-router";
import { Icon, SectionLabel } from "@/components/ui";
import { useBuildState } from "./BuildContext";

interface Node {
  href: string;
  label: string;
  desc: string;
  status: (s: ReturnType<typeof useBuildState>) => string;
  kind: "anchor" | "input" | "rollup" | "policy";
}

const NODES: Node[] = [
  { href: "/build/services",  label: "Services",        desc: "Catalog · hours per instance · role mix",     kind: "anchor", status: (s) => `${s.services.length} services` },
  { href: "/build/salary",    label: "Direct Labor",    desc: "Position roster → direct $/hr per dept",      kind: "input",  status: (s) => `${s.positions.length} positions` },
  { href: "/build/operating", label: "Operating",       desc: "Dept non-labor spend → operating $/hr",       kind: "input",  status: (s) => `${s.operating.filter((l) => l.include).length} of ${s.operating.length} included` },
  { href: "/build/cap",       label: "Cost Allocation", desc: "Citywide indirect → allocated overhead",      kind: "input",  status: (s) => `${Object.values(s.capAllocation).reduce((a, c) => a + c.allocated, 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} allocated` },
  { href: "/build/workload",  label: "Workload",        desc: "Annual volume per service",                   kind: "input",  status: (s) => `${s.workload.filter((w) => w.current != null).length} captured` },
  { href: "/build/costs",     label: "Cost of Service", desc: "Direct + Operating + CAP × hours × volume",   kind: "rollup", status: (s) => `FBHR PLAN $${Math.round(s.derived.fbhr.PLAN.fbhr)} · BLDG $${Math.round(s.derived.fbhr.BLDG.fbhr)} · ENG $${Math.round(s.derived.fbhr.ENG.fbhr)}` },
  { href: "/build/policy",    label: "Recovery Policy", desc: "Recovery targets · per-dept and per-fee",     kind: "policy", status: (s) => `${s.policyTargets.length} depts · ${s.policyExceptions.length} exception${s.policyExceptions.length === 1 ? "" : "s"}` },
  { href: "/build/feestudy",  label: "Fee Schedule",    desc: "Current fees vs full cost · recommended",     kind: "rollup", status: (s) => `${s.derived.comparisons.filter((c) => c.annualUplift > 0).length} under target` },
  { href: "/build/benchmark", label: "Fee Benchmark",   desc: "Adopted fees in 5 peer cities",               kind: "rollup", status: (s) => `${s.services.filter((sv) => sv.peer > 0).length} with peer data` },
];

const KIND_LABEL: Record<Node["kind"], string> = {
  anchor: "Anchor",
  input:  "Input",
  rollup: "Rollup",
  policy: "Policy",
};

const KIND_COLOR: Record<Node["kind"], string> = {
  anchor: "var(--accent)",
  input:  "var(--ink-2)",
  rollup: "var(--pos)",
  policy: "var(--warn)",
};

export function WorkflowMap() {
  const state = useBuildState();
  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule)", padding: 22,
    }}>
      <SectionLabel right="Inputs feed Cost of Service · Fee Schedule compares · Recovery Policy steers">
        Build model architecture
      </SectionLabel>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12,
      }}>
        {NODES.map((n) => (
          <Link key={n.href} to={n.href} style={{
            display: "flex", flexDirection: "column", gap: 8,
            padding: "16px 18px",
            border: "1px solid var(--rule)",
            background: "var(--paper-2)",
            textDecoration: "none",
            color: "var(--ink)",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span className="mono" style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: KIND_COLOR[n.kind],
              }}>{KIND_LABEL[n.kind]}</span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{n.label}</span>
              <span style={{ flex: 1 }}/>
              <span className="num mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{n.status(state)}</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.5 }}>{n.desc}</div>
            <div style={{
              marginTop: 4, display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 12, color: "var(--accent)",
            }}>
              Open <Icon name="arrow-right" size={11}/>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
