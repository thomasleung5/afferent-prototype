import { useCallback } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, SectionEyebrow } from "@/components/ui";
import { ChangeReviewTable } from "@/features/annual/ChangeReviewTable";
import { buildCsv, downloadCsv } from "@/lib/export/csv";
import { deriveAnnualChanges, sectionCodeFor } from "@/lib/data/annual";
import { CITY } from "@/lib/data/city";
import { useBuildState } from "@/lib/store";

export default function AnnualChangesPage() {
  const state = useBuildState();

  const exportLog = useCallback(() => {
    const changes = deriveAnnualChanges({
      imports: state.imports,
      positions: state.positions,
      operating: state.operating,
      workload: state.workload,
      services: state.services,
      capPools: state.capPools,
      comparisons: state.derived.comparisons,
      impact: state.derived.impact,
    });
    const csv = buildCsv([
      ["ID", "Section", "Change", "Affects", "Prior", "Current", "Impact", "Confidence", "Action", "Badge"],
      ...changes.map((c) => [
        c.id,
        sectionCodeFor(state.imports.find((e) => `change-${e.id}` === c.id)?.domain ?? "operating"),
        c.change,
        c.affected,
        c.prior,
        c.current,
        c.impact,
        c.confidence,
        c.action,
        c.badge,
      ]),
    ]);
    const slug = CITY.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    downloadCsv(csv, `${slug}-change-log.csv`);
  }, [state]);

  return (
    <Page>
      <PageHeader
        eyebrow={<SectionEyebrow prefix="Annual Update" label="Review changes"/>}
        title="What changed this update?"
        subtitle="Review updates before generating the adoption packet."
        actions={
          <Btn kind="ghost" onClick={exportLog}>
            <Icon name="download" size={13}/> Export
          </Btn>
        }
      />
      <ChangeReviewTable/>
    </Page>
  );
}
