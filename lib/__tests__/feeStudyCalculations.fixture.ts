/* Fee-study aggregate validation.
 *
 * Run with: npm run test:fee-study
 *
 * The calc layer intentionally computes per-row cost/recommended values for
 * every fee row, but recovery aggregates must include only rows marked
 * recoverable. This fixture pins that contract across the dashboard-style
 * derived helpers and the fee-study export payload.
 */

import assert from "node:assert/strict";
import { buildExportPayload } from "../export/buildPayload";
import { deriveNetImpact } from "../data/annual";
import { deriveMonitoringData } from "../data/monitoring";
import { FEE_DEPTS } from "../data/departments";
import {
  feeComparisons, policyImpact, serviceCosts, type FBHR,
} from "../calc";
import type { BuildDeptRollup } from "../store";
import type { DeptCode, Service } from "../types";

const services: Service[] = [
  {
    id: "flat-recoverable",
    name: "Recoverable flat fee",
    dept: "PLAN",
    volume: 10,
    hours: 5,
    cost: 0,
    fee: 0,
    peer: 0,
    target: 100,
    source: "seed",
  },
  {
    id: "tm-nonrecoverable",
    name: "Display-only T&M fee",
    dept: "PLAN",
    volume: 20,
    hours: 3,
    cost: 0,
    fee: 0,
    peer: 0,
    target: 100,
    formula: { kind: "time-and-materials" },
    source: "seed",
  },
];

const fbhr = Object.fromEntries(
  FEE_DEPTS.map((dept) => [
    dept,
    {
      dept,
      directRate: 0,
      operatingRate: 0,
      capRate: 0,
      fbhr: dept === "PLAN" ? 50 : 0,
      productiveHours: dept === "PLAN" ? 1000 : 0,
      directDollars: 0,
      operatingDollars: 0,
      capDollars: 0,
    },
  ]),
) as Record<DeptCode, FBHR>;

const costs = serviceCosts(services, fbhr);
const comparisons = feeComparisons(costs, services, [], []);
const impact = policyImpact(comparisons);

const emptyDeptRollup = () => Object.fromEntries(
  FEE_DEPTS.map((dept) => [
    dept,
    { totalCost: 0, currentRev: 0, intendedRev: 0, subsidy: 0, recoveryPct: 0 },
  ]),
) as Record<DeptCode, BuildDeptRollup>;

{
  assert.equal(comparisons[0].recoverable, true);
  assert.equal(comparisons[1].recoverable, false);
  assert.equal(comparisons[1].annualUplift, 3000,
    "non-recoverable rows still retain per-row uplift for display/audit");
  assert.equal(impact.totalCost, 2500);
  assert.equal(impact.currentRevenue, 0);
  assert.equal(impact.recoverableGap, 2500);
  console.log("  ✓ core policy impact excludes non-recoverable rows");
}

{
  const netImpact = deriveNetImpact({
    imports: [],
    productiveHours: [],
    operating: [],
    volume: [],
    services,
    capPools: [],
    comparisons,
    impact,
  });
  assert.equal(netImpact, 2500,
    "annual update net impact reconciles to recoverable policy gap");
  console.log("  ✓ annual update net impact filters to recoverable rows");
}

{
  const deptRollup = emptyDeptRollup();
  deptRollup.PLAN = {
    totalCost: 2500,
    currentRev: 0,
    intendedRev: 2500,
    subsidy: 2500,
    recoveryPct: 0,
  };
  const monitoring = deriveMonitoringData({
    comparisons,
    impact,
    deptRollup,
    policyTargets: [],
    imports: [],
  });
  assert.equal(monitoring.summary.feesBelowTarget, 1);
  assert.equal(monitoring.recoveryAlerts.length, 1);
  assert.equal(monitoring.recoveryAlerts[0].alert, "Recoverable flat fee at $0 current fee");
  assert.equal(monitoring.staffActions.find((a) => a.id === "SA-FEES")?.fiscalImpact, 2500);
  console.log("  ✓ monitoring counts, alerts, and action dollars ignore non-recoverable rows");
}

{
  const labor = Object.fromEntries(
    FEE_DEPTS.map((dept) => [
      dept,
      {
        fte: dept === "PLAN" ? 1 : 0,
        positions: dept === "PLAN" ? 1 : 0,
        productiveHours: dept === "PLAN" ? 1000 : 0,
        totalComp: 0,
        directRate: 0,
      },
    ]),
  ) as Record<DeptCode, {
    fte: number;
    positions: number;
    productiveHours: number;
    totalComp: number;
    directRate: number;
  }>;

  const payload = buildExportPayload({
    productiveHours: [],
    operating: [],
    capPools: [],
    volume: [],
    services,
    policyTargets: [],
    policyExceptions: [],
    pendingReview: {
      positions: [],
      operating: [],
      services: [],
      fees: [],
      volume: [],
      cap: [],
    },
    lineage: {},
    jurisdiction: {
      name: "Fixture City",
      fiscal: "FY Test",
      preparedBy: "Fixture",
      peers: [],
    },
    derived: {
      activeFeeDepts: ["PLAN"],
      labor,
      fbhr,
      costs,
      comparisons,
      impact,
    },
  });

  assert.equal(payload.summary.totalCost, 2500);
  assert.equal(payload.summary.currentRevenue, 0);
  assert.equal(payload.summary.potentialUplift, 2500);
  assert.equal(payload.deptSummaries.find((d) => d.dept === "PLAN")?.totalCost, 2500);
  assert.deepEqual(payload.recommendations.map((r) => r.id), ["flat-recoverable"]);
  assert.equal(payload.deptBuckets.find((d) => d.dept === "PLAN")?.buckets[0].annualCost, 2500);
  assert.equal(payload.feeDetailByDept.find((d) => d.dept === "PLAN")?.total.annualRecommendedRevenue, 2500);
  assert.equal(payload.feeDetailByDept.find((d) => d.dept === "PLAN")?.total.uplift, 2500);
  console.log("  ✓ export summary, recommendations, buckets, and appendix totals reconcile");
}

console.log("\nAll fee-study calculation assertions passed.");
