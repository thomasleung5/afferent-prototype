
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, DropZone, NodeEyebrow } from "@/components/ui";
import { StatusRow } from "@/features/_shared/StatusRow";
import { ServicesTable } from "@/features/build/ServicesTable";
import { ImportReview } from "@/features/build/ImportReview";
import { useBuildState } from "@/features/build/BuildContext";
import { toLastImport, runAiAssistPass } from "@/features/build/runImport";
import { parseFile } from "@/lib/parse";
import { extractServices } from "@/lib/parse/extract";

export default function ServicesPage() {
  const {
    services, mergeServices, pendingReview,
    setAiStatus, addAiSuggestions,
  } = useBuildState();

  const byDept = {
    PLAN: services.filter((s) => s.dept === "PLAN").length,
    BLDG: services.filter((s) => s.dept === "BLDG").length,
    ENG:  services.filter((s) => s.dept === "ENG").length,
  };
  const totalHours = services.reduce((a, s) => a + s.hours, 0);
  const flagged = services.filter((s) => !s.hours || !s.volume).length;
  const reviewQueue = pendingReview.services.length;

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="services"/>}
        title="Services"
        subtitle="Hours per instance, role mix."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>}
      />

      <StatusRow items={[
        `${services.length} services`,
        `${byDept.PLAN} Planning · ${byDept.BLDG} Building · ${byDept.ENG} Engineering`,
        `${Math.round(totalHours).toLocaleString()} hrs / instance`,
        { value: flagged === 0 ? "All scoped" : `${flagged} need review`, tone: flagged === 0 ? "pos" : "warn" },
        ...(reviewQueue > 0 ? [{ value: `${reviewQueue} unmapped`, tone: "warn" as const }] : []),
        "FY 2026-27",
      ]}/>

      <DropZone
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, fee schedule pdf"
        hint="Drag a fee schedule, service inventory, or time-study export. Common formats: prior fee study workbook, permit-system service list, or a marked-up PDF."
        onImport={async (file) => {
          const doc = await parseFile(file);
          const result = extractServices(doc, services);
          const applied = mergeServices(result, file.name);
          void runAiAssistPass({
            domain: "services",
            doc,
            unmapped: result.unmapped,
            exampleRows: services.slice(0, 3) as unknown as Record<string, unknown>[],
            setStatus: (s) => setAiStatus("services", s),
            addSuggestions: (items) => addAiSuggestions("services", items),
          });
          return toLastImport(applied);
        }}
      />

      <ImportReview domain="services"/>

      <ServicesTable/>
    </Page>
  );
}
