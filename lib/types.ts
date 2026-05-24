/* Core domain types for the Afferent cost-of-service model.
 * Mirrors the shape of data.jsx in the original prototype. */

export type DeptCode = "PLAN" | "BLDG" | "ENG" | "PARKS" | "PD" | "FIRE";

interface Department {
  code: DeptCode;
  name: string;
  /** Fully-burdened hourly rate */
  fbhr: number;
}

export type DepartmentMap = Record<DeptCode, Department>;

/** Provenance tag for a row's origin. Set once at row creation (seed,
 *  import, or manual add); never mutated by subsequent edits. The display
 *  layer pairs this with an optional `sourceFile` to render a Source pill. */
export type SourceTag = "seed" | "imported" | "manual";

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

/* ---------- Build Model inputs ---------- */

type PositionFlag = "title-changed" | "missing-hours";

export interface Position {
  id: string;
  title: string;
  dept: DeptCode;
  fte: number;
  salary: number;
  benefits: number;
  /** Productive hours per FTE per year (e.g. 1720). */
  hours: number;
  /** Optional per-row breakdown of nonproductive-hour assumptions used in
   *  the productive-hours drilldown. Any field that's undefined falls back
   *  to the citywide default in lib/productiveHours.ts. The breakdown is
   *  informational — the authoritative productive-hour value used by
   *  downstream rate calculations is `hours`. */
  productiveHoursBreakdown?: ProductiveHoursBreakdown;
  flag?: PositionFlag;
  /** Row provenance — set at creation, not mutated by edits. */
  source: SourceTag;
  /** Filename when source === "imported". */
  sourceFile?: string;
}

export interface ProductiveHoursBreakdown {
  vacation?: number;
  sick?: number;
  holidays?: number;
  admin?: number;
  training?: number;
  other?: number;
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
  /** Raw department / division / program name as written in the source
   *  document, preserved for audit trace. Populated by the AI parser;
   *  null on seed / manual rows. The normalized `dept` is what the
   *  engine uses — `sourceDept` is what reviewers see to confirm the
   *  model's mapping. */
  sourceDept?: string;
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
  | "PRA" | "CONTRACT" | "SQFT" | "VEHICLE" | "COMMITS"
  | "RECORDS" | "EQUAL" | "MEETING_HOURS" | "MEETINGS" | "APPLICATIONS"
  | "RECRUITMENTS" | "CLAIMS" | "RENTAL_HOURS"
  | "DIRECT";

/** One receiver row inside a basis's unit schedule. `glCode` is the
 *  routing identity used by the engine. `deptCode` is classification
 *  metadata only — multiple receivers can share a deptCode and the
 *  engine never routes by it. `units` is the raw allocation-factor unit
 *  count for this receiver under this basis (e.g. FTE count, sq ft). */
export interface BasisUnitReceiver {
  glCode: string;
  dept: string;
  deptCode: MatrixDeptCode | "OTHER";
  units: number;
}

/** Basis-level allocation schedule. One row per AllocationBasis the
 *  document publishes a unit schedule for. The same schedule serves
 *  every pool whose `basisId` points here — the engine derives each
 *  pool's per-receiver share from these units, never from a per-pool
 *  duplicate. */
export interface BasisUnitRow {
  basisId: string;
  /** Denormalized basis name so exports / legacy readers don't need to
   *  go through the AllocationBasis catalog. Kept in sync on edit. */
  basis: string;
  /** Where the unit counts came from — typically the document filename
   *  or section that produced the schedule. Optional. */
  source?: string;
  receivers: BasisUnitReceiver[];
}

/** One receiver inside a DIRECT pool's explicit allocation. DIRECT
 *  pools don't have basis denominators (units) — the document publishes
 *  a percent split directly. */
export interface DirectAllocationReceiver {
  glCode: string;
  dept: string;
  deptCode: MatrixDeptCode | "OTHER";
  /** Receiver's share of the pool, 0–100. Sum across receivers in one
   *  DIRECT row should equal 100. */
  percent: number;
}

/** Per-DIRECT-pool routing. DIRECT-basis pools skip the step-down's
 *  basis-driven split and route directly to the receivers listed here. */
export interface DirectAllocationRow {
  poolId: string;
  /** Denormalized pool name for traceability in exports. */
  pool: string;
  receivers: DirectAllocationReceiver[];
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
  /** Net allocable dollars for this pool — the amount the step-down engine
   *  distributes downstream. Denormalized derived value:
   *  capCenterTotals[center] × allocationPercent / 100. Kept in sync by
   *  updateCapPool/updateCenterTotal so downstream readers (step-down
   *  engine, exports) can ignore the percent indirection. */
  amount: number;
  /** Foreign key into BuildState.allocationBases. Drives which catalog
   *  entry's source/methodology display under the pool's basis cell, AND
   *  which BasisUnitRow supplies the per-receiver units for the schedule. */
  basisId: string;
  /** Denormalized display text — kept in sync with the catalog name on
   *  selection so exports/legacy readers don't need catalog access. */
  basis: string;
  receiving: string;
  /** Total personnel cost reported for this pool — salaries + benefits.
   *  Informational breakdown the source document may publish alongside
   *  `amount`; the engine does not use it for routing. Optional. */
  personnelCost?: number;
  /** Total operating cost reported for this pool — non-personnel spend
   *  (contracts, supplies, services). Informational; engine does not use
   *  it for routing. Optional. */
  operatingCost?: number;
  /** Disallowed costs excluded from allocation (capital outlay, one-time
   *  charges, grant-funded items, etc.). Captured from the source
   *  document for traceability. The pool's `amount` should already
   *  exclude this figure (net allocable = gross − disallowed); the
   *  engine reads `amount` directly. Optional. */
  disallowedCost?: number;
  /** Free-text policy explanation (e.g. "Fully recoverable", "Excluded —
   *  public benefit"). Surfaced in exports for context. */
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

export interface VolumeRow {
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
type SignalKey = "pos" | "warn" | "neg";

export interface Signal {
  key: SignalKey;
  label: string;
  color: string;
  tint: string;
}
