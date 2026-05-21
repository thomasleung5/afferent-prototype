
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

  function confirmClearAll() {
    const ok = window.confirm(
      "Clear all build data?\n\n"
      + "This removes every service, position, operating line, CAP pool, "
      + "workload row, policy target, and import log — including the seed. "
      + "You can re-seed afterward with Reset edits.",
    );
    if (ok) clearAll();
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Build model"
        title="Model architecture"
        subtitle="Inputs → Analysis → Policy → Output."
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
            <Btn kind="ghost" onClick={confirmClearAll} title="Wipe every input, including the seed">
              Clear all
            </Btn>
            <ExportMenu onDownloadExcel={downloadExcel} onOpenPdf={openPdf}/>
          </>
        }
      />

      <WorkflowMap/>
    </Page>
  );
}
