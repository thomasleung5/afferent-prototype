import { FormulaLine } from "./Formula";
import { fmt } from "@/lib/format";

interface Props {
  formula: string;
  numerator: number;
  hours: number;
  rate: number;
}

/** Inline source-rate formula rendered as a single MetaGrid value:
 *  `{formula chip}  = $X ÷ Y hrs  = $Z/hr`. Result tone is "ink" so the
 *  rate-per-hour reads as a numeric anchor rather than a callout.
 *  Built on the shared `<FormulaLine/>` primitive so it matches the
 *  Functional Allocation / Cost of Service workpaper formulas in
 *  structure while preserving the source-rate visual contract. */
export function RateFormula({ formula, numerator, hours, rate }: Props) {
  return (
    <FormulaLine
      expr={formula}
      subst={`= ${fmt.dollarsK(numerator)} ÷ ${fmt.int(hours)} hrs`}
      result={rate > 0 ? `$${Math.round(rate)}/hr` : undefined}
      resultTone="ink"
    />
  );
}
