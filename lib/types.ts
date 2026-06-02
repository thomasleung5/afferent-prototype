/* Core domain types for the Afferent cost-of-service model.
 * Mirrors the shape of data.jsx in the original prototype. */

export type DeptCode =
  | "ADMIN" | "CLK" | "FIN" | "HR" | "IT" | "LEGAL"
  | "BLDG" | "PLAN" | "ENG" | "CODE" | "FIRE" | "PW"
  | "TRANS" | "ENV" | "UTIL" | "PD" | "PARKS" | "LIB"
  | "ANIMAL" | "HOUSING" | "ECON" | "HEALTH" | "COMMUNITY"
  | "AIR_HARBOR" | "GEN_GOV";

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

/** Per-service role allocation entry. `productiveHoursId` is a foreign key
 *  into the productiveHours slice — the source of truth for the role's
 *  display title and authoritative dept. Storing the position id instead
 *  of a freeform role string means role.dept can never drift from the
 *  roster and cross-dept allocations (a BLDG service drawing on a PLAN
 *  position) are first-class. `pct` is 0–100; allocations for one service
 *  should sum to 100 but may temporarily drift during editing. */
export interface RoleAllocation {
  productiveHoursId: string;
  pct: number;
}

/* ---------- Fee-study row metadata ----------
 *
 * Real municipal fee schedules carry richer metadata than flat numeric
 * pricing. The types below extend `Service` with: nested categories,
 * line-item
 * numbering, free-form units, formula / deposit / T&M / pass-through
 * pricing, lifecycle status (new / moved / deleted), legal-authority
 * citations, free-form notes, per-agency peer survey values, and
 * display-text variants for fees that can't be reduced to a single
 * dollar amount.
 *
 * Every extension is an OPTIONAL field on Service so persisted rows
 * without the metadata continue to load and render correctly —
 * undefined is the flat-row default. */

/** User-visible label for a fee's pricing unit (e.g., "Each", "Hour",
 *  "Per $1,000 Valuation"). Drawn from the canonical FEE_UNITS catalog
 *  in lib/data/feeUnits.ts when possible; arbitrary free text is
 *  preserved as a "Custom..." entry. Display layer renders this
 *  alongside the fee value. */
export type FeeUnit = string;

/** Categorical metadata for the pricing unit — hidden from analysts
 *  today; reserved for future analytics and reporting (e.g., grouping
 *  fees by basis or detecting "per-hour" fees across departments).
 *  Always paired with `unitLabel`; CUSTOM means the analyst entered
 *  free text that didn't match any catalog entry. */
export type UnitType =
  | "COUNT" | "PROJECT" | "TIME" | "AREA" | "LENGTH"
  | "LAND" | "VALUATION" | "DEPOSIT" | "CUSTOM";

/** Categorical type for `Service.activityLabel` — what KIND of work
 *  the service represents. Hidden from analysts today; reserved for
 *  future analytics + reporting. CUSTOM means the analyst entered
 *  free text that didn't match any catalog entry. */
export type ActivityType =
  | "INTAKE"      // Application / submittal / intake
  | "ISSUANCE"    // Permit / certificate
  | "REVIEW"      // Plan check / review / audit
  | "INSPECTION"  // Field inspection
  | "MEETING"     // Meeting / consultation
  | "ADJUDICATION" // Appeal / hearing
  | "CUSTOM";

/** Pricing structure label for an active fee — derived from
 *  `Service.formula` via `feeRowKind()` in lib/calc.ts. Lifecycle
 *  (moved / deleted / not-evaluated) lives on FeeScheduleStatus
 *  instead so the two axes stay orthogonal. */
export type FeeRowKind =
  | "flat"               // no formula attached
  | "formula"            // FeeFormula kind in {tiered-valuation,percentage,per-unit,expression}
  | "deposit"            // FeeFormula kind: "deposit"
  | "time-and-materials" // FeeFormula kind: "time-and-materials"
  | "pass-through"       // FeeFormula kind: "pass-through"
  | "statutory";         // FeeFormula kind: "statutory"

/** Lifecycle state of a fee row within this study cycle. Drives the
 *  "filter to new / changed / deleted" affordance and the published
 *  study's migration narrative. */
export type FeeScheduleStatus =
  | "existing"        // carried forward unchanged
  | "new"             // introduced this cycle
  | "renamed"         // same fee, new label
  | "moved"           // shifted to another dept (use Service.movedToDept)
  | "deleted"         // removed this cycle
  | "not-evaluated";  // listed but not analyzed

/** One tier in a tiered-valuation formula. `upTo` is the upper bound
 *  for this tier; the top tier carries upTo: undefined to signal "no
 *  cap". `baseFee` is the flat charge at the tier's lower bound;
 *  `perUnit` × `unitSize` describes the marginal rate inside the tier
 *  (e.g., "$14 per $1,000 of valuation over $2,000" → perUnit 14,
 *  unitSize 1000). */
