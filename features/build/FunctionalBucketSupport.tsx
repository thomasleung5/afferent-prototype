/* Shared functional-bucket support panel used inside the Cost of
 * Service drilldowns (both the per-service row and the per-department
 * RateDerivation row) and the Functional Allocation drilldowns
 * (per-activity and per-dept).
 *
 * Two layouts:
 *  - Dept-wide (no bucketId): 4-col activity table (Activity / Total
 *    Cost / Fee-Recoverable Cost / Direct Hours) +
 *    MethodologyFormulas summary.
 *  - Single-activity (bucketId set): MethodologyFormulas only,
 *    scoped to that activity.
 *
 * MethodologyFormulas renders three inline workpaper formulas in the
 * Labor "Formula chip = substituted numbers = result" pattern.
 *
 * Data source: derived.functionalAllocation. Per-bucket cost
 * components are split from the dept's engine-derived dollar totals
 * by the bucket's hoursSharePct — the same split rule used inside
 * deriveFunctionalAllocation. */

import { Link } from "@tanstack/react-router";
import { fmt } from "@/lib/format";
import type { DeptCode } from "@/lib/types";
import { useBuildState } from "@/lib/store";
import {
  FormulaLine, FormulaPanel, MiniTable, MonoLabel,
  type MiniTableColumn,
} from "@/components/ui";

interface Props {
  dept: DeptCode;
  /** When provided, the equation block adds a "Service cost" line
   *  computed as `serviceHours × FBHR`. Omit for the dept-level
   *  drilldown where this isn't applicable. */
  service?: {
    name: string;
    hours: number;
  };
  /** Scope the bucket table to a single bucket id (the rest of the
   *  dept's buckets are omitted). The equation block stays dept-level
   *  so the reader still sees how this bucket contributes to the
   *  dept's FBHR. Omit for the dept-wide workpaper view. */
  bucketId?: string;
  /** When true, render the cross-page nav strip (upstream cost inputs
   *  + downstream rate consumers) below the workpaper. Used by the
   *  Functional Allocation drilldowns to anchor the dept inside the
   *  broader Build Model workflow. Off by default so Cost of Service
   *  drilldowns — which already have their own page-level cross-nav —
   *  don't pick up a redundant duplicate strip. */
  crossNav?: boolean;
}

