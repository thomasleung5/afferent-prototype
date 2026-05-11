"use client";

import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, DropZone, NodeEyebrow } from "@/components/ui";
import { fmt } from "@/lib/format";
import { StatusRow } from "@/features/_shared/StatusRow";
import { OperatingSummary } from "@/features/build/OperatingSummary";
import { OperatingBuckets } from "@/features/build/OperatingBuckets";
import { OperatingTable } from "@/features/build/OperatingTable";
import { ImportReview } from "@/features/build/ImportReview";
import { useBuildState } from "@/features/build/BuildContext";
import { toLastImport, runAiAssistPass } from "@/features/build/runImport";
import { parseFile } from "@/lib/parse";
import { extractOperating } from "@/lib/parse/extract";

export default function OperatingPage() {
  const {
    operating, mergeOperating, pendingReview,
    setAiStatus, addAiSuggestions,
  } = useBuildState();
  const included = operating.filter((l) => l.include);
  const excluded = operating.filter((l) => !l.include);
  const includedTotal = included.reduce((a, l) => a + l.amount, 0);
  const reviewQueue = pendingReview.operating.length;

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="operating"/>}
        title="Operating"
        subtitle="Department non-labor spend."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>}
      />

      <StatusRow items={[
        `${operating.length} lines`,
        { value: "Validated", tone: "pos" },
        `${included.length} included · ${excluded.length} excluded`,
        `${fmt.dollarsK(includedTotal)} flowing into $/hr`,
        ...(reviewQueue > 0 ? [{ value: `${reviewQueue} unmapped`, tone: "warn" as const }] : []),
        "FY 2026-27",
      ]}/>

      <OperatingSummary/>

      <OperatingBuckets/>

      <DropZone
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, budget book pdf"
        hint="Drag the budget book or a department detail sheet. Common formats: Tyler / OpenGov budget extracts, line-item Excel, or scanned PDF."
        onImport={async (file) => {
          const doc = await parseFile(file);
          const result = extractOperating(doc, operating);
          const applied = mergeOperating(result, file.name);
          void runAiAssistPass({
            domain: "operating",
            doc,
            unmapped: result.unmapped,
            exampleRows: operating.slice(0, 3) as unknown as Record<string, unknown>[],
            setStatus: (s) => setAiStatus("operating", s),
            addSuggestions: (items) => addAiSuggestions("operating", items),
          });
          return toLastImport(applied);
        }}
      />

      <ImportReview domain="operating"/>

      <OperatingTable/>
    </Page>
  );
}
