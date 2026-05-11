
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, DropZone, NodeEyebrow } from "@/components/ui";
import { StatusRow } from "@/features/_shared/StatusRow";
import { WorkloadTable } from "@/features/build/WorkloadTable";
import { ImportReview } from "@/features/build/ImportReview";
import { useBuildState } from "@/lib/store";
import { toLastImport, runAiAssistPass } from "@/features/build/runImport";
import { parseFile } from "@/lib/parse";
import { extractWorkload } from "@/lib/parse/extract";

export default function WorkloadPage() {
  const {
    workload, services, mergeWorkload, pendingReview,
    setAiStatus, addAiSuggestions,
  } = useBuildState();
  const totalVol = workload.reduce((a, r) => a + (r.current ?? 0), 0);
  const missing  = workload.filter((r) => r.current == null).length;
  const carry    = workload.filter((r) => r.source === "carry-forward").length;
  const reviewQueue = pendingReview.workload.length;

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="workload"/>}
        title="Workload"
        subtitle="Annual volume per service."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>}
      />

      <StatusRow items={[
        `${services.length} services`,
        `${totalVol.toLocaleString()} workload rows`,
        { value: missing === 0 ? "All captured" : `${missing} missing`, tone: missing === 0 ? "pos" : "warn" },
        carry > 0 ? `${carry} carry-forward` : "No carry-forward",
        ...(reviewQueue > 0 ? [{ value: `${reviewQueue} unmapped`, tone: "warn" as const }] : []),
        "FY 2026-27",
      ]}/>

      <DropZone
        accept=".xlsx,.csv"
        formats="xlsx, csv permit-system exports"
        hint="Drag a permit-system export. Supported: Tyler EnerGov, Accela, OpenGov, or any CSV with service + volume columns."
        onImport={async (file) => {
          const doc = await parseFile(file);
          const result = extractWorkload(doc, workload, services);
          const applied = mergeWorkload(result, file.name);
          // Pass service names so the AI can match unmapped rows to the catalog.
          const serviceExamples = services.slice(0, 12).map((s) => ({ name: s.name, dept: s.dept }));
          void runAiAssistPass({
            domain: "workload",
            doc,
            unmapped: result.unmapped,
            exampleRows: serviceExamples as unknown as Record<string, unknown>[],
            setStatus: (s) => setAiStatus("workload", s),
            addSuggestions: (items) => addAiSuggestions("workload", items),
          });
          return toLastImport(applied);
        }}
      />

      <ImportReview domain="workload"/>

      <WorkloadTable/>
    </Page>
  );
}
