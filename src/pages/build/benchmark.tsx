
import { Page, PageHeader } from "@/components/layout";
import { ExportMenu, NodeEyebrow } from "@/components/ui";
import { StatusRow } from "@/features/_shared/StatusRow";
import { BenchmarkTable } from "@/features/build/BenchmarkTable";
import { useBenchmarkExport } from "@/features/build/useBenchmarkExport";
import { useBuildState } from "@/lib/store";

export default function FeeBenchmarkPage() {
  const { services } = useBuildState();
  const { downloadExcel, openPdf } = useBenchmarkExport();

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
          <ExportMenu
            onDownloadExcel={downloadExcel}
            onOpenPdf={openPdf}
            pdfLabel="Fee benchmark report (PDF)"
            pdfSub="Council-ready, print-formatted"
            excelLabel="Excel workbook (.xlsx)"
            excelSub="Summary · benchmark · notes"
          />
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
