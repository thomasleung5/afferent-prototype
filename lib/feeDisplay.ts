import type { FeeFormulaTier, Service } from "./types";
import type { FeeComparison } from "./calc";
import { isRecoverableFeeRow } from "./calc";
import { fmt } from "./format";

/* Fee-display layer.
 *
 * Pure helpers that render fee cells for UI tables. For flat rows the
 * display is just `fmt.dollars(...)`. For non-flat rows (formula /
 * deposit / T&M / pass-through / statutory), the structured `formula`
 * on Service drives a deterministic narrative via `summarizeFee` —
 * change the underlying formula data and every cell that renders the
 * row updates automatically.
 *
 * The underlying numeric `fee` / `peer` / computed cost values stay
 * authoritative for recovery math; these helpers only change what the
 * user sees. */

/** Display label for a service's currently-adopted fee. Prefers a
 *  structured `formula` summary when present (via `summarizeFee`);
 *  otherwise falls back to `fmt.dollars(service.fee)`. */
export function displayCurrentFee(service: Service): string {
  const summary = summarizeFee(service);
  if (summary != null) return summary;
  return fmt.dollars(service.fee);
}

/** Display label for the recommended fee. Renders the comparison's
 *  numeric `recommended` for flat rows; non-flat rows (and rows
 *  without a comparison) render an em-dash so the cell stays aligned
 *  without showing a misleading numeric — recommended pricing for
 *  formula / T&M / pass-through rows isn't a single dollar amount. */
export function displayRecommendedFee(
  service: Service,
  comparison?: Pick<FeeComparison, "recommended">,
): string {
  if (!comparison) return "—";
  // Non-flat rows with no numeric fee don't produce a meaningful
  // recommendation; show em-dash rather than a misleading dollar
  // figure derived from unitCost × target. Flat rows always compute
  // a real recommendation. See isRecoverableFeeRow.
  if (!isRecoverableFeeRow(service)) return "—";
  return fmt.dollars(comparison.recommended);
}

/** Display label for the full-cost-of-service (unit cost before
 *  policy target is applied). Renders the comparison's `unitCost` —
 *  always meaningful (cost to deliver) regardless of recoverable
 *  status, so this helper doesn't gate on isRecoverableFeeRow. */
export function displayCostOfService(
  service: Service,
  comparison?: Pick<FeeComparison, "unitCost">,
): string {
  if (!comparison) return "—";
  return fmt.dollars(comparison.unitCost);
}

/** Deterministic narrative summary of a service's fee formula.
 *  Returns `undefined` when the service has no formula (caller falls
 *  back to `fmt.dollars(service.fee)`). When a formula is present,
 *  the returned string is mechanically derived from the structured
 *  payload — change a tier rate or a deposit amount and every cell
 *  that renders the row updates without manual sync. */
export function summarizeFee(service: Service): string | undefined {
  const f = service.formula;
  if (!f) return undefined;
  switch (f.kind) {
    case "tiered-valuation": {
      if (f.tiers.length === 0) return undefined;
      if (f.typicalBasis != null) {
        const fee = computeTieredFee(f.tiers, f.typicalBasis);
        return `Tiered (typ. ${fmt.dollars(fee)} @ ${fmt.dollarsK(f.typicalBasis)} ${f.basis})`;
      }
      // No anchor — show the dollar range across the schedule. Lower
      // bound is the first tier's lower edge (always 0); upper is the
      // last bounded tier's `upTo` (the unbounded top tier extends
      // arbitrarily, so we don't try to evaluate it).
      const firstFee = computeTieredFee(f.tiers, 0);
      const lastBounded = [...f.tiers].reverse().find((t) => t.upTo != null);
      if (!lastBounded?.upTo) {
        // Single open-ended tier — fall back to just the base fee.
        return `Tiered (from ${fmt.dollars(firstFee)} per ${f.basis})`;
      }
      const topFee = computeTieredFee(f.tiers, lastBounded.upTo);
      return `Tiered (${fmt.dollars(firstFee)}–${fmt.dollars(topFee)} per ${f.basis})`;
    }
    case "percentage": {
      const parts: string[] = [`${f.rate}% of ${f.basis}`];
      if (f.minFee != null) parts.push(`min ${fmt.dollars(f.minFee)}`);
      if (f.maxFee != null) parts.push(`max ${fmt.dollars(f.maxFee)}`);
      return parts.join(", ");
    }
    case "per-unit": {
      const base = `${fmt.dollars(f.rate)} per ${f.unit}`;
      return f.minFee != null ? `${base} (min ${fmt.dollars(f.minFee)})` : base;
    }
    case "deposit": {
      const tail = f.balance === "actuals"
        ? "balance at actuals"
        : `balance at ${fmt.dollars(f.balance.rate)}/${f.balance.unit}`;
      return `${fmt.dollars(f.amount)} deposit, ${tail}`;
    }
    case "time-and-materials": {
      if (f.hourlyRate == null) {
        return f.minimum != null
          ? `Billed at actual cost (min ${fmt.dollars(f.minimum)})`
          : "Billed at actual cost";
      }
      const base = `${fmt.dollars(f.hourlyRate)}/hr`;
      return f.minimum != null ? `${base} (min ${fmt.dollars(f.minimum)})` : base;
    }
    case "pass-through":
      return f.markup != null
        ? `Pass-through + ${f.markup}% admin`
        : "Pass-through at actual cost";
    case "statutory":
      return f.cap != null
        ? `Statutory cap: ${fmt.dollars(f.cap)}`
        : "Set by statute";
    case "expression":
      return f.text;
  }
}

/** Evaluate a tiered-valuation schedule at `basis`. Each tier's
 *  `baseFee` is the cumulative charge at its lower edge; `perUnit` ×
 *  `unitSize` is the marginal rate inside the tier. The unbounded top
 *  tier (no `upTo`) catches anything above the last cap. Pure — no
 *  side effects, no I/O. */
function computeTieredFee(tiers: FeeFormulaTier[], basis: number): number {
  let lower = 0;
  for (const t of tiers) {
    const upper = t.upTo ?? Infinity;
    if (basis <= upper) {
      const unitSize = t.unitSize ?? 1;
      const perUnit = t.perUnit ?? 0;
      return t.baseFee + ((basis - lower) / unitSize) * perUnit;
    }
    lower = upper;
  }
  // basis exceeds every bounded tier AND no unbounded tier exists —
  // return the last tier's baseFee as a safe floor rather than NaN.
  return tiers[tiers.length - 1]?.baseFee ?? 0;
}

