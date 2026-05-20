import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SubNav, type SubNavItem } from "@/components/layout";

const ITEMS: SubNavItem[] = [
  { href: "/build",           label: "Overview" },
  { href: "/build/services",  label: "Services" },
  { href: "/build/salary",    label: "Direct Labor" },
  { href: "/build/operating", label: "Operating" },
  { href: "/build/cap",       label: "Overhead Cost Allocation" },
  { href: "/build/workload",  label: "Workload" },
  { href: "/build/costs",     label: "Cost of Service" },
  { href: "/build/policy",    label: "Recovery Policy" },
  { href: "/build/feestudy",  label: "Fee Schedule" },
  { href: "/build/benchmark", label: "Fee Benchmark" },
];

export const Route = createFileRoute("/build")({
  component: () => (
    <>
      <SubNav items={ITEMS}/>
      <Outlet/>
    </>
  ),
});
