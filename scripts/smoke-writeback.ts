/* End-to-end writeback acceptance test.
 *
 *   npx tsx scripts/smoke-writeback.ts
 *
 * For each of the 6 workflow pages that have a DropZone, this script:
 *
 *   1. builds a synthetic fixture matching the page's expected document type
 *   2. drives the store through the same sequence the UI follows on import:
 *         runImportPipeline → setCurrentBatch
 *         → decideMapping(auto_accepted) on every candidate that has a target
 *         → applyCurrentBatch
 *   3. asserts that AT LEAST ONE row in the corresponding target table
 *      (services / positions / operating / capPools / workload) was changed
 *      or appended after applyCurrentBatch ran.
 *
 * If any page fails the acceptance test, exit code 1 with a diagnostic. This
 * is what the user means by "accepted mappings update the actual visible
 * workflow table." */

import { runImportPipeline } from "../lib/import/pipeline";
import { useBuildStore } from "../lib/store";
import type { DocumentType, TargetTable } from "../lib/import/types";

function blob(text: string, name: string): File {
  return new File([text], name, { type: "text/csv" });
}

interface Case {
  name: string;
  page: string;
  fileName: string;
  csv: string;
  forceType: DocumentType;
  /** Which target table this page expects writeback to touch. */
  target: TargetTable;
}

const CASES: Case[] = [
  {
    name: "Fee Schedule",
    page: "/build/feestudy",
    fileName: "Adopted Fee Schedule FY26-27.csv",
    forceType: "fee_schedule",
    target: "fees",
    csv:
`Fee Item,Department,Current Fee,Deposit,Unit,Notes
"Pre-Application Meeting","Planning",425,,each,
"Site Development Permit","Planning",1750,5500,each,
"ADU permit","Building",975,,each,
"Building permit (per IBC valuation)","Building",,,each,"Base fee plus 8% of valuation"
`,
  },
  {
    name: "Services",
    page: "/build/services",
    fileName: "Prior Fee Study FY24.csv",
    forceType: "prior_fee_study",
    target: "services",
    csv:
`Fee Item,Department,Current Fee,Deposit,Unit
"Pre-Application Meeting","Planning",250,,each
"Site Development Permit","Planning",1200,5000,each
"ADU permit","Building",850,,each
`,
  },
  {
    name: "Direct Labor",
    page: "/build/salary",
    fileName: "FY 26-27 Salary Roster.csv",
    forceType: "salary_roster",
    target: "positions",
    csv:
`Position,Department,FTE,Salary,Benefits,Productive Hours
"Senior Planner","Planning",1,138000,53000,1720
"Plans Examiner","Building",1,120000,48000,1720
"Engineering Tech II","Engineering",0.5,82000,32000,1720
`,
  },
  {
    name: "Operating",
    page: "/build/operating",
    fileName: "FY 26-27 Operating Budget.csv",
    forceType: "operating_budget",
    target: "operating",
    csv:
`Account,Description,Department,Category,Amount
501-100,"Software Licenses","Planning","Software & subscriptions",18000
501-200,"Professional Services","Building","Professional services",75000
501-400,"Training","Engineering","Training & travel",6000
`,
  },
  {
    name: "CAP",
    page: "/build/cap",
    fileName: "Cost Allocation Plan FY26-27.csv",
    forceType: "cost_allocation_plan",
    target: "cap",
    csv:
`Pool,Center,Target,Basis,Percent,Amount,Sequence
"IT Services","Information Technology","Planning","FTE",18,72000,1
"Human Resources","Human Resources","Building","FTE",22,88000,2
"Facilities","Facilities & Building Maintenance","Engineering","Sq Ft",,42000,3
`,
  },
  {
    name: "Workload",
    page: "/build/workload",
    fileName: "Permit Counts FY26.csv",
    forceType: "workload_export",
    target: "workload",
    csv:
`Service,Department,Unit,FY24,FY25
"ADU permit","Building","each",24,31
"Site Development Permit","Planning","each",12,18
"Pre-Application Meeting","Planning","each",65,72
`,
  },
  {
    name: "Benchmark",
    page: "/build/benchmark",
    fileName: "Mountain View Master Fee Schedule.csv",
    forceType: "benchmark_fee_schedule",
    target: "fees", // benchmark writes to services[].peer — same target table as fees
    csv:
`Fee Item,Department,Current Fee,Deposit,Unit
"Pre-Application Meeting","Planning",425,,each
"Site Development Permit","Planning",1450,5500,each
"ADU permit","Building",950,,each
`,
  },
];

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`ok ${msg}`);
}

