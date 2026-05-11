import type { ReactNode } from "react";
import { SubNav, type SubNavItem } from "@/components/layout";

const ITEMS: SubNavItem[] = [
  { href: "/build",           label: "Overview" },
  { href: "/build/services",  label: "Services" },
  { href: "/build/salary",    label: "Direct Labor" },
  { href: "/build/operating", label: "Operating" },
  { href: "/build/cap",       label: "Cost Allocation" },
  { href: "/build/workload",  label: "Workload" },
  { href: "/build/costs",     label: "Cost of Service" },
  { href: "/build/policy",    label: "Recovery Policy" },
  { href: "/build/feestudy",  label: "Fee Schedule" },
  { href: "/build/benchmark", label: "Fee Benchmark" },
];

export default function BuildLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SubNav items={ITEMS}/>
      {children}
    </>
  );
}
