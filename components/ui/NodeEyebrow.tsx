import { SectionEyebrow } from "./SectionEyebrow";

type NodeId =
  | "services" | "labor" | "operating" | "overhead" | "functional" | "volume"
  | "costs" | "policy" | "feeSchedule" | "benchmarks";

const NODE_LABEL: Record<NodeId, string> = {
  services:   "Services",
  labor:      "Labor",
  operating:  "Operating Costs",
  overhead:   "Overhead Costs",
  functional: "Functional Allocation",
  volume:     "Volume of Activity",
  costs:      "Cost of Service",
  policy:     "Recovery Policy",
  feeSchedule: "Fee Schedule",
  benchmarks: "Fee Benchmarks",
};

interface Props {
  node: NodeId;
}

/** Build Model page eyebrow. Type-safe node → label mapping. */
export function NodeEyebrow({ node }: Props) {
  return <SectionEyebrow prefix="Build Model" label={NODE_LABEL[node]}/>;
}
