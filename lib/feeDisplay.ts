import type { Service } from "./types";
import { fmt } from "./format";

/* Fee-display layer (PR-L2).
 *
 * Pure helpers that route fee values to either a Service's *Text
 * override (when set) or the formatted numeric fallback. They exist so
 * UI cells in FeeScheduleTable / BenchmarkTable / Cost of Service can
 * support non-numeric fees (T&M w/ deposit, "5% of valuation",
 * "Pass-through at actual cost") without forking renderer logic. The
 * underlying numeric `fee` / `peer` / computed cost values are still
 * the source of truth for math; these helpers only change what the
 * user sees.
 *
 * Empty string is treated as a deliberate display override (renders as
 * blank), not as "no override" — analysts use blank text to suppress
 * the numeric display for rows that intentionally have no published
 * fee. Use `undefined` when there's no override. */

/** Display label for a service's currently-adopted fee.
 *  Falls back to `fmt.dollars(service.fee)`. */
export function displayCurrentFee(service: Service): string {
  if (service.currentFeeText != null) return service.currentFeeText;
  return fmt.dollars(service.fee);
}

/** Display label for the recommended fee. `computedRecommendation`
 *  is the numeric output of the cost/target math (unitCost × target/100,
 *  typically rounded), passed in because this helper doesn't recompute
 *  it from the Service. Falls back to `fmt.dollars(computedRecommendation)`. */
export function displayRecommendedFee(
  service: Service,
  computedRecommendation: number,
): string {
  if (service.recommendedFeeText != null) return service.recommendedFeeText;
  return fmt.dollars(computedRecommendation);
}

/** Display label for the full-cost-recovery fee — the unit cost before
 *  policy target is applied. Falls back to `fmt.dollars(unitCost)`. */
export function displayFullCostFee(
  service: Service,
  unitCost: number,
): string {
  if (service.fullCostRecoveryFeeText != null) return service.fullCostRecoveryFeeText;
  return fmt.dollars(unitCost);
}
