import { Page, PageHeader } from "@/components/layout";
import { Btn, ExportMenu, Icon, SectionEyebrow } from "@/components/ui";
import { ChangeReviewTable } from "@/features/annual/ChangeReviewTable";
import { SaveVersionActions } from "@/features/annual/SaveVersionActions";
import { useExport } from "@/features/build/useExport";

export default function AnnualChangesPage() {
  const { downloadExcel, pdfHref } = useExport();

  return (
    <Page>
      <PageHeader
        eyebrow={<SectionEyebrow prefix="Annual Update" label="Review changes"/>}
        title="What changed this update?"
        subtitle="Review updates before generating the adoption packet."
        actions={<>
          <Btn kind="ghost" href="/source-data">
            <Icon name="arrow-up-to-line" size={13}/> Refresh Data
          </Btn>
          <SaveVersionActions/>
          <ExportMenu onDownloadExcel={downloadExcel} pdfHref={pdfHref}/>
        </>}
      />
      <ChangeReviewTable/>
    </Page>
  );
}
