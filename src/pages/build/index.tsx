
import { Page, PageHeader } from "@/components/layout";
import { Btn, ExportMenu } from "@/components/ui";
import { WorkflowMap } from "@/features/build/WorkflowMap";
import { useBuildState } from "@/lib/store";
import { useExport } from "@/features/build/useExport";

export default function BuildOverviewPage() {
  const { resetAll } = useBuildState();
  const { downloadExcel, openPdf } = useExport();

  return (
    <Page>
      <PageHeader
        eyebrow="Build model"
        title="Model architecture"
        subtitle="Inputs → Analysis → Policy → Output. Every number is deterministic and traceable to source."
        actions={
          <>
            <Btn kind="ghost" onClick={resetAll} title="Discard edits and re-seed">
              Reset edits
            </Btn>
            <ExportMenu onDownloadExcel={downloadExcel} onOpenPdf={openPdf}/>
          </>
        }
      />

      <WorkflowMap/>
    </Page>
  );
}
