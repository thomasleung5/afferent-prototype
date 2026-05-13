
import { Page, PageHeader } from "@/components/layout";
import { Btn, ExportMenu } from "@/components/ui";
import { WorkflowMap } from "@/features/build/WorkflowMap";
import { ImportBar } from "@/features/build/ImportBar";
import { useBuildState, useBuildStore } from "@/lib/store";
import { useExport } from "@/features/build/useExport";

async function loadTestSeed() {
  const res = await fetch("/test-seed.json");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { _note: _, ...seed } = (await res.json()) as Record<string, any>;
  useBuildStore.setState(seed);
}

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
            {import.meta.env.DEV && (
              <Btn kind="ghost" onClick={loadTestSeed} title="Load test-seed.json into the store">
                Load test data
              </Btn>
            )}
            <Btn kind="ghost" onClick={resetAll} title="Discard edits and re-seed">
              Reset edits
            </Btn>
            <ExportMenu onDownloadExcel={downloadExcel} onOpenPdf={openPdf}/>
          </>
        }
      />

      <WorkflowMap/>

      <ImportBar/>
    </Page>
  );
}
