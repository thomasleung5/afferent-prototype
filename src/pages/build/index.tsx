
import { Page, PageHeader } from "@/components/layout";
import { Btn, ExportMenu } from "@/components/ui";
import { DemoCityPicker } from "@/features/build/DemoCityPicker";
import { WorkflowMap } from "@/features/build/WorkflowMap";
import { useActiveJurisdiction } from "@/lib/active";
import { useBuildActions } from "@/lib/store";
import { useExport } from "@/features/build/useExport";

export default function BuildOverviewPage() {
  const { resetAll, clearAll } = useBuildActions((s) => ({
    resetAll: s.resetAll,
    clearAll: s.clearAll,
  }));
  const { downloadExcel, pdfHref } = useExport();
  const jurisdiction = useActiveJurisdiction();

  function confirmClearAll() {
    const ok = window.confirm(
      `Clear all build data for ${jurisdiction.name}?\n\n`
      + "This empties every input slice — including the seed. "
      + "You can re-seed afterward with Reset.",
    );
    if (ok) clearAll();
  }

  return (
    <Page>
      <PageHeader
        title="Build Model"
        actions={
          <>
            <DemoCityPicker/>
            <Btn kind="ghost" onClick={resetAll} title={`Discard edits in ${jurisdiction.name} and re-seed`}>
              Reset
            </Btn>
            <Btn kind="ghost" onClick={confirmClearAll} title={`Wipe every input in ${jurisdiction.name}`}>
              Clear
            </Btn>
            <ExportMenu onDownloadExcel={downloadExcel} pdfHref={pdfHref}/>
          </>
        }
      />

      <WorkflowMap/>
    </Page>
  );
}
