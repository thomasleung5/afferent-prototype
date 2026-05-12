
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, DropZone, NodeEyebrow } from "@/components/ui";
import { CITY } from "@/lib/data/city";
import { StatusRow } from "@/features/_shared/StatusRow";
import { BenchmarkTable } from "@/features/build/BenchmarkTable";
import { MappingReview } from "@/features/imports/MappingReview";
import { ImportDebug } from "@/features/imports/ImportDebug";
import { useBuildState } from "@/lib/store";
import { runImportPipeline } from "@/lib/import/pipeline";
import type { LastImport } from "@/components/ui";

export default function FeeBenchmarkPage() {
  const { services, currentBatch, setCurrentBatch } = useBuildState();
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
        subtitle={`Adopted fees in peer cities: ${CITY.peers.slice(0, 5).join(", ")}.`}
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>}
      />

      <StatusRow items={[
        `${services.length} fees`,
        `${withPeer.length} with peer data`,
        `${aboveMedian} above median`,
        { value: `${inLine} in line`, tone: "pos" },
        { value: `${belowMedian} below median`, tone: "warn" },
        `Avg variance ${avgVariance >= 0 ? "+" : ""}${Math.round(avgVariance)}%`,
        ...(reviewing > 0 ? [{ value: `${reviewing} for review`, tone: "warn" as const }] : []),
      ]}/>

      <DropZone
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, pdf · peer city fee schedule"
        hint="Drag an adopted fee schedule from a comparator city. Service names get fuzzy-matched to the catalog; matched rows update the peer fee, unmatched rows queue for review."
        onImport={async (file): Promise<LastImport> => {
          const batch = await runImportPipeline(file, { services, forceType: "benchmark_fee_schedule" });
          setCurrentBatch(batch);
          const accepted = batch.mappings.filter((m) => m.status === "auto_accepted").length;
          const flagged = batch.mappings.filter((m) => m.status !== "auto_accepted").length;
          return {
            file: file.name,
            rows: batch.mappings.length,
            mapped: accepted,
            review: flagged,
            date: new Date().toLocaleString(undefined, {
              month: "short", day: "numeric", year: "numeric",
              hour: "numeric", minute: "2-digit",
            }),
          };
        }}
      />

      <MappingReview/>

      <ImportDebug/>

      <BenchmarkTable/>
    </Page>
  );
}
