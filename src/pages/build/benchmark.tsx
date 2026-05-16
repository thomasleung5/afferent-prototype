
import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { StatusRow } from "@/features/_shared/StatusRow";
import { BenchmarkTable } from "@/features/build/BenchmarkTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import { useBuildState } from "@/lib/store";

export default function FeeBenchmarkPage() {
  const { services, currentBatch } = useBuildState();
  const [importerOpen, setImporterOpen] = useState(false);

  const withPeer = services.filter((s) => s.peer > 0);
  const aboveMedian = withPeer.filter((s) => s.fee > s.peer * 1.05).length;
  const belowMedian = withPeer.filter((s) => s.fee < s.peer * 0.95).length;
  const inLine = withPeer.length - aboveMedian - belowMedian;
  const avgVariance = withPeer.length > 0
    ? withPeer.reduce((a, s) => a + ((s.fee - s.peer) / s.peer) * 100, 0) / withPeer.length
    : 0;
  const reviewing = currentBatch
    ? currentBatch.mappings.filter((m) => m.status === "needs_review" || m.status === "unresolved").length
    : 0;

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="benchmark"/>}
        title="Fee Benchmark Database"
        subtitle="Adopted fees in peer cities."
        actions={
          <>
            <Btn kind="ghost" onClick={() => setImporterOpen(true)}>
              <Icon name="arrow-up-to-line" size={13}/> Import
            </Btn>
            <Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>
          </>
        }
      />

      <StatusRow items={[
        { label: "Fees",            value: `${services.length}` },
        { label: "With peer data",  value: `${withPeer.length}` },
        { label: "Above median",    value: `${aboveMedian}` },
        { label: "In line",         value: `${inLine}`, tone: "pos" },
        { label: "Below median",    value: `${belowMedian}`, tone: "warn" },
        { label: "Avg variance",    value: `${avgVariance >= 0 ? "+" : ""}${Math.round(avgVariance)}%` },
        ...(reviewing > 0
          ? [{ label: "For review", value: `${reviewing}`, tone: "warn" as const }]
          : []),
      ]}/>

      <BenchmarkTable/>

      <PageImportDrawer
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        title="Import Fee Benchmark"
        helper="Drag an adopted fee schedule from a comparator city. Service names get fuzzy-matched to the catalog; matched rows update the peer fee, unmatched rows queue for review."
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, pdf · peer city fee schedule"
        forceType="benchmark_fee_schedule"
        schema="Service name, peer city, adopted fee, notes."
      />
    </Page>
  );
}
