import { SectionEyebrow } from "./SectionEyebrow";

type NodeId =
  | "services" | "salary" | "operating" | "cap" | "volume"
  | "costs" | "policy" | "feestudy" | "benchmark";

const NODE_LABEL: Record<NodeId, string> = {
  services:  "Services",
  salary:    "Direct Labor",
  operating: "Operating",
  cap:       "Overhead Cost Allocation",
  volume:    "Volume of Activity",
  costs:     "Cost of Service",
  policy:    "Recovery Policy",
  feestudy:  "Fee Schedule",
  benchmark: "Fee Benchmark",
};

interface Props {
  node: NodeId;
}

/** Build Model page eyebrow. Type-safe node → label mapping. */
export function NodeEyebrow({ node }: Props) {
  return <SectionEyebrow prefix="Build Model" label={NODE_LABEL[node]}/>;
}
