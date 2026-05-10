// system-diagram.jsx — shared "model as a system" framing components
//
// Used at the top of every Build Model node screen + Cost of Service.
// Replaces the old "Step N of 7" wizard framing with a graph view: each tab
// is a NODE that contributes to Cost of Service, not a step in a sequence.
//
// Components:
//   <SystemDiagram active={...} compact={false}>  ← always-visible header
//   <FactPolicyTag kind="fact" | "policy"/>       ← marks read-only vs editable
//   <NodeEyebrow node={...}/>                     ← replaces "Step N of 7"

const { useState: uSSD } = React;

// Node definitions — five inputs feed Cost of Service, which feeds the Fee Schedule.
// Order is logical (audit-readable), not sequential (must-do-first).
const SYS_NODES = [
  { id: "services",  short: "Services",  label: "Services",  role: "input",  desc: "Hours per instance, role mix" },
  { id: "salary",    short: "Direct Labor",    label: "Direct Labor",    role: "input",  desc: "Direct labor $/hr" },
  { id: "operating", short: "Operating", label: "Operating", role: "input",  desc: "Dept non-labor $/hr" },
  { id: "cap",       short: "Cost Allocation",       label: "Cost Allocation",       role: "input",  desc: "Citywide indirect, allocated" },
  { id: "workload",  short: "Workload",  label: "Workload",  role: "input",  desc: "Annual volume" },
  { id: "costs",     short: "Cost",      label: "Cost of Service", role: "computed", desc: "Hours × FBHR × volume" },
  { id: "policy",    short: "Policy",    label: "Recovery Policy", role: "policy", desc: "Recovery targets · subsidies · exceptions" },
  { id: "feestudy",  short: "Fee",       label: "Fee Schedule", role: "output", desc: "Policy-adjusted recommended fees" },
];

// Map subnav slug → node id
const NAV_TO_NODE = {
  "build-services":  "services",
  "build-salary":    "salary",
  "build-operating": "operating",
  "build-cap":       "cap",
  "build-workload":  "workload",
  "build-costs":     "costs",
  "build-feestudy":  "feestudy",
};

