import type { DeptCode } from "@/lib/types";

interface Props {
  code: DeptCode | string;
}

export function DeptChip({ code }: Props) {
  return (
    <span className="mono" style={{
      display: "inline-block",
      fontSize: "var(--t-l4)", fontWeight: 600, letterSpacing: "0.06em",
      color: "var(--ink-2)",
      padding: "2px 6px",
      background: "var(--paper-2)",
      border: "1px solid var(--rule)",
    }}>
      {code}
    </span>
  );
}