export function FunctionalBucketSupport({ dept, service, bucketId, crossNav = false }: Props) {
  const { derived } = useBuildState();
  const fa = derived.functionalAllocation;
  const engine = derived.fbhr[dept];
  const dd = fa.byDept[dept];

  if (!dd) {
    return (
      <div style={{
        padding: "12px 14px",
        background: "var(--paper)", border: "1px solid var(--rule)",
        fontSize: 12, color: "var(--ink-3)",
      }}>
        No functional allocation configured for this department.
      </div>
    );
  }

  // Per-bucket cost-component splits, sized by hoursSharePct against
  // the dept's engine-derived dollar totals. Mirrors the share rule
  // used inside deriveFunctionalAllocation, so the totals reconcile to
  // dept fully-burdened cost when Σ hoursSharePct = 100%.
  const sourceBuckets = bucketId != null
    ? dd.buckets.filter((b) => b.bucket.id === bucketId)
    : dd.buckets;
  const supportRows: SupportRow[] = sourceBuckets.map((b) => {
    const share = b.bucket.hoursSharePct / 100;
    return {
      id: b.bucket.id,
      name: b.bucket.name,
      directLabor: (engine?.directDollars ?? 0) * share,
      operating:   (engine?.operatingDollars ?? 0) * share,
      overhead:    (engine?.capDollars ?? 0) * share,
      fullyBurdened: b.fullyBurdenedCost,
      recoverabilityPct: b.bucket.recoverabilityPct,
      recoverableCost: b.recoverableCost,
      directHours: b.directHours,
      rateBasis: b.bucket.rateBasisHours,
      bucketHoursSharePct: b.bucket.hoursSharePct,
    };
  });

  const recoverableFbhr = dd.recoverableFbhr;

  // Sums across the rendered rows so the totals row reconciles exactly
  // to what the user sees in the table.
  const sum = (key: keyof Pick<SupportRow,
    "directLabor" | "operating" | "overhead" | "fullyBurdened" | "recoverableCost" | "directHours">) =>
    supportRows.reduce((a, r) => a + r[key], 0);
  const totals = {
    directLabor: sum("directLabor"),
    operating:   sum("operating"),
    overhead:    sum("overhead"),
    fullyBurdened: sum("fullyBurdened"),
    recoverableCost: sum("recoverableCost"),
    directHours: sum("directHours"),
    rateBasisHours: dd.rateBasisDirectHours,
  };

  // Equation block is a dept-level summary — show it on dept-wide
  // drilldowns (Cost of Service per-service / per-dept; FA dept
  // summary) and hide it when scoped to a single bucket (FA bucket-row
  // drilldown). The bucket row already conveys recoverable / hours /
  // FBHR through the table itself.
  const showEquation = bucketId == null;

  // Compact mode: scoped to a single activity. Drop columns that
  // duplicate the parent row (Activity, Fee Recoverability %, Direct
  // Productive Hours, Include in DPH — the last three already appear
  // in the bucket-row drilldown's ActivityConfigPanel). Leaves the
  // cost-component breakdown: Labor / Operating / Overhead / Total
  // cost / Fee-Recoverable Cost.
  const compact = bucketId != null;

  // Single-activity (compact) drilldown: step-by-step methodology
  // from dept cost → activity cost → fee-recoverable cost. FBHR
  // formula is omitted — it's a dept-level rate that lives in the
  // summary-table drilldown above.
  if (compact) {
    const onlyBucket = supportRows[0];
    if (!onlyBucket) return null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <ActivityCostFormulas
          deptLabor={engine.directDollars}
          deptOperating={engine.operatingDollars}
          deptOverhead={engine.capDollars}
          deptTotalCost={dd.fullyBurdenedCost}
          allocationPct={onlyBucket.bucketHoursSharePct}
          activityCost={onlyBucket.fullyBurdened}
          recoverabilityPct={onlyBucket.recoverabilityPct}
          recoverableCost={onlyBucket.recoverableCost}
        />
        {crossNav && <CrossNavLinks dept={dept}/>}
      </div>
    );
  }

  // Dept-wide (summary-table) drilldown: just the FBHR formula. The
  // upstream Total Cost / Fee-Recoverable Cost derivations live in
  // the per-activity drilldown so the dept view stays focused on the
  // FBHR result.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <BucketSupportTable rows={supportRows} totals={totals} compact={compact}/>
      <DeptFbhrFormula
        recoverableCost={dd.recoverableCost}
        directProductiveHours={dd.rateBasisDirectHours}
        recoverableFbhr={recoverableFbhr}
        service={service}
      />
      {crossNav && <CrossNavLinks dept={dept}/>}
    </div>
  );
}

/** Single-row cross-nav strip surfaced inside every FA drilldown:
 *  upstream cost-source pages (Labor / Operating / Overhead).
 *  Same `?dept=…` query pattern the Cost of Service / Fee Benchmarks
 *  links use for `?serviceId=…`, so the destination page lands the
 *  user on the matching dept row with its drilldown pre-opened. */
function CrossNavLinks({ dept }: { dept: DeptCode }) {
  const links: { to: string; text: string }[] = [
    { to: "/build/labor",        text: "View labor" },
    { to: "/build/operating",    text: "View operating" },
    { to: "/build/cap",          text: "View overhead" },
  ];
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", alignItems: "baseline",
      paddingTop: 4,
      fontSize: "var(--t-l8)", lineHeight: 1.6,
    }}>
      {links.map((l, i) => (
        <span key={l.to} style={{ display: "inline-flex", alignItems: "baseline", gap: 14, marginRight: 14 }}>
          {i > 0 && (
            <span aria-hidden style={{ color: "var(--rule-strong)" }}>·</span>
          )}
          <Link
            to={l.to}
            search={{ dept }}
            style={{
              fontSize: "var(--t-l8)", color: "var(--accent)",
              textDecoration: "underline", textUnderlineOffset: 3,
            }}
          >{l.text} →</Link>
        </span>
      ))}
    </div>
  );
}

/** Compact horizontal totals strip rendered below the dept-wide
 *  activity table. Surfaces Labor / Operating / Overhead aggregates
 *  that used to be per-row columns — kept as supporting workpaper
 *  detail so the activity table itself reads as a clean comparative
 *  layer. */
/** Step-by-step workpaper for the per-activity drilldown:
 *  dept Total Cost → Activity Cost (× allocation %) → Fee-Recoverable
 *  Cost (× recoverability %). Each line uses the same Formula chip +
 *  substituted-numbers pattern as the Labor page. */
