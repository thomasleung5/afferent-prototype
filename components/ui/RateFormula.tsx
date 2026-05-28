import { Formula } from "./Formula";
import { fmt } from "@/lib/format";

interface Props {
  formula: string;
  numerator: number;
  hours: number;
  rate: number;
}

export function RateFormula({ formula, numerator, hours, rate }: Props) {
  return (
    <>
      <Formula>{formula}</Formula>
      <span style={{ marginLeft: 8, color: "var(--ink-3)" }}>
        = {fmt.dollarsK(numerator)} ÷ {fmt.int(hours)} hrs
        {rate > 0 && (
          <span style={{ marginLeft: 6, color: "var(--ink)", fontWeight: 600 }}>
            = ${Math.round(rate)}/hr
          </span>
        )}
      </span>
    </>
  );
}
