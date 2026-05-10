/* Core domain types for the Afferent cost-of-service model.
 * Mirrors the shape of data.jsx in the original prototype. */

export type DeptCode = "PLAN" | "BLDG" | "ENG";

export interface City {
  name: string;
  fiscal: string;
  preparedBy: string;
  peers: string[];
}

export interface Department {
  code: DeptCode;
  name: string;
  /** Fully-burdened hourly rate */
  fbhr: number;
}

export type DepartmentMap = Record<DeptCode, Department>;

export interface Service {
  id: string;
  name: string;
  dept: DeptCode;
  /** Annual estimated volume */
  volume: number;
  /** Staff hours per occurrence */
  hours: number;
  /** Fully-burdened cost per occurrence */
  cost: number;
  /** Currently adopted fee */
  fee: number;
  /** Peer-median fee */
  peer: number;
  /** Recovery target % (e.g. 100 = full cost recovery) */
  target: number;
}

export interface EnrichedService extends Service {
  /** fee / cost * 100 */
  recovery: number;
  /** (cost − fee) × volume — annual under-recovery */
  gap: number;
}

export interface DeptRollup {
  totalCost: number;
  eligibleCost: number;
  currentRev: number;
  fullRev: number;
  /** Recovery % */
  recovery: number;
}

export type DeptRollupMap = Record<DeptCode, DeptRollup>;

export interface Citywide {
  eligibleCost: number;
  currentRevenue: number;
  fullCostRevenue: number;
  /** Annual under-recovery in dollars */
  gap: number;
  /** Recovery % */
  recovery: number;
}

export interface AuditEntry {
  date: string;
  text: string;
  src: string;
}

/** Signal classification for recovery percent. */
export type SignalKey = "pos" | "warn" | "neg";

export interface Signal {
  key: SignalKey;
  label: string;
  color: string;
  tint: string;
}
