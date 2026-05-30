
import { Page, PageHeader } from "@/components/layout";
import { ExportMenu, NodeEyebrow } from "@/components/ui";
import { StatusRow } from "@/features/_shared/StatusRow";
import { BenchmarksTable } from "@/features/build/BenchmarksTable";
import { useBenchmarksExport } from "@/features/build/useBenchmarksExport";
import { fmt } from "@/lib/format";
import { useBuildState } from "@/lib/store";

export default function FeeBenchmarksPage() {
  const { services } = useBuildState();
  const { downloadExcel, pdfHref } = useBenchmarksExport();

  // Metric strip: how many fees price below / above peer median, the
  // typical variance, and the annual revenue we'd capture by lifting
  // below-median fees to the peer median.
  const withPeer = services.filter((s) => s.peer > 0);
  const variances = withPeer.map((s) => ((s.fee - s.peer) / s.peer) * 100);
  const sortedVar = [...variances].sort((a, b) => a - b);
  const medianVariance = sortedVar.length === 0 ? 0
    : sortedVar.length % 2 === 1
      ? sortedVar[Math.floor(sortedVar.length / 2)]
      : (sortedVar[sortedVar.length / 2 - 1] + sortedVar[sortedVar.length / 2]) / 2;
  const below = withPeer.filter((s) => s.fee < s.peer * 0.95);
  const above = withPeer.filter((s) => s.fee > s.peer * 1.05);
  const potentialRevenueGap = below.reduce(
    (acc, s) => acc + (s.peer - s.fee) * s.volume, 0,
  );

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="benchmarks"/>}
        title="Fee Benchmarks"
        subtitle="Adopted fees vs. peer-city medians."
        actions={
          <ExportMenu
            onDownloadExcel={downloadExcel}
            pdfHref={pdfHref}
            pdfLabel="Fee benchmarks report (PDF)"
            pdfSub="Council-ready, print-formatted"
            excelLabel="Excel workbook (.xlsx)"
            excelSub="Summary · benchmarks · notes"
          />
        }
      />

      <StatusRow items={[
        {
          label: "Below peer median",
          value: `${below.length}`,
          tone: below.length > 0 ? "warn" : undefined,
        },
        {
          label: "Above peer median",
          value: `${above.length}`,
        },
        {
          label: "Median variance",
          value: `${medianVariance >= 0 ? "+" : ""}${Math.round(medianVariance)}%`,
          tone: medianVariance < -5 ? "warn" : undefined,
        },
        {
          label: "Potential revenue gap",
          value: potentialRevenueGap > 0 ? fmt.dollarsK(potentialRevenueGap) : "—",
          tone: potentialRevenueGap > 0 ? "neg" : undefined,
        },
      ]}/>

      <BenchmarksTable/>
    </Page>
  );
}
