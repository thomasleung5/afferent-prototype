
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

  // Decision-oriented KPI strip: which fees are materially below peer
  // pricing, how big is the typical gap, what's the worst single gap.
  const withPeer = services.filter((s) => s.peer > 0);
  const variances = withPeer.map((s) => ((s.fee - s.peer) / s.peer) * 100);
  const sortedVar = [...variances].sort((a, b) => a - b);
  const medianVariance = sortedVar.length === 0 ? 0
    : sortedVar.length % 2 === 1
      ? sortedVar[Math.floor(sortedVar.length / 2)]
      : (sortedVar[sortedVar.length / 2 - 1] + sortedVar[sortedVar.length / 2]) / 2;
  const below = withPeer.filter((s) => s.fee < s.peer * 0.95);
  const largestNegativeGap = below.reduce((max, s) => {
    const gap = s.peer - s.fee;
    return gap > max ? gap : max;
  }, 0);

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
          label: "Fees benchmarked",
          value: `${withPeer.length} of ${services.length}`,
        },
        {
          label: "Below peer median",
          value: `${below.length}`,
          tone: below.length > 0 ? "warn" : undefined,
        },
        {
          label: "Median variance",
          value: `${medianVariance >= 0 ? "+" : ""}${Math.round(medianVariance)}%`,
          tone: medianVariance < -5 ? "warn" : undefined,
        },
        {
          label: "Largest negative gap",
          value: largestNegativeGap > 0 ? `−${fmt.dollars(largestNegativeGap)}` : "—",
          tone: largestNegativeGap > 0 ? "neg" : undefined,
        },
      ]}/>

      <BenchmarksTable/>
    </Page>
  );
}
