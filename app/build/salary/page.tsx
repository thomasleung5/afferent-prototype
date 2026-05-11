"use client";

import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, DropZone, NodeEyebrow } from "@/components/ui";
import { StatusRow } from "@/features/_shared/StatusRow";
import { LaborSummary } from "@/features/build/LaborSummary";
import { PositionsTable } from "@/features/build/PositionsTable";
import { ImportReview } from "@/features/build/ImportReview";
import { useBuildState } from "@/features/build/BuildContext";
import { toLastImport, runAiAssistPass } from "@/features/build/runImport";
import { parseFile } from "@/lib/parse";
import { extractSalary } from "@/lib/parse/extract";

export default function DirectLaborPage() {
  const {
    positions, derived, mergePositions, pendingReview,
    setAiStatus, addAiSuggestions,
  } = useBuildState();
  const labor = derived.labor;
  const totalFte = positions.reduce((a, p) => a + p.fte, 0);
  const totalHrs = labor.PLAN.productiveHours + labor.BLDG.productiveHours + labor.ENG.productiveHours;
  const flagged = positions.filter((p) => p.flag).length;
  const reviewQueue = pendingReview.positions.length;

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="salary"/>}
        title="Direct Labor"
        subtitle="Direct labor rate per department."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>}
      />

      <StatusRow items={[
        `${positions.length} positions`,
        { value: flagged === 0 ? "Balanced" : `${flagged} need review`, tone: flagged === 0 ? "pos" : "warn" },
        `${Math.round(totalHrs).toLocaleString()} productive hrs`,
        `${totalFte.toFixed(1)} FTE`,
        ...(reviewQueue > 0 ? [{ value: `${reviewQueue} unmapped`, tone: "warn" as const }] : []),
        "FY 2026-27",
      ]}/>

      <LaborSummary/>

      <DropZone
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, pdf budget exports"
        hint="Drag a salary table or position list. Common formats: Tyler / OpenGov / Workday exports, or budget book PDF."
        onImport={async (file) => {
          const doc = await parseFile(file);
          const result = extractSalary(doc, positions);
          const applied = mergePositions(result, file.name);
          void runAiAssistPass({
            domain: "positions",
            doc,
            unmapped: result.unmapped,
            exampleRows: positions.slice(0, 3) as unknown as Record<string, unknown>[],
            setStatus: (s) => setAiStatus("positions", s),
            addSuggestions: (items) => addAiSuggestions("positions", items),
          });
          return toLastImport(applied);
        }}
      />

      <ImportReview domain="positions"/>

      <PositionsTable/>
    </Page>
  );
}