function ActivityCostFormulas({
  deptLabor, deptOperating, deptOverhead,
  deptTotalCost,
  allocationPct, activityCost,
  recoverabilityPct, recoverableCost,
}: {
  deptLabor: number;
  deptOperating: number;
  deptOverhead: number;
  deptTotalCost: number;
  allocationPct: number;
  activityCost: number;
  recoverabilityPct: number;
  recoverableCost: number;
}) {
  return (
    <FormulaPanel>
      <FormulaLine
        expr="Department Total Cost = Labor + Operating + Overhead"
        subst={`= ${fmt.dollarsK(deptLabor)} + ${fmt.dollarsK(deptOperating)} + ${fmt.dollarsK(deptOverhead)}`}
        result={fmt.dollars(deptTotalCost)}
      />
      <FormulaLine
        expr="Activity Cost = Department Total Cost × Allocation %"
        subst={`= ${fmt.dollars(deptTotalCost)} × ${Math.round(allocationPct)}%`}
        result={fmt.dollars(activityCost)}
      />
      <FormulaLine
        expr="Fee-Recoverable Cost = Activity Cost × Fee Recoverability %"
        subst={`= ${fmt.dollars(activityCost)} × ${Math.round(recoverabilityPct)}%`}
        result={fmt.dollars(recoverableCost)}
      />
    </FormulaPanel>
  );
}

/** Dept-level FBHR formula rendered below the dept-wide activity
 *  table. Adds a Service cost line when a service is passed (Cost of
 *  Service per-service drilldown). */
function DeptFbhrFormula({
  recoverableCost, directProductiveHours, recoverableFbhr, service,
}: {
  recoverableCost: number;
  directProductiveHours: number;
  recoverableFbhr: number | null;
  service?: { name: string; hours: number };
}) {
  const fbhrLabel = recoverableFbhr != null
    ? `$${Math.round(recoverableFbhr)}/hr`
    : "—";
  const fbhrLine = (
    <FormulaLine
      expr="FBHR = Fee-Recoverable Cost ÷ Direct Hours"
      subst={`= ${fmt.dollars(recoverableCost)} ÷ ${directProductiveHours > 0 ? `${fmt.int(directProductiveHours)} hrs` : "0"}`}
      result={fbhrLabel}
    />
  );
  if (!service) return fbhrLine;
  return (
    <FormulaPanel>
      {fbhrLine}
      <FormulaLine
        expr={`Service cost — ${service.name} = ${service.hours} hrs × FBHR`}
        subst={`= ${service.hours} × ${fbhrLabel}`}
        result={recoverableFbhr != null ? fmt.dollars(service.hours * recoverableFbhr) : "—"}
      />
    </FormulaPanel>
  );
}

interface SupportRow {
  id: string;
  name: string;
  directLabor: number;
  operating: number;
  overhead: number;
  fullyBurdened: number;
  recoverabilityPct: number;
  recoverableCost: number;
  directHours: number;
  rateBasis: boolean;
  bucketHoursSharePct: number;
}

type ColKey =
  | "name"
  | "directLabor"
  | "operating"
  | "overhead"
  | "fullyBurdened"
  | "recoverabilityPct"
  | "recoverableCost"
  | "productiveHours"
  | "directHours"
  | "rateBasisFlag";

interface SupportCol {
  key: ColKey;
  label: string;
  width: string;
  align?: "left" | "right";
}

const ALL_COLS: SupportCol[] = [
  { key: "name",              label: "Activity",                width: "minmax(160px, 1.6fr)" },
  { key: "directLabor",       label: "Labor",                   width: "100px", align: "right" },
  { key: "operating",         label: "Operating",               width: "100px", align: "right" },
  { key: "overhead",          label: "Overhead",                width: "100px", align: "right" },
  { key: "fullyBurdened",     label: "Total cost",              width: "120px", align: "right" },
  { key: "recoverabilityPct", label: "Fee Recoverability %",    width: "150px", align: "right" },
  { key: "recoverableCost",   label: "Fee-Recoverable Cost",    width: "160px", align: "right" },
  { key: "productiveHours",   label: "Productive Hours",        width: "140px", align: "right" },
  { key: "directHours",       label: "Direct Hours",            width: "120px", align: "right" },
  { key: "rateBasisFlag",     label: "Included in FBHR",        width: "130px", align: "right" },
];

/** Columns hidden in compact (single-activity) mode — these duplicate
 *  information already on the parent row + the editable config panel.
 *  Leaves the horizontal cost-component breakdown
 *  (Labor / Operating / Overhead / Total cost / Fee-Recoverable Cost). */
const COMPACT_HIDE: ReadonlySet<ColKey> = new Set([
  "name", "recoverabilityPct", "productiveHours", "directHours", "rateBasisFlag",
]);

