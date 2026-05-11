"use client";

import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, DropZone, NodeEyebrow } from "@/components/ui";
import { fmt } from "@/lib/format";
import { CAP_TOTAL } from "@/lib/data/cap";
import { StatusRow } from "@/features/_shared/StatusRow";
import { CapKpiRail, StepDownSequence } from "@/features/build/CapKpiRail";
import { CapSummary } from "@/features/build/CapSummary";
import { CapPoolsTable } from "@/features/build/CapPoolsTable";
import { ImportReview } from "@/features/build/ImportReview";
import { useBuildState } from "@/features/build/BuildContext";
import { toLastImport, runAiAssistPass } from "@/features/build/runImport";
import { parseFile } from "@/lib/parse";
import { extractCap } from "@/lib/parse/extract";

export default function CapPage() {
  const {
    capAllocation, capPools, mergeCap, pendingReview,
    setAiStatus, addAiSuggestions,
  } = useBuildState();
  const totalAllocated =
    capAllocation.PLAN.allocated + capAllocation.BLDG.allocated + capAllocation.ENG.allocated;
  const allocatedPct = CAP_TOTAL > 0 ? Math.round((totalAllocated / CAP_TOTAL) * 100) : 0;
  const reviewCount = capPools.filter((p) => p.review === "Review").length;
  const reviewQueue = pendingReview.cap.length;

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="cap"/>}
        title="Cost Allocation"
        subtitle="Citywide indirect, allocated to direct departments."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>}
      />

      <StatusRow items={[
        `${capPools.length} pools`,
        `${fmt.dollarsK(CAP_TOTAL)} CAP scope`,
        `${allocatedPct}% allocated`,
        { value: reviewCount === 0 ? "Balanced" : `${reviewCount} unresolved`, tone: reviewCount === 0 ? "pos" : "warn" },
        ...(reviewQueue > 0 ? [{ value: `${reviewQueue} unmapped`, tone: "warn" as const }] : []),
        "Step-down · FY 2026-27",
      ]}/>

      <CapKpiRail/>

      <CapSummary/>

      <StepDownSequence/>

      <DropZone
        accept=".xlsx,.csv"
        formats="xlsx, csv"
        hint="Drag the most recent Cost Allocation Plan inventory. Centers, pools, and bases in one workbook."
        onImport={async (file) => {
          const doc = await parseFile(file);
          const result = extractCap(doc, capPools);
          const applied = mergeCap(result, file.name);
          void runAiAssistPass({
            domain: "cap",
            doc,
            unmapped: result.unmapped,
            exampleRows: capPools.slice(0, 3) as unknown as Record<string, unknown>[],
            setStatus: (s) => setAiStatus("cap", s),
            addSuggestions: (items) => addAiSuggestions("cap", items),
          });
          return toLastImport(applied);
        }}
      />

      <ImportReview domain="cap"/>

      <CapPoolsTable/>
    </Page>
  );
}
