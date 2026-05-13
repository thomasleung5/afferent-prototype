
import { Page, PageHeader } from "@/components/layout";
import { Btn, ExportMenu } from "@/components/ui";
import { WorkflowMap } from "@/features/build/WorkflowMap";
import { useBuildState, useBuildStore } from "@/lib/store";
import { useExport } from "@/features/build/useExport";

export default function BuildOverviewPage() {
  const { resetAll, clearAll } = useBuildState();
  const { downloadExcel, openPdf } = useExport();

  async function loadTestSeed() {
    const res = await fetch("/test-seed.json");
    const data = await res.json();
    useBuildStore.setState(data);
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Build model"
        title="Model architecture"
        subtitle="Inputs → Analysis → Policy → Output. Every number is deterministic and traceable to source."
        actions={
          <>
            {import.meta.env.DEV && (
              <>
                <Btn kind="ghost" onClick={loadTestSeed} title="Load test-seed.json into the store">
                  Load test data
                </Btn>
                <Btn kind="ghost" onClick={clearAll} title="Clear all data to simulate a fresh import state">
                  Clear seed
                </Btn>
              </>
            )}
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