/** Columns hidden in dept-wide view — Labor / Operating / Overhead are
 *  surfaced as a compact totals strip below the table instead of
 *  per-row, so the comparative activity table stays scannable. */
const DEPT_HIDE: ReadonlySet<ColKey> = new Set([
  "directLabor", "operating", "overhead",
  "recoverabilityPct", "rateBasisFlag",
]);

function renderCell(key: ColKey, r: SupportRow): React.ReactNode {
  switch (key) {
    case "name":          return <span style={{ color: "var(--ink)" }}>{r.name}</span>;
    case "directLabor":   return fmt.dollarsK(r.directLabor);
    case "operating":     return fmt.dollarsK(r.operating);
    case "overhead":      return fmt.dollarsK(r.overhead);
    case "fullyBurdened": return (
      <span style={{ color: "var(--ink)" }}>{fmt.dollarsK(r.fullyBurdened)}</span>
    );
    case "recoverabilityPct": return `${r.recoverabilityPct}%`;
    case "recoverableCost": return (
      <span style={{ color: r.recoverableCost > 0 ? "var(--ink)" : "var(--ink-3)" }}>
        {fmt.dollarsK(r.recoverableCost)}
      </span>
    );
    case "productiveHours": return (
      <span style={{ color: r.directHours > 0 ? "var(--ink)" : "var(--ink-3)" }}>
        {r.directHours > 0 ? fmt.int(r.directHours) : "—"}
      </span>
    );
    case "directHours": {
      // Effective Direct Hours = Productive Hours when included in
      // FBHR, 0 otherwise. The activity table's column header marks
      // this as the FBHR denominator contribution.
      const value = r.rateBasis ? r.directHours : 0;
      return (
        <span
          title={r.rateBasis
            ? "Included in FBHR"
            : "Excluded from FBHR — Direct Hours = 0"}
          style={{ color: value > 0 ? "var(--ink)" : "var(--ink-3)" }}
        >
          {value > 0 ? fmt.int(value) : "—"}
        </span>
      );
    }
    case "rateBasisFlag": return (
      <span style={{
        color: r.rateBasis ? "var(--accent)" : "var(--ink-3)",
        fontWeight: r.rateBasis ? 700 : 400,
      }}>
        {r.rateBasis ? "✓" : "—"}
      </span>
    );
  }
}

function renderTotal(key: ColKey, totals: TotalsShape): React.ReactNode {
  switch (key) {
    case "name": return <MonoLabel>Total</MonoLabel>;
    case "directLabor":   return fmt.dollarsK(totals.directLabor);
    case "operating":     return fmt.dollarsK(totals.operating);
    case "overhead":      return fmt.dollarsK(totals.overhead);
    case "fullyBurdened": return fmt.dollarsK(totals.fullyBurdened);
    case "recoverabilityPct": return null;
    case "recoverableCost": return fmt.dollarsK(totals.recoverableCost);
    case "productiveHours": return totals.directHours > 0 ? fmt.int(totals.directHours) : "—";
    case "directHours":     return totals.rateBasisHours > 0 ? fmt.int(totals.rateBasisHours) : "—";
    case "rateBasisFlag":   return totals.rateBasisHours > 0 ? fmt.int(totals.rateBasisHours) : "—";
  }
}

interface TotalsShape {
  directLabor: number;
  operating: number;
  overhead: number;
  fullyBurdened: number;
  recoverableCost: number;
  directHours: number;
  rateBasisHours: number;
}

function BucketSupportTable({
  rows, totals, compact = false,
}: {
  rows: SupportRow[];
  totals: TotalsShape;
  /** When true, hide columns and the totals row that duplicate the
   *  parent context (Activity, Fee Recoverability %, Direct Productive
   *  Hours, Include in DPH). Used by the bucket-row drilldown on the
   *  FA page so the workpaper doesn't echo the parent table. */
  compact?: boolean;
}) {
  const hide = compact ? COMPACT_HIDE : DEPT_HIDE;
  const visibleCols: MiniTableColumn[] = ALL_COLS.filter((c) => !hide.has(c.key));
  // Skip totals when the table represents a single activity — they'd
  // just echo the lone row.
  const showTotals = !compact && rows.length > 1;

  return (
    <div style={{
      fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.4,
    }}>
      <MiniTable
        columns={visibleCols}
        rows={rows}
        rowKey={(r) => r.id}
        renderCell={(col, r) => renderCell(col.key as ColKey, r)}
        renderFooter={
          showTotals
            ? (col) => renderTotal(col.key as ColKey, totals)
            : undefined
        }
        emptyState="No functional buckets."
      />
    </div>
  );
}

