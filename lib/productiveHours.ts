/* Productive-hours breakdown helper. Drives the row-level drilldown on
 * the Direct Labor page (features/build/PositionsTable.tsx) and any other
 * surface that needs to audit how a position's annual productive hours
 * were derived from gross calendar hours.
 *
 * The helper is pure: given a row plus the citywide defaults, it
 * resolves each deduction (row override > default) and returns the
 * breakdown. The Position.hours field remains the authoritative
 * productive-hour value used by the rate engine; the breakdown is the
 * implied composition of that value.
 */

import type { Position, ProductiveHoursBreakdown } from "@/lib/types";

export type ProductiveHoursDeductionKey =
  | "vacation" | "sick" | "holidays" | "admin" | "training" | "other";

interface ProductiveHoursDefaults {
  grossAnnualHours: number;
  vacation: number;
  sick: number;
  holidays: number;
  admin: number;
  training: number;
  other: number;
}

/** Standard 40 hr/wk × 52 wk year, less typical municipal leave/holiday
 *  allowances. Defaults sum to 360 nonproductive → 1,720 net productive,
 *  matching the citywide productive-hours assumption applied by the
 *  rate engine when no row-specific value has been entered. */
export const DEFAULT_PRODUCTIVE_HOURS: ProductiveHoursDefaults = {
  grossAnnualHours: 2080,
  vacation: 120,
  sick: 96,
  holidays: 104,
  admin: 16,
  training: 24,
  other: 0,
};

interface ProductiveHoursDeduction {
  key: ProductiveHoursDeductionKey;
  label: string;
  hours: number;
  /** True when the row supplied its own value; false when the helper
   *  fell back to the citywide default. Drives the "(default)" hint in
   *  the drilldown. */
  fromRow: boolean;
}

interface ProductiveHoursResult {
  grossAnnualHours: number;
  deductions: ProductiveHoursDeduction[];
  totalNonproductiveHours: number;
  netProductiveHours: number;
  productivePercent: number;
}

const DEDUCTION_LABELS: Record<ProductiveHoursDeductionKey, string> = {
  vacation:  "Vacation",
  sick:      "Sick leave",
  holidays:  "Holidays",
  admin:     "Administrative leave",
  training:  "Training / professional development",
  other:     "Other nonproductive time",
};

const DEDUCTION_ORDER: ProductiveHoursDeductionKey[] = [
  "vacation", "sick", "holidays", "admin", "training", "other",
];

/** Build the productive-hours breakdown for a single Direct Labor row.
 *  Pure — no React, no store, no I/O. Accepts the minimal shape it
 *  actually reads from `Position` so it's straightforward to call from
 *  tests with hand-crafted rows. */
export function calculateProductiveHours(
  row: Pick<Position, "productiveHoursBreakdown">,
  defaults: ProductiveHoursDefaults = DEFAULT_PRODUCTIVE_HOURS,
): ProductiveHoursResult {
  const overrides: ProductiveHoursBreakdown = row.productiveHoursBreakdown ?? {};
  const deductions: ProductiveHoursDeduction[] = DEDUCTION_ORDER.map((key) => {
    const overridden = overrides[key];
    const hasOverride = typeof overridden === "number" && Number.isFinite(overridden);
    return {
      key,
      label: DEDUCTION_LABELS[key],
      hours: hasOverride ? Math.max(0, overridden) : defaults[key],
      fromRow: hasOverride,
    };
  });
  const totalNonproductiveHours = deductions.reduce((a, d) => a + d.hours, 0);
  const netProductiveHours = Math.max(0, defaults.grossAnnualHours - totalNonproductiveHours);
  const productivePercent = defaults.grossAnnualHours > 0
    ? (netProductiveHours / defaults.grossAnnualHours) * 100
    : 0;
  return {
    grossAnnualHours: defaults.grossAnnualHours,
    deductions,
    totalNonproductiveHours,
    netProductiveHours,
    productivePercent,
  };
}