function snap<T>(arr: readonly T[]): readonly T[] { return [...arr]; }

(async () => {
  for (const fx of CASES) {
    console.log(`\n=== ${fx.name} (${fx.page}) ===`);

    // Reset to canonical seeds before each case.
    useBuildStore.getState().resetAll();

    const before = useBuildStore.getState();
    const beforeServices = snap(before.services);
    const beforePositions = snap(before.positions);
    const beforeOperating = snap(before.operating);
    const beforeCap = snap(before.capPools);
    const beforeWorkload = snap(before.workload);

    const file = blob(fx.csv, fx.fileName);
    const batch = await runImportPipeline(file, {
      services: useBuildStore.getState().services,
      forceType: fx.forceType,
    });
    const natAuto = batch.mappings.filter((m) => m.status === "auto_accepted").length;
    const natReview = batch.mappings.filter((m) => m.status === "needs_review").length;
    const natUnres = batch.mappings.filter((m) => m.status === "unresolved").length;
    console.log(`natural statuses · auto=${natAuto} review=${natReview} unresolved=${natUnres}`);
    useBuildStore.getState().setCurrentBatch(batch);

    // Simulate the user clicking Accept on every routable candidate.
    let routable = 0;
    for (const m of batch.mappings) {
      if (m.proposedTargetTable != null) {
        useBuildStore.getState().decideMapping(m.id, "auto_accepted");
        routable += 1;
      }
    }
    assert(routable > 0, `[${fx.name}] at least one candidate has a target table (got ${routable})`);

    const { applied, skipped } = useBuildStore.getState().applyCurrentBatch();
    console.log(`applied=${applied} skipped=${skipped}`);
    assert(applied > 0, `[${fx.name}] applyCurrentBatch reported ${applied} writes`);

    const after = useBuildStore.getState();

    // Pick the appropriate target table and confirm something changed.
    let changed = false;
    let diff = "";
    if (fx.target === "fees" || fx.target === "services") {
      changed = after.services.length !== beforeServices.length
        || after.services.some((s, i) => {
          const b = beforeServices[i];
          if (!b || b.id !== s.id) return true;
          return b.fee !== s.fee || b.peer !== s.peer || b.target !== s.target || b.hours !== s.hours;
        });
      const newCount = after.services.length - beforeServices.length;
      diff = `services length ${beforeServices.length} → ${after.services.length} (Δ ${newCount > 0 ? "+" : ""}${newCount})`;
    } else if (fx.target === "positions") {
      changed = after.positions.length !== beforePositions.length;
      diff = `positions length ${beforePositions.length} → ${after.positions.length}`;
    } else if (fx.target === "operating") {
      changed = after.operating.length !== beforeOperating.length;
      diff = `operating length ${beforeOperating.length} → ${after.operating.length}`;
    } else if (fx.target === "cap") {
      changed = after.capPools.length !== beforeCap.length;
      diff = `capPools length ${beforeCap.length} → ${after.capPools.length}`;
    } else if (fx.target === "workload") {
      // Workload writeback patches existing rows when service matches; the
      // length may not change. Compare the row contents.
      changed = after.workload.some((w, i) => {
        const b = beforeWorkload[i];
        if (!b || b.id !== w.id) return true;
        return b.current !== w.current || b.prior !== w.prior;
      });
      diff = `workload rows differ`;
    }
    console.log(diff);
    assert(changed, `[${fx.name}] target table "${fx.target}" changed after applyCurrentBatch`);

    // Lineage must be recorded for at least one written row.
    const lineageBefore = Object.keys(before.lineage).length;
    const lineageAfter = Object.keys(after.lineage).length;
    assert(
      lineageAfter > lineageBefore,
      `[${fx.name}] lineage grew (${lineageBefore} → ${lineageAfter} entries)`,
    );

    // Import log must have appended.
    assert(
      after.imports.length > before.imports.length,
      `[${fx.name}] imports log appended (${before.imports.length} → ${after.imports.length})`,
    );
  }

  console.log("\n✓ writeback smokes passed for all 7 pages");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
