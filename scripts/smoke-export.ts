/* Smoke test for the Excel exporter.
 *
 *   npx tsx scripts/smoke-export.ts
 *
 * Builds an ExportPayload from the seed data + calc, runs it through the
 * Excel exporter, and verifies the resulting workbook has every expected
 * sheet and at least one body row in each. */

import { buildExportPayload } from "../lib/export/buildPayload";
import { exportFeeStudyXlsx } from "../lib/export/excel";
import { POSITIONS } from "../lib/data/positions";
import { OPERATING } from "../lib/data/operating";
import { CAP_POOLS } from "../lib/data/cap";
import { WORKLOAD } from "../lib/data/workload";
import { SERVICES } from "../lib/data/services";
import { POLICY_TARGETS, POLICY_EXCEPTIONS } from "../lib/data/policy";
import {
  deptLabor, deptOperating, deptFBHR, feeComparisons, policyImpact, serviceCosts,
} from "../lib/calc";
import type { DeptCode } from "../lib/types";

async function main() {
  // Re-build derived state the way BuildContext does.
  const labor = deptLabor(POSITIONS);
  const hoursByDept: Record<DeptCode, number> = {
    PLAN: labor.PLAN.productiveHours,
    BLDG: labor.BLDG.productiveHours,
    ENG:  labor.ENG.productiveHours,
  };
  const operatingByDept = deptOperating(OPERATING, hoursByDept);
  // Smoke test runs without the step-down engine — feed deptFBHR a zero
  // CAP allocation so the rest of the pipeline still produces output.
  const zeroCapAllocated: Record<DeptCode, { dept: DeptCode; allocated: number }> = {
    PLAN: { dept: "PLAN", allocated: 0 },
    BLDG: { dept: "BLDG", allocated: 0 },
    ENG:  { dept: "ENG",  allocated: 0 },
  };
  const fbhr = deptFBHR(labor, operatingByDept, zeroCapAllocated);
  const costs = serviceCosts(SERVICES, fbhr);
  const comparisons = feeComparisons(costs, SERVICES, POLICY_TARGETS, POLICY_EXCEPTIONS);
  const impact = policyImpact(comparisons);

  const payload = buildExportPayload({
    positions: POSITIONS,
    operating: OPERATING,
    capPools: CAP_POOLS,
    workload: WORKLOAD,
    services: SERVICES,
    policyTargets: POLICY_TARGETS,
    policyExceptions: POLICY_EXCEPTIONS,
    pendingReview: {
      positions: [], operating: [], services: [],
      fees: [], workload: [], cap: [],
    },
    lineage: {},
    derived: { labor, fbhr, costs, comparisons, impact },
    jurisdiction: {
      name: "Town of Los Altos Hills",
      fiscal: "FY 2025-26",
      preparedBy: "Finance Department · NBS Consulting",
      peers: ["Atherton", "Portola Valley", "Woodside", "Hillsborough", "Monte Sereno"],
    },
  });

  console.log("[payload]", {
    services: payload.summary.services,
    totalCost: Math.round(payload.summary.totalCost),
    currentRevenue: Math.round(payload.summary.currentRevenue),
    recoveryPct: Math.round(payload.summary.recoveryPct),
    deptSummaries: payload.deptSummaries.length,
    feeSchedule: payload.feeSchedule.length,
    recommendations: payload.recommendations.length,
    benchmarks: payload.benchmarks.length,
  });

  const blob = await exportFeeStudyXlsx(payload);
  console.log("[xlsx blob] size:", blob.size, "bytes");
  if (blob.size < 5000) {
    throw new Error(`xlsx blob suspiciously small: ${blob.size} bytes`);
  }

  // Read back the workbook and verify sheets are populated.
  const XLSX = await import("xlsx");
  const buf = new Uint8Array(await blob.arrayBuffer());
  const wb = XLSX.read(buf, { type: "array" });
  console.log("[sheets]", wb.SheetNames);
  const expected = [
    "Summary", "Fee Schedule", "Cost of Service", "Department Summary",
    "Recommendations", "Recovery Policy", "Benchmark",
    "Review Flags", "Methodology",
  ];
  for (const name of expected) {
    if (!wb.SheetNames.includes(name)) {
      throw new Error(`Missing sheet: ${name}`);
    }
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
    if (rows.length < 2) {
      throw new Error(`Sheet "${name}" only has ${rows.length} rows`);
    }
  }
  console.log("✓ smoke export test passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
