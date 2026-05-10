import type { Citywide, DeptRollupMap } from "../types";

export const DEPT_ROLLUPS: DeptRollupMap = {
  PLAN: { totalCost: 2384243, eligibleCost: 1381738, currentRev: 341000,  fullRev: 1300000, recovery: 27 },
  BLDG: { totalCost: 1495525, eligibleCost: 1443810, currentRev: 1047781, fullRev: 1528906, recovery: 69 },
  ENG:  { totalCost: 1068037, eligibleCost: 585766,  currentRev: 92960,   fullRev: 641379,  recovery: 14 },
};

/* Source: Table 1 / Executive Summary of NBS draft Fee Study. */
export const CITYWIDE: Citywide = {
  eligibleCost:    3411314,
  currentRevenue:  1481741,
  fullCostRevenue: 3470285,
  gap:             1988544,
  recovery:        43.4,
};
