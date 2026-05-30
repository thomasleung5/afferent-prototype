import type { Service } from "./types";
import type { FeeComparison } from "./calc";
import { isRecoverableFeeRow } from "./calc";
import { fmt } from "./format";

/* Fee-display layer.
 *
 * Pure helpers that route fee values to either a Service's *Text
 * override (when set) or the formatted numeric fallback. They exist so
 * UI cells in FeeScheduleTable / BenchmarksTable / Cost of Service can
 * support non-numeric fees (T&M w/ deposit, "5% of valuation",
 * "Pass-through at actual cost") without forking renderer logic. The
 * underlying numeric `fee` / `peer` / computed cost values are still
 * the source of truth for math; these helpers only change what the
 * user sees.
 *
 * The *Text fields these helpers read are INTERNAL INFRASTRUCTURE,
 * not user-facing controls — they preserve imported fee-schedule
 * wording for non-flat rows (formula / deposit / T&M / pass-through /
 * statutory) and let the parser carry verbatim labels through to
 * display + export without losing them. See the Service interface in
 * lib/types.ts for the policy.
 *
 * Empty string is treated as a deliberate display override (renders as
 * blank), not as "no override" — used to suppress a numeric display
 * for rows that intentionally have no published fee. Use `undefined`
 * when there's no override. */

/** Display label for a service's currently-adopted fee. Prefers
 *  `currentFeeText` when set, otherwise `fmt.dollars(service.fee)`. */
export function displayCurrentFee(service: Service): string {
  if (service.currentFeeText != null) return service.currentFeeText;
  return fmt.dollars(service.fee);
}

/** Display label for the recommended fee. Prefers `recommendedFeeText`
 *  when set, otherwise `fmt.dollars(comparison.recommended)`. When the
 *  comparison is missing (or the row isn't recoverable and has no
 *  override), renders an em-dash so the cell stays aligned without
 *  showing a misleading numeric. */
export function displayRecommendedFee(
  service: Service,
  comparison?: Pick<FeeComparison, "recommended">,
): string {
  if (service.recommendedFeeText != null) return service.recommendedFeeText;
  if (!comparison) return "—";
  // Non-flat rows with no numeric fee don't produce a meaningful
  // recommendation; show em-dash rather than a misleading dollar
  // figure derived from unitCost × target. Flat rows always compute
  // a real recommendation. See isRecoverableFeeRow.
  if (!isRecoverableFeeRow(service)) return "—";
  return fmt.dollars(comparison.recommended);
}

/** Display label for the full-cost-of-service (unit cost before policy
 *  target is applied). Prefers `fullCostRecoveryFeeText` when set,
 *  otherwise `fmt.dollars(comparison.unitCost)`. Unit cost is always
 *  meaningful (cost to deliver) regardless of recoverable status, so
 *  this helper doesn't gate on isRecoverableFeeRow. */
export function displayCostOfService(
  service: Service,
  comparison?: Pick<FeeComparison, "unitCost">,
): string {
  if (service.fullCostRecoveryFeeText != null) return service.fullCostRecoveryFeeText;
  if (!comparison) return "—";
  return fmt.dollars(comparison.unitCost);
}

