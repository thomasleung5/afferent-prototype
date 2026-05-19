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

/** Provenance tag for a row's origin. Set once at row creation (seed,
 *  import, or manual add); never mutated by subsequent edits. The display
 *  layer pairs this with an optional `sourceFile` to render a Source pill. */
export type SourceTag = "seed" | "imported" | "manual" | "carry-forward" | "missing";

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
  /** Row provenance — set at creation, not mutated by edits. */
  source: SourceTag;
  /** Filename when source === "imported". */
  sourceFile?: string;
}

export interface EnrichedService extends Service {
  /** fee / cost * 100 */
  recovery: number;
  /** (cost − fee) × volume — annual under-recovery */
  gap: number;
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
  /** Row provenance — set at creation, not mutated by edits. */
  source: SourceTag;
  /** Filename when source === "imported". */
  sourceFile?: string;
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
  /** Row provenance — set at creation, not mutated by edits. Was previously
   *  a free-form string holding AI-extracted GL/fund composition
   *  ("General Fund · 53120"); that data was never displayed and the field
   *  is now the standard SourceTag enum. */
  source: SourceTag;
  /** Filename when source === "imported". */
  sourceFile?: string;
  include: boolean;
  excludeReason?: string;
}

// ---------------------------------------------------------------------------
// CAP step-down primitives
//
// MatrixDeptCode is the full institutional dept list (indirect cost centers
// + direct fee-eligible depts). BasisKey is the denominator the step-down
// engine uses to split a pool across receiving depts. Both live here so
// AllocationBasis can reference them without a circular dep into capStepDown.
// ---------------------------------------------------------------------------

export type MatrixDeptCode =
  // Indirect cost centers
  | "BLDG_USE" | "EQUIP" | "COUNCIL" | "CMGR" | "CLERK" | "FAS"
  | "ATTY" | "INS" | "CMTE"
  // Direct (fee-modeled or otherwise receiving final allocation)
  | "PLAN" | "BLDG" | "ENG" | "PW" | "PARKS" | "PD" | "FIRE";

export type BasisKey =
  | "FTE" | "EXPEND" | "EXPEND_X" | "EXPEND_PW" | "PAYROLL" | "ACCT" | "AGENDA"
  | "PRA" | "CONTRACT" | "SQFT" | "VEHICLE" | "COMMITS" | "DIRECT";

/** One row of a cost pool's per-receiver allocation matrix as published in
 *  the source document's "X - Allocations" schedule. Receivers' `amount`
 *  values sum (within rounding) to the parent pool's `amount`. */
export interface PoolReceiver {
  /** Receiving budget-unit name exactly as written in the document. */
  dept: string;
  /** Document's own account code. Unique within a single document; use as
   *  the receiver/center identity key. Stable within one city + fiscal
   *  year — NOT a cross-city join key. */
  glCode?: string;
  /** MatrixDeptCode for the receiver, or "OTHER" when the document points
   *  at a fund/program with no matching code (CIP funds, grant funds,
   *  "All Other"). Kept as MatrixDeptCode | "OTHER" rather than a narrower
   *  union so step-down receivers and unmapped fund rows can coexist.
   *  Classification, NOT identity — multiple receivers can share a deptCode
   *  (e.g. several Public Works divisions). Use glCode for per-row identity. */
  deptCode: MatrixDeptCode | "OTHER";
  /** Raw allocation-factor units for this receiver (the "Allocation Units"
   *  column on the schedule). Omitted when the document doesn't print one. */
  units?: number;
  /** Receiver's share of the pool, 0–100. */
  percent: number;
  /** Dollar amount allocated to this receiver — derived as
   *  pool.amount × percent / 100 and rounded to whole dollars. */
  amount: number;
  /** Published allocation-detail columns from full-cost CAP schedules.
   *  Optional — used for reconciliation/display when the document prints
   *  them; the engine derives its own first/second/total figures from the
   *  receiver percent schedule. */
  grossAllocation?: number;
  directBilled?: number;
  firstAllocation?: number;
  secondAllocation?: number;
  total?: number;
}

/** Indirect overhead allocated to direct departments by the CAP. */
export interface CapPool {
  id: string;
  center: string;
  pool: string;
  /** This pool's claimed share of the source department's total cost. The
   *  source of truth for the "%" column. Sum of allocationPercent across a
   *  center should normally reconcile to 100% but may temporarily drift
   *  during editing. */
  allocationPercent: number;
  /** Denormalized derived value: capCenterTotals[center] × allocationPercent / 100.
   *  Kept in sync by updateCapPool/updateCenterTotal so downstream readers
   *  (step-down engine, exports) can ignore the percent indirection. */
  amount: number;
  /** Fee-eligibility policy: the share of `amount` that is allowed to flow
   *  into fee-supported allocations. Range 0-100. The step-down engine
   *  distributes (amount × eligiblePercent / 100); the remainder is the
   *  excluded amount (covered by the General Fund or otherwise out of fee
   *  scope). Default 100 — fully fee-eligible. */
  eligiblePercent: number;
  /** Foreign key into BuildState.allocationBases. Drives which catalog
   *  entry's source/methodology display under the pool's basis cell. */
  basisId: string;
  /** Denormalized display text — kept in sync with the catalog name on
   *  selection so exports/legacy readers don't need catalog access. */
  basis: string;
  receiving: string;
  /** Optional per-receiver allocation breakdown imported from the source
   *  document. Populated by capPoolsToExtractionResult when the model
   *  returns a structured receivers array; absent for legacy / hand-built
   *  pools that only carry the free-text `receiving` label. The step-down
   *  engine does not yet consume this field — it remains the imported
   *  reference for reconciliation and future use. */
  receivers?: PoolReceiver[];
  /** Policy explanation surfaced as the Eligible % tooltip. Used in exports. */
  recoverability: string;
  review: "Reviewed" | "Review";
}

/** Reusable allocation basis (denominator) used by one or more cost pools.
 *  The catalog is study-scoped — users can pick from canonical bases or
 *  create their own. */
export interface AllocationBasis {
  id: string;
  name: string;
  /** Where the denominator comes from — e.g. "HRIS import", "Clerk report". */
  source: string;
  /** Optional longer methodology explanation, shown on hover/drilldown. */
  methodologyNote?: string;
  validationStatus?: "verified" | "draft" | "needs-review";
  createdBy?: string;
  createdAt: string;
  /** Which DRIVERS column the step-down engine pulls denominators from.
   *  This is what makes basis selection a real modeling input — switching
   *  a pool's basisId switches which driver column splits its dollars. */
  driverKey: BasisKey;
  /** Only meaningful when driverKey === "DIRECT": the single dept that
   *  receives the entire pool. (Direct allocations skip the step-down split.)
   *  User-created Direct bases without this field will land in leakage. */
  directTo?: MatrixDeptCode;
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
  /** Row provenance — set at creation, not mutated by edits. Uses the
   *  shared SourceTag enum; "seed" was added in the source standardization. */
  source: SourceTag;
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
