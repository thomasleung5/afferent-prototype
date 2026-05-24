import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { SubNav, type SubNavItem } from "@/components/layout";

const COST_INPUTS_ITEMS: SubNavItem[] = [
  { href: "/build/direct-labor", label: "Direct Labor" },
  { href: "/build/operating",    label: "Operating" },
  { href: "/build/cap",          label: "Overhead Allocation" },
];

const COST_INPUTS_PREFIXES = COST_INPUTS_ITEMS.map((it) => it.href);

const ITEMS: SubNavItem[] = [
  { href: "/build/services",  label: "Services" },
  // "Cost Inputs" collapses Direct Labor, Operating, and Overhead
  // Allocation into one row-2 entry. The sub-sections render as a
  // row-3 SubNav below, mounted by this route when the pathname is
  // inside the cost-inputs branch.
  {
    href: "/build/direct-labor",
    label: "Cost Inputs",
    matchPrefixes: COST_INPUTS_PREFIXES,
  },
  { href: "/build/workload",  label: "Workload" },
  { href: "/build/costs",     label: "Cost of Service" },
  { href: "/build/policy",    label: "Recovery Policy" },
  { href: "/build/feestudy",  label: "Fee Schedule" },
  { href: "/build/benchmark", label: "Fee Benchmark" },
];

function BuildLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const inCostInputs = COST_INPUTS_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  return (
    <>
      <SubNav items={ITEMS}/>
      {inCostInputs && (
        // marginBottom pulls the page content closer to row 3 than to
        // row 2 so the row-3 tabs visually scope the content they
        // control. Row 3 reuses SubNav unchanged — same tab treatment,
        // same active underline, same inactive color.
        <div style={{ marginBottom: "calc(-1 * var(--s-3))" }}>
          <SubNav items={COST_INPUTS_ITEMS}/>
        </div>
      )}
      <Outlet/>
    </>
  );
}

export const Route = createFileRoute("/build")({
  component: BuildLayout,
});
