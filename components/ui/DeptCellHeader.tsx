import { DeptChip } from "./DeptChip";
import { deptName } from "@/lib/data/departments";
import type { DeptCode } from "@/lib/types";

interface Props {
  code: DeptCode;
}

export function DeptCellHeader({ code }: Props) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <DeptChip code={code}/>
      <span style={{ fontWeight: 500 }}>{deptName(code)}</span>
    </span>
  );
}
