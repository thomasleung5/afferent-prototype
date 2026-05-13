
import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { fmt } from "@/lib/format";
import { StatusRow } from "@/features/_shared/StatusRow";
import { FeeScheduleTable } from "@/features/build/FeeScheduleTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import { useBuildState } from "@/lib/store";

export default function FeeSchedulePage() {
  const { derived, currentBatch } = useBuildState();
  const [importerOpen, setImporterOpen] = useState(false);
  const comparisons = derived.comparisons;

  const totalUplift = comparisons.reduce((a, c) => a + Math.max(0, c.annualUplift), 0);
  const underRecovery = comparisons.filter((c) => c.recoveryPct < 100).length;
  const adoptedAt = comparisons.filter((c) => Math.abs(c.recommended - c.fee) < 1).length;
  const revenueNow = comparisons.reduce((a, c) => a + c.annualRevenue, 0);
  const revenueRec = comparisons.reduce((a, c) => a + c.recommended * c.volume, 0);
  const reviewing = currentBatch
    ? currentBatch.mappings.filter((m) => m.status === "needs_review" || m.status === "unresolved").length
    : 0;

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="feestudy"/>}
        title="Fee Schedule"
        subtitle="What fees do we adopt? Current fees compared to calculated cost."
        actions={
          <>
            <Btn kind="ghost" onClick={() => setImporterOpen(true)}>
              <Icon name="arrow-up-to-line" size={13}/> Import
            </Btn>
            <Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>
          </>
        }
      />

      <StatusRow items={[
        `${comparisons.length} fees`,
        `${adoptedAt} at recommended`,
        `${underRecovery} under target`,
        `Now ${fmt.dollarsK(revenueNow)} · Rec ${fmt.dollarsK(revenueRec)}`,
        { value: `+${fmt.dollarsK(totalUplift)}/yr uplift`, tone: "pos" },
        ...(reviewing > 0 ? [{ value: `${reviewing} for review`, tone: "warn" as const }] : []),
      ]}/>

      <FeeScheduleTable/>

      <PageImportDrawer
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        title="Import Fee Schedule"
        helper="Drag a fee schedule, prior fee study, or peer-city benchmark. The pipeline extracts fees, deposits, hourly rates, and notes — then proposes mappings into the catalog."
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, prior fee study pdf"
        schema="Service name, fee, deposit, hourly rate, notes."
      />
    </Page>
  );
}