export interface FeeFormulaTier {
  upTo?: number;
  baseFee: number;
  perUnit?: number;
  unitSize?: number;
}

/** Structured description of a fee that's computed from inputs rather
 *  than charged as a flat amount. Discriminated union — the four kinds
 *  cover almost every formula a real fee study uses; "expression" is
 *  the freeform escape hatch for the rare outliers. */
export type FeeFormula =
  | {
      kind: "tiered-valuation";
      /** What "valuation" means for this fee (e.g., "construction valuation",
       *  "contract amount", "project cost"). Display-only label. */
      basis: string;
      tiers: FeeFormulaTier[];
      /** Optional anchor basis used by `summarizeFee` to render a
       *  representative dollar example (e.g., 1_500_000 → "Tiered (typ.
       *  $13,500 @ $1.5M construction valuation)"). When omitted, the
       *  summarizer falls back to a range across the tier schedule. */
      typicalBasis?: number;
    }
  | {
      kind: "percentage";
      /** What's being percent-of (e.g., "construction valuation"). */
      basis: string;
      /** Rate expressed as a percent (e.g., 5 for "5% of valuation"). */
      rate: number;
      minFee?: number;
      maxFee?: number;
    }
  | {
      kind: "per-unit";
      /** Unit being charged per (e.g., "linear foot of frontage"). */
      unit: string;
      rate: number;
      minFee?: number;
    }
  | {
      kind: "deposit";
      /** Up-front deposit collected at intake. */
      amount: number;
      /** How the balance is billed. "actuals" means staff time + direct
       *  costs are invoiced after the work; a `{ rate, unit }` payload
       *  means the balance accrues at a published rate (e.g.,
       *  `{ rate: 185, unit: "hr" }` for "$185/hr"). */
      balance: "actuals" | { rate: number; unit: string };
    }
  | {
      kind: "time-and-materials";
      /** Published hourly rate, when one exists. Omit for "billed at
       *  actual cost" with no published rate. */
      hourlyRate?: number;
      /** Optional minimum charge regardless of hours logged. */
      minimum?: number;
    }
  | {
      kind: "pass-through";
      /** Optional admin markup percent on top of the third-party cost
       *  (e.g., 10 for "+10% admin"). Omit when the fee is the bare
       *  pass-through amount. */
      markup?: number;
    }
  | {
      kind: "statutory";
      /** Dollar cap set by statute (e.g., 30 for "max $30 per Cal Gov
       *  Code §65091"). Omit when the statute prescribes the fee
       *  exactly with no cap concept; the `Service.legalAuthority`
       *  field carries the citation. */
      cap?: number;
    }
  | {
      /** Freeform expression text for formulas that don't fit the
       *  structured variants above. Surfaced verbatim in the display
       *  layer; not parseable by the engine. */
      kind: "expression";
      text: string;
    };

/** One agency's value in the peer-survey supporting a fee benchmark.
 *  `valueNumber` is set when the agency's fee is reducible to a single
 *  dollar amount comparable to ours; `valueText` carries the display
 *  label when it isn't (e.g., "T&M w/ $500 deposit"). `comparable`
 *  flags whether the row should count toward median / range math —
 *  partial / contextual matches stay in the array for audit but get
 *  excluded from rollups. */
