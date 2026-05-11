
import { Page, PageHeader } from "@/components/layout";
import { Btn, ExportMenu } from "@/components/ui";
import { fmt } from "@/lib/format";
import { StatusRow } from "@/features/_shared/StatusRow";
import { WorkflowMap } from "@/features/build/WorkflowMap";
import { ImportBar } from "@/features/build/ImportBar";
import { useBuildState, useBuildStore } from "@/lib/store";
import { useExport } from "@/features/build/useExport";

async function loadTestSeed() {
  const res = await fetch("/test-seed.json");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { _note: _, ...seed } = (await res.json()) as Record<string, any>;
  useBuildStore.setState(seed);
}

export default function BuildOverviewPage() {
  const { services, positions, operating, capAllocation, capPools, workload, derived, imports, resetAll } = useBuildState();
  const { downloadExcel, openPdf } = useExport();
  const impact = derived.impact;

  const totalFte = positions.reduce((a, p) => a + p.fte, 0);
  const totalCap =
    capAllocation.PLAN.allocated + capAllocation.BLDG.allocated + capAllocation.ENG.allocated;
  const totalCost = derived.costs.reduce((a, c) => a + c.annualCost, 0);
  const totalRev = derived.costs.reduce((a, c) => a + c.annualRevenue, 0);
  const gap = Math.max(0, totalCost - totalRev);
  const missingVolume = workload.filter((w) => w.current == null).length;

  return (
    <Page>
      <PageHeader
        eyebrow="Build model"
        title="Model architecture"
        subtitle="Inputs → Analysis → Policy → Output. Every number is deterministic and traceable to source."
        actions={
          <>
            {import.meta.env.DEV && (
              <Btn kind="ghost" onClick={loadTestSeed} title="Load test-seed.json into the store">
                Load test data
              </Btn>
            )}
            <Btn kind="ghost" onClick={resetAll} title="Discard edits and re-seed">
              Reset edits
            </Btn>
            <ExportMenu onDownloadExcel={downloadExcel} onOpenPdf={openPdf}/>
          </>
        }
      />

      <StatusRow items={[
        `${services.length} services`,
        `${totalFte.toFixed(1)} FTE · ${positions.length} positions`,
        `${operating.filter((l) => l.include).length} operating lines`,
        `${capPools.length} pools · ${fmt.dollarsK(totalCap)} allocated`,
        { value: missingVolume === 0 ? "All workload captured" : `${missingVolume} missing volume`, tone: missingVolume === 0 ? "pos" : "warn" },
        { value: `${impact.overallPct.toFixed(0)}% intended recovery`, tone: impact.overallPct >= 80 ? "pos" : "warn" },
        `Recovery gap ${fmt.dollarsK(gap)}/yr`,
        imports.length > 0 ? `${imports.length} import${imports.length === 1 ? "" : "s"}` : "Seed data",
      ]}/>

      <WorkflowMap/>

      <ImportBar/>
    </Page>
  );
}
