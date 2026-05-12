
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, DropZone, NodeEyebrow } from "@/components/ui";
import { CITY } from "@/lib/data/city";
import { StatusRow } from "@/features/_shared/StatusRow";
import { BenchmarkTable } from "@/features/build/BenchmarkTable";
import { ImportReview } from "@/features/build/ImportReview";
import { useBuildState } from "@/lib/store";
import { toLastImport, runAiAssistPass } from "@/features/build/runImport";
import { parseFile } from "@/lib/parse";
import { extractBenchmark } from "@/lib/parse/extract";

export default function FeeBenchmarkPage() {
  const {
    services, mergeFeeSchedule, pendingReview,
    setAiStatus, addAiSuggestions,
  } = useBuildState();
  const withPeer = services.filter((s) => s.peer > 0);
  const aboveMedian = withPeer.filter((s) => s.fee > s.peer * 1.05).length;
  const belowMedian = withPeer.filter((s) => s.fee < s.peer * 0.95).length;
  const inLine = withPeer.length - aboveMedian - belowMedian;
  const avgVariance = withPeer.length > 0
    ? withPeer.reduce((a, s) => a + ((s.fee - s.peer) / s.peer) * 100, 0) / withPeer.length
    : 0;
  const reviewQueue = pendingReview.fees.length;

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
        ...(reviewQueue > 0 ? [{ value: `${reviewQueue} unmapped`, tone: "warn" as const }] : []),
      ]}/>

      <DropZone
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, pdf · peer city fee schedule"
        hint="Drag an adopted fee schedule from a comparator city. Service names that match the catalog get their peer fee updated. Unmatched names go to the review queue for Claude to normalize."
        onImport={async (file) => {
          const doc = await parseFile(file);
          const result = extractBenchmark(doc, services);
          const applied = mergeFeeSchedule(result, file.name);
          void runAiAssistPass({
            domain: "fees",
            doc,
            unmapped: result.unmapped,
            exampleRows: services.slice(0, 12).map((s) => ({
              name: s.name, dept: s.dept, peer: s.peer,
            })),
            setStatus: (s) => setAiStatus("fees", s),
            addSuggestions: (items) => addAiSuggestions("fees", items),
          });
          return toLastImport(applied);
        }}
      />

      <ImportReview domain="fees"/>

      <BenchmarkTable/>
    </Page>
  );
}