export interface PeerSurveyValue {
  agency: string;
  valueText?: string;
  valueNumber?: number;
  sourceNote?: string;
  comparable: boolean;
}

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
  /** Currently adopted fee. When the fee can't be reduced to a single
   *  dollar amount (T&M, formula, deposit + balance), set `formula`
   *  for the structured pricing description and leave `fee` as a
   *  best-effort numeric estimate (or 0) for chart / total math. */
  fee: number;
  /** Peer-median fee. Computed from the comparable subset of
   *  `peerSurvey` when that's populated; otherwise carried as-is from
   *  the import. */
  peer: number;
  /** Recovery target % (e.g. 100 = full cost recovery) */
  target: number;
  /** Row provenance — set at creation, not mutated by edits. */
  source: SourceTag;
  /** Filename when source === "imported". */
  sourceFile?: string;

  /* ── Fee-study metadata — all optional, all back-compatible.
   *    Flat-row math + UI + export read only the required fields
   *    above and continue to work when these are undefined. */

  /** Line number as published in the adopted resolution (e.g., "PLN-12",
   *  "B-4(a)", "5.2.1"). Stable across cycles when the same fee carries
   *  forward, so it's a stable cross-reference between the audit trail
   *  and the published schedule. */
  feeNo?: string;
  /** Top-level grouping in the published schedule (e.g., "Planning &
   *  Zoning", "Building Permits"). Display + filter axis. */
  category?: string;
  /** Subgrouping under category (e.g., "Discretionary Permits",
   *  "Plan Check"). Optional second-level axis. */
  subcategory?: string;
  /** What KIND of work the service represents — Application / Permit /
   *  Plan Check / Inspection / Meeting / etc. Sourced from the
   *  canonical ACTIVITIES catalog (lib/data/activities.ts) when
   *  possible; arbitrary text is preserved as a "Custom..." entry.
   *  The Volume page reads this through to its Activity column so the
   *  same value appears in both workflows. Distinct from `unitLabel`
   *  below — activity describes WHAT was done, unitLabel describes
   *  HOW the fee is charged. Always paired with `activityType`. */
  activityLabel?: string;
  /** Categorical type for `activityLabel` — hidden from users today;
   *  used by future analytics + reporting. CUSTOM means free text.
   *  See ACTIVITIES in lib/data/activities.ts. */
  activityType?: ActivityType;
  /** Pricing-unit label rendered alongside the fee value (e.g.,
   *  "Each", "Hour", "Per $1,000 Valuation"). Sourced from the
   *  canonical FEE_UNITS catalog when possible; arbitrary text is
   *  preserved as a "Custom..." entry. Always paired with `unitType`. */
  unitLabel?: FeeUnit;
  /** Categorical type for `unitLabel` — hidden from users today; used
   *  by future analytics + reporting. CUSTOM means the analyst entered
   *  free text. See FEE_UNITS in lib/data/feeUnits.ts. */
  unitType?: UnitType;
  /** Lifecycle state of this row in the current study cycle. Defaults
   *  to "existing" semantics when undefined. */
  status?: FeeScheduleStatus;
  /** Structured pricing description for non-flat rows. Display layer
   *  routes through `summarizeFee` (lib/feeDisplay.ts) to render a
   *  deterministic narrative ("Tiered (typ. $13,500 @ $1.5M
   *  construction valuation)", "$500 deposit, balance at actuals",
   *  etc.) instead of a misleading dollar value derived from `fee`.
   *  The numeric `fee` / computed `recommended` / `unitCost` stay
   *  authoritative for recovery math — this field never affects
   *  calculations, only rendering. */
  formula?: FeeFormula;
  /** Free-form analyst notes, one per line. Surfaced in the row
   *  drilldown and the published study's footnotes. */
  notes?: string[];
  /** Citation of the legal authority for this fee (e.g.,
   *  "CA Gov Code §66014", "Health & Safety Code §17951", local
   *  ordinance number). Surfaced in the audit trail. */
  legalAuthority?: string;
  /** Destination department when status === "moved". The `dept` field
   *  still reflects ownership at the start of this cycle (for diff
   *  rendering); `movedToDept` is where the fee lands at the end. */
  movedToDept?: DeptCode;
  /** Per-agency peer-survey values supporting the Fee Benchmarks view.
   *  The numeric `peer` field above is the median of the comparable
   *  subset; this array preserves the individual rows + sourcing for
   *  the audit trail. */
  peerSurvey?: PeerSurveyValue[];
}

/* ---------- Build Model inputs ---------- */

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

/** Per-role productive-hours row. Carries the FTE × hrs-per-FTE inputs
 *  the FBHR denominator needs, decoupled from the labor-cost line items
 *  that live in OperatingLine (costType: "Labor"). FBHR reads hours
 *  from this slice and cost from operating. The `id` mirrors the
 *  originating Position.id when a row was promoted from a seeded
 *  position, so audit trails across the two slices stay traceable. */