// =========================================================================
// SystemDiagram — three variants:
//   - default: full diagram with description + legend (Overview only)
//   - hero: full diagram, no legend (Fee Schedule)
//   - breadcrumb: single line, ~40px tall, no subtext (all other pages)
// =========================================================================
function SystemDiagram({ active, onJump, variant = "default" }) {
  if (variant === "breadcrumb") {
    return <SystemDiagramBreadcrumb active={active} onJump={onJump}/>;
  }
  const compact = false;
  const showLegend = variant === "default";
  const inputs   = SYS_NODES.filter(n => n.role === "input");
  const computed = SYS_NODES.find(n => n.role === "computed");
  const policy   = SYS_NODES.find(n => n.id === "policy");
  const fee      = SYS_NODES.find(n => n.id === "feestudy");

  const isActive = (id) => active === id;

  return (
    <div style={{
      paddingTop: 4, paddingBottom: 14,
    }}>
      {/* Header strip */}
      <div style={{
        display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12,
      }}>
        <div className="mono" style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>The model</div>
        <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.4 }}>
          Cost of Service is computed from{" "}
          <span style={{ color: "var(--ink-2)" }}>Services + Salary + Operating + CAP + Workload</span>.{" "}
          <span style={{ color: "var(--ink-3)" }}>Recovery Policy applies targets; Fee Schedule is the adopted result.</span>
        </div>
      </div>

      {/* Diagram row */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${inputs.length}, minmax(0, 1fr)) 14px minmax(0, 1.15fr) 14px minmax(0, 1.15fr) 14px minmax(0, 1fr)`,
        gap: 6, alignItems: "stretch",
      }}>
        {inputs.map(n => (
          <SysNodeChip key={n.id} node={n} active={isActive(n.id)} onClick={onJump} compact={compact}/>
        ))}
        <SysArrow compact={compact}/>
        <SysNodeChip node={computed} active={isActive(computed.id)} onClick={onJump} compact={compact} accent="ink"/>
        <SysArrow compact={compact}/>
        <SysNodeChip node={policy} active={isActive(policy.id)} onClick={onJump} compact={compact} accent="policy"/>
        <SysArrow compact={compact}/>
        <SysNodeChip node={fee} active={isActive(fee.id)} onClick={onJump} compact={compact} accent="fee"/>
      </div>

      {/* Legend row */}
      {showLegend && (
        <div style={{
          display: "flex", alignItems: "center", gap: 16, marginTop: 12,
          fontSize: 11, color: "var(--ink-3)",
        }}>
          <SysLegendDot color="var(--ink-3)"/>
          <span>Inputs (you provide)</span>
          <SysLegendDot color="var(--ink)"/>
          <span>Computed (derived)</span>
          <SysLegendDot color="var(--accent)"/>
          <span>Policy (decisions)</span>
          <span style={{ marginLeft: "auto", fontStyle: "italic" }}>
            Edit any input — every downstream value recomputes deterministically.
          </span>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// Breadcrumb variant — minimal "Build Model / [Active Node]" path. Replaces
// the previous full-node-list breadcrumb that duplicated the sub-tab row.
// Just one line of context, no second navigation surface.
// =========================================================================
function SystemDiagramBreadcrumb({ active, onJump }) {
  const node = SYS_NODES.find(n => n.id === active);
  const label = node ? node.label : "—";
  const goRoot = () => {
    if (window.AFFERENT_NAV) window.AFFERENT_NAV("build");
  };
  return (
    <div style={{
      display: "flex", alignItems: "baseline",
      padding: "0 0 12px", gap: 6,
      marginBottom: 4,
    }}>
      <button
        onClick={goRoot}
        style={{
          fontSize: 11.5, color: "var(--ink-3)", fontWeight: 400,
          background: "transparent", border: "none", padding: 0,
          cursor: "pointer",
          letterSpacing: "-0.005em", whiteSpace: "nowrap",
        }}
        title="Build Model overview"
      >Build Model</button>
      <span style={{ color: "var(--ink-4)", fontSize: 11 }}>/</span>
      <span style={{
        fontSize: 11.5, fontWeight: 500, color: "var(--ink)",
        letterSpacing: "-0.005em", whiteSpace: "nowrap",
      }}>{label}</span>
    </div>
  );
}

function SysLegendDot({ color }) {
  return (
    <span style={{
      width: 8, height: 8, borderRadius: 2,
      background: color, display: "inline-block", marginRight: -4,
    }}/>
  );
}

function SysNodeChip({ node, active, onClick, compact, accent }) {
  // Quieter visual: no double-border boxes. Use background fills + minimal
  // top-rule color band to mark role. Active gets a subtle indigo wash.
  const tone =
    accent === "ink"    ? { bg: "var(--ink)",         fg: "var(--paper)",  sub: "rgba(255,255,255,0.6)", topBar: "transparent" } :
    accent === "policy" ? { bg: "var(--accent-tint)", fg: "var(--accent)", sub: "var(--ink-3)",          topBar: "var(--accent)" } :
    accent === "fee"    ? { bg: "var(--ink-2, #2a2a2a)", fg: "var(--paper)", sub: "rgba(255,255,255,0.65)", topBar: "transparent" } :
                          { bg: "var(--paper-2)",     fg: "var(--ink-2)",  sub: "var(--ink-3)",          topBar: "transparent" };
  const activeOverride = active && accent !== "ink"
    ? { bg: "var(--accent-tint)", fg: "var(--accent)" }
    : {};
  const t = { ...tone, ...activeOverride };

  return (
    <button
      onClick={() => onClick && onClick(node.id)}
      title={node.desc}
      style={{
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: compact ? "8px 10px" : "10px 12px",
        background: t.bg,
        borderTop: t.topBar !== "transparent" ? `2px solid ${t.topBar}` : "2px solid transparent",
        textAlign: "left", cursor: onClick ? "pointer" : "default",
        minHeight: compact ? 0 : 56,
        outline: active ? "1px solid var(--accent)" : "none",
        outlineOffset: -1,
      }}
    >
      <div style={{
        fontSize: compact ? 11.5 : 12.5, fontWeight: 600,
        color: t.fg, letterSpacing: "-0.01em", lineHeight: 1.15,
      }}>{node.label}</div>
      {!compact && (
        <div style={{
          fontSize: 10.5, color: t.sub, marginTop: 3, lineHeight: 1.3,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{node.desc}</div>
      )}
    </button>
  );
}

function SysArrow({ compact }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "var(--ink-4)",
    }}>
      <svg width="14" height={compact ? 16 : 20} viewBox="0 0 14 20" fill="none">
        <path d="M2 10 H11 M8 6 L12 10 L8 14"
          stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="square"/>
      </svg>
    </div>
  );
}

// =========================================================================
// FactPolicyTag — visual distinction between read-only computed values
// and editable policy decisions. Used inline next to numbers, sections, etc.
// =========================================================================
function FactPolicyTag({ kind = "fact", size = "sm" }) {
  const isFact = kind === "fact";
  const label = isFact ? "Fact" : "Policy";
  const small = size === "sm";
  return (
    <span
      title={isFact
        ? "Computed from inputs · read-only"
        : "Editable policy decision"}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: small ? "1px 5px" : "2px 7px",
        fontSize: small ? 9 : 10, fontWeight: 700,
        letterSpacing: "0.08em", textTransform: "uppercase",
        fontFamily: "var(--ff-mono)",
        color: isFact ? "var(--ink-3)" : "var(--accent)",
        background: isFact ? "var(--paper-2)" : "var(--accent-tint)",
        border: `1px solid ${isFact ? "var(--rule)" : "var(--accent)"}`,
      }}
    >
      <span style={{
        width: small ? 4 : 5, height: small ? 4 : 5,
        background: isFact ? "var(--ink-3)" : "var(--accent)",
        borderRadius: "50%",
      }}/>
      {label}
    </span>
  );
}

// =========================================================================
// NodeEyebrow — replaces the "Step N of 7 · Salary" pattern with one that
// reads as a system component, not a wizard step.
// =========================================================================
function NodeEyebrow({ node, role }) {
  const n = SYS_NODES.find(x => x.id === node);
  if (!n) return "Build Model";
  return (
    <span>
      Build Model
      <span style={{ color: "var(--ink-4)", margin: "0 7px" }}>·</span>
      {n.label}
    </span>
  );
}

Object.assign(window, {
  SystemDiagram, FactPolicyTag, NodeEyebrow,
  AFFERENT_SYS_NODES: SYS_NODES,
  AFFERENT_NAV_TO_NODE: NAV_TO_NODE,
});
