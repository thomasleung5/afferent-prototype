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

/* ---------- Build Model inputs ---------- */

export type PositionFlag = "title-changed" | "missing-hours";

export interface Position {
  id: string;
  title: string;
  dept: DeptCode;
  fte: number;
  salary: number;
  benefits: number;
  /** Productive hours per FTE per year (e.g. 1720). */
  hours: number;
  flag?: PositionFlag;
}

export type OpDept = DeptCode | "SHARED:CDS";

export type OpCategory =
  | "Software & subscriptions"
  | "Professional services"
  | "Training & travel"
  | "Office & supplies"
  | "Memberships & dues"
  | "Vehicles & equipment"
  | "Legal noticing"
  | "Capital outlay"
  | "Other";

export interface OperatingLine {
  id: string;
  code: string;
  dept: OpDept;
  category: OpCategory;
  line: string;
  amount: number;
  source: string;
  include: boolean;
  excludeReason?: string;
}

/** Indirect overhead allocated to direct departments by the CAP. */
export interface CapPool {
  id: string;
  center: string;
  pool: string;
  amount: number;
  basis: string;
  receiving: string;
  recoverability: string;
  review: "Reviewed" | "Review";
}

/** Final CAP allocation, per direct department. */
export interface CapAllocation {
  dept: DeptCode;
  /** Total CAP $ allocated to this department. */
  allocated: number;
}

export interface WorkloadRow {
  /** Matches a `Service.id` from `lib/data/services.ts`. */
  id: string;
  prior: number | null;
  current: number | null;
  unit: string;
  source: "imported" | "carry-forward" | "manual" | "missing";
  status: "Validated" | "Imported" | "Reused" | "Manual" | "Missing";
  sourceFile?: string;
  flag?: "missing-current-volume" | "carry-forward";
}

export interface PolicyTarget {
  id: string;
  dept: DeptCode;
  /** Recovery target as a percent (e.g. 70). */
  target: number;
  note: string;
}

export interface PolicyException {
  id: string;
  /** Service id from `lib/data/services.ts`, or a free-form fee name. */
  fee: string;
  target: number;
  note: string;
}

/** Signal classification for recovery percent. */
export type SignalKey = "pos" | "warn" | "neg";

export interface Signal {
  key: SignalKey;
  label: string;
  color: string;
  tint: string;
}
