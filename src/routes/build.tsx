import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SubNav, type SubNavItem } from "@/components/layout";

const ITEMS: SubNavItem[] = [
  { href: "/build/services",               label: "Services" },
  { href: "/build/labor",                  label: "Labor" },
  { href: "/build/operating",              label: "Operating Costs" },
  { href: "/build/overhead",               label: "Overhead Costs" },
  { href: "/build/functional-allocation",  label: "Functional Allocation" },
  { href: "/build/volume",                 label: "Volume" },
  { href: "/build/costs",                  label: "Cost of Service" },
  { href: "/build/policy",                 label: "Recovery Policy" },
  { href: "/build/fee-schedule",           label: "Fee Schedule" },
  { href: "/build/benchmarks",             label: "Fee Benchmarks" },
];

export const Route = createFileRoute("/build")({
  component: () => (
    <>
      <SubNav items={ITEMS}/>
      <Outlet/>
    </>
  ),
});
