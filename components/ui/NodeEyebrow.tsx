type NodeId =
  | "services" | "salary" | "operating" | "cap" | "workload"
  | "costs" | "policy" | "feestudy" | "benchmark";

const NODE_LABEL: Record<NodeId, string> = {
  services:  "Services",
  salary:    "Direct Labor",
  operating: "Operating",
  cap:       "Cost Allocation",
  workload:  "Workload",
  costs:     "Cost of Service",
  policy:    "Recovery Policy",
  feestudy:  "Fee Schedule",
  benchmark: "Fee Benchmark",
};

interface Props {
  node: NodeId;
}

/** Page eyebrow that reads as a system component, not a wizard step. */
export function NodeEyebrow({ node }: Props) {
  return (
    <span>
      Build Model
      <span style={{ color: "var(--ink-4)", margin: "0 7px" }}>·</span>
      {NODE_LABEL[node]}
    </span>
  );
}
