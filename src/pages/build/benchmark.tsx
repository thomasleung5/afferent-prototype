
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { StatusRow } from "@/features/_shared/StatusRow";
import { BenchmarkTable } from "@/features/build/BenchmarkTable";
import { useBuildState } from "@/lib/store";

export default function FeeBenchmarkPage() {
  const { services } = useBuildState();

  const withPeer = services.filter((s) => s.peer > 0);
  const aboveMedian = withPeer.filter((s) => s.fee > s.peer * 1.05).length;
  const belowMedian = withPeer.filter((s) => s.fee < s.peer * 0.95).length;
  const inLine = withPeer.length - aboveMedian - belowMedian;
  const avgVariance = withPeer.length > 0
    ? withPeer.reduce((a, s) => a + ((s.fee - s.peer) / s.peer) * 100, 0) / withPeer.length
    : 0;

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="benchmark"/>}
        title="Fee Benchmark Database"
        subtitle="Adopted fees in peer cities."
        actions={
          <Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>
        }
      />

      <StatusRow items={[
        { label: "Fees",            value: `${services.length}` },
        { label: "With peer data",  value: `${withPeer.length}` },
        { label: "Above median",    value: `${aboveMedian}` },
        { label: "In line",         value: `${inLine}`, tone: "pos" },
        { label: "Below median",    value: `${belowMedian}`, tone: "warn" },
        { label: "Avg variance",    value: `${avgVariance >= 0 ? "+" : ""}${Math.round(avgVariance)}%` },
      ]}/>

      <BenchmarkTable/>
    </Page>
  );
}
