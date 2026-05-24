import { Page, PageHeader } from "@/components/layout";
import { ExportMenu, SectionEyebrow } from "@/components/ui";
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
          <SaveVersionActions/>
          <ExportMenu onDownloadExcel={downloadExcel} pdfHref={pdfHref}/>
        </>}
      />
      <ChangeReviewTable/>
    </Page>
  );
}