export interface ProductiveHoursRow {
  id: string;
  title: string;
  dept: DeptCode;
  fte: number;
  /** Productive hours per FTE per year (e.g. 1720). */
  hours: number;
  productiveHoursBreakdown?: ProductiveHoursBreakdown;
  /** Row provenance — set at creation, not mutated by edits. */
  source: SourceTag;
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

/** Classification of a budget line. "Labor" rows (salaries, benefits,
 *  overtime, payroll taxes, workers comp, wellness, temp labor, burden
 *  accounts) feed the FBHR labor-cost numerator. "Operating" rows feed
 *  the non-labor cost-per-hour denominator. Labor and Operating
 *  pages are filtered views over the same dataset, split by this field.
 *  Required on every line; seeds default to "Operating" and the AI
 *  parser pattern-matches new rows. */
export type CostType = "Labor" | "Operating";

/** Sub-classification for labor budget lines (costType === "Labor").
 *  Two-value taxonomy by design — the field is high-level for FBHR
 *  modeling, reconciliation, reporting, benchmarking, and UI filtering.
 *  Per-account detail stays in `line` / `sourceDept` / source GL.
 *
 *  Salary covers direct compensation: salaries, wages, hourly pay,
 *  overtime, temporary pay, premium pay, shift pay.
 *
 *  Benefits covers labor burden + employee support: retirement,
 *  pension, healthcare, dental/vision, payroll taxes, Medicare,
 *  Social Security, workers comp, wellness, leave accruals, labor
 *  burden accounts.
 *
 *  When uncertain, default to Benefits. Do not invent additional
 *  labor types. */
export type LaborType = "Salary" | "Benefits";

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
  /** Budget-line classification. See CostType. */
  costType: CostType;
  /** Sub-classification when costType === "Labor". See LaborType. Absent
   *  on Operating rows. Optional in the type so legacy labor rows that
   *  pre-date this field don't crash readers; production rows are
   *  always stamped (parser heuristic, seed init, migration backfill). */
  laborType?: LaborType;
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
// InstDeptCode is the full institutional dept list (indirect cost centers
// + direct fee-eligible depts). Its source of truth is INST_DEPTS in
// lib/data/institutionalDepts.ts — the union is derived from the catalog
// so a single edit there flows through every consumer that types against
// the union. Re-exported here so callers can keep importing the type
// alongside DeptCode + BasisKey from one module.
//
// BasisKey is the denominator the step-down engine uses to split a pool
// across receiving depts; it lives here so AllocationBasis can reference
// it without a circular dep into capBasisRouting.
// ---------------------------------------------------------------------------

import type { InstDeptCode } from "./data/institutionalDepts";
export type { InstDeptCode };

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
  deptCode: InstDeptCode | "OTHER";
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
  deptCode: InstDeptCode | "OTHER";
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
  /** Center's identity key (glCode for imported centers,
   *  `seed:center:NAME` synth for centers with no glCode). Required: the
   *  engine routes via this; `center` is denormalized display text only.
   *  Stamped on every pool at seed time (lib/data/cap.ts), on import
   *  (mergeCapBundle), and on manual creation (addCapCenter / addCapPool
   *  via the caller's center identity). */
  centerGlCode: string;
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
  directTo?: InstDeptCode;
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

/* ---------- Functional Allocation ----------
 *
 * After overhead costs are allocated, each department's fully burdened cost
 * (direct labor + departmental operating + allocated CAP) is broken
 * into operational functional buckets — Plan Check, Public Counter,
 * Long Range Planning, Code Enforcement, etc. Each bucket carries a
 * recoverability target (0–100%) that classifies the fraction of the
 * bucket's activity that is appropriately recovered through fees. The
 * implied FBHR from the recoverable portion becomes the downstream rate
 * used by Cost of Service calculations when the functional-allocation
 * FBHR feature is enabled. Until then this layer is informational only
 * and the existing FBHR engine continues to drive recovery math.
 *
 * This is intentionally distinct from CAP pools: CAP distributes shared
 * support cost INTO departments; Functional Allocation classifies the
 * resulting departmental cost as fee-recoverable vs. non-recoverable. */
export interface FunctionalAllocationBucket {
  id: string;
  dept: DeptCode;
  /** Operational bucket label (e.g. "Plan Check", "Public Counter").
   *  Free-form so jurisdictions can match their organizational vocabulary. */
  name: string;
  /** Optional longer explanation surfaced in the drilldown. */
  description?: string;
  /** Fraction of this bucket's activity recovered through user fees,
   *  as a percent (0–100). Drives recoverableCost and recoverableHours. */
  recoverabilityPct: number;
  /** Share of the dept's total productive hours assigned to this bucket,
   *  as a percent (0–100). Drives the derived directHours per bucket
   *  (deptProductiveHours × hoursSharePct / 100). Σ across a dept's
   *  buckets should normally reconcile to 100% but may temporarily
   *  drift while the analyst is editing. */
  hoursSharePct: number;
  /** When true, this bucket's direct hours are included in the dept's
   *  recoverable-FBHR denominator (Σ directHours over rate-basis
   *  buckets). When false, the bucket's cost still contributes to the
   *  recoverable numerator if recoverabilityPct > 0, but its hours are
   *  excluded from the rate basis — useful for adjustments where
   *  non-fee-supported activity (long-range planning, CIP, governance)
   *  is removed from the hourly rate denominator. Defaults
   *  to true when recoverabilityPct > 0 at row creation; analysts may
   *  override and the value persists. */
  rateBasisHours: boolean;
  /** Row provenance — set at creation, not mutated by edits. */
  source: SourceTag;
  notes?: string;
}

/** Signal classification for recovery percent. */
type SignalKey = "pos" | "warn" | "neg";

export interface Signal {
  key: SignalKey;
  label: string;
  color: string;
  tint: string;
}
