import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SubNav, type SubNavItem } from "@/components/layout";

const ITEMS: SubNavItem[] = [
  { href: "/build",           label: "Overview" },
  { href: "/build/services",  label: "Services" },
  // Cost Inputs collapses Direct Labor, Operating, and Overhead Cost
  // Allocation into a single primary entry. The page itself renders a
  // card-style SubsectionNav so the user can hop between the three
  // sub-views. Deep links to the original routes still work; this entry
  // highlights for any of them via matchPrefixes.
  {
    href: "/build/salary",
    label: "Cost Inputs",
    matchPrefixes: ["/build/salary", "/build/operating", "/build/cap"],
  },
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
