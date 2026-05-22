import { useCallback } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, SectionEyebrow } from "@/components/ui";
import { UpdatePacketView } from "@/features/annual/UpdatePacketView";
import { SaveVersionActions } from "@/features/annual/SaveVersionActions";
import { buildCsv, downloadCsv } from "@/lib/export/csv";
import {
  deriveAnnualChanges, derivePacketSummary, sectionCodeFor,
} from "@/lib/data/annual";
import { useActiveJurisdiction } from "@/lib/active";
import { fmt } from "@/lib/format";
import { useBuildState } from "@/lib/store";

export default function AnnualPacketPage() {
  const state = useBuildState();
  const jurisdiction = useActiveJurisdiction();

  const exportStaffReport = useCallback(() => {
    const input = {
      imports: state.imports,
      positions: state.positions,
      operating: state.operating,
      workload: state.workload,
      services: state.services,
      capPools: state.capPools,
      comparisons: state.derived.comparisons,
      impact: state.derived.impact,
    };
    const summary = derivePacketSummary(input);
    const changes = deriveAnnualChanges(input);

    // Top fee opportunities — services with the biggest annual uplift if
    // adopted, sorted descending. Mirrors what UpdatePacketView highlights.
    const topFees = [...state.derived.comparisons]
      .sort((a, b) => b.annualUplift - a.annualUplift)
      .slice(0, 15);

    const csv = buildCsv([
      ["Section", "Field", "Value"],
      ["Summary", "Imports this cycle", String(summary.totalImports)],
      ["Summary", "Domains refreshed", String(summary.domainsRefreshed)],
      ["Summary", "Current recovery", `${summary.currentRecovery}%`],
      ["Summary", "Policy target", `${summary.policyTarget}%`],
      ["Summary", "Recoverable gap", fmt.dollars(summary.recoverableGap)],
      ["Summary", "Fees below target", `${summary.feesBelowTarget} of ${summary.totalFees}`],
      ["Summary", "Top cost driver",
        summary.topCostDriver ? `${summary.topCostDriver.name} · ${fmt.dollars(summary.topCostDriver.cost)}` : "—"],
      ["Summary", "Top fee opportunity",
        summary.topFeeOpportunity ? `${summary.topFeeOpportunity.name} · ${fmt.dollars(summary.topFeeOpportunity.uplift)}/yr` : "—"],
      ["Summary", "Last refresh", summary.lastRefresh],
      null,
      ["Change log", "ID", "Section · Change · Affects · Prior → Current · Impact · Action · Badge · Confidence"],
      ...changes.map((c) => [
        "Change log",
        c.id,
        `${sectionCodeFor(state.imports.find((e) => `change-${e.id}` === c.id)?.domain ?? "operating")} · ${c.change} · ${c.affected} · ${c.prior} → ${c.current} · ${c.impact} · ${c.action} · ${c.badge} · ${c.confidence}`,
      ]),
      null,
      ["Top fee opportunities", "Service", "Dept · Current → Recommended · Annual uplift"],
      ...topFees.map((c) => [
        "Top fee opportunities",
        c.name,
        `${c.dept} · ${fmt.dollars(c.fee)} → ${fmt.dollars(c.recommended)} · ${c.annualUplift >= 0 ? "+" : ""}${fmt.dollars(c.annualUplift)}/yr`,
      ]),
    ]);
    const slug = jurisdiction.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    downloadCsv(csv, `${slug}-annual-staff-report.csv`);
  }, [state, jurisdiction.name]);

  // Council-facing packet opens the existing fee-study print-preview tab.
  // The same /export route renders against the live BuildProvider state, so
  // staff can print or save-as-PDF from there.
  const openPacket = useCallback(() => {
    window.open("/export/fee-study", "_blank", "noopener,noreferrer");
  }, []);

  return (
    <Page>
      <PageHeader
        eyebrow={<SectionEyebrow prefix="Annual Update" label="Update packet"/>}
        title="Annual update packet"
        subtitle="Council outputs assembled from the model run."
        actions={<>
          <SaveVersionActions/>
          <Btn kind="ghost" onClick={exportStaffReport}>
            <Icon name="download" size={13}/> Export staff report
          </Btn>
          <Btn kind="primary" onClick={openPacket}>
            <Icon name="download" size={13}/> Export packet
          </Btn>
        </>}
      />
      <UpdatePacketView/>
    </Page>
  );
}
