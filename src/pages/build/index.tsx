
import { Page, PageHeader } from "@/components/layout";
import { Btn, ExportMenu } from "@/components/ui";
import { DemoCityPicker } from "@/features/build/DemoCityPicker";
import { WorkflowMap } from "@/features/build/WorkflowMap";
import { useActiveJurisdiction } from "@/lib/active";
import { useBuildState } from "@/lib/store";
import { useExport } from "@/features/build/useExport";

export default function BuildOverviewPage() {
  const { resetAll, clearAll } = useBuildState();
  const { downloadExcel, openPdf } = useExport();
  const jurisdiction = useActiveJurisdiction();

  function confirmClearAll() {
    const ok = window.confirm(
      `Clear all build data for ${jurisdiction.name}?\n\n`
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
            <DemoCityPicker/>
            <Btn kind="ghost" onClick={resetAll} title={`Discard edits in ${jurisdiction.name} and re-seed`}>
              Reset edits
            </Btn>
            <Btn kind="ghost" onClick={confirmClearAll} title={`Wipe every input in ${jurisdiction.name}`}>
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
