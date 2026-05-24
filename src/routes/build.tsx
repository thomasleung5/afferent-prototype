import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { SubNav, type SubNavItem } from "@/components/layout";

const INPUTS_ITEMS: SubNavItem[] = [
  { href: "/build/services",     label: "Services" },
  { href: "/build/direct-labor", label: "Direct Labor" },
  { href: "/build/operating",    label: "Operating" },
  { href: "/build/cap",          label: "Overhead Allocation" },
  { href: "/build/workload",     label: "Workload" },
];

const INPUTS_PREFIXES = INPUTS_ITEMS.map((it) => it.href);

const ITEMS: SubNavItem[] = [
  // "Inputs" collapses Services, Direct Labor, Operating, Overhead
  // Allocation, and Workload into one row-2 entry. The five sub-sections
  // render as a row-3 SubNav below, mounted by this route when the
  // pathname is inside the inputs branch. Clicking "Inputs" lands on
  // Services (the canonical starting point).
  {
    href: "/build/services",
    label: "Inputs",
    matchPrefixes: INPUTS_PREFIXES,
  },
  { href: "/build/costs",     label: "Cost of Service" },
  { href: "/build/policy",    label: "Recovery Policy" },
  { href: "/build/feestudy",  label: "Fee Schedule" },
  { href: "/build/benchmark", label: "Fee Benchmark" },
];

function BuildLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const inInputs = INPUTS_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  return (
    <>
      <SubNav items={ITEMS}/>
      {inInputs && (
        // marginBottom pulls the page content closer to row 3 than to
        // row 2 so the row-3 tabs visually scope the content they
        // control. Row 3 reuses SubNav unchanged — same tab treatment,
        // same active underline, same inactive color.
        <div style={{ marginBottom: "calc(-1 * var(--s-3))" }}>
          <SubNav items={INPUTS_ITEMS}/>
        </div>
      )}
      <Outlet/>
    </>
  );
}

export const Route = createFileRoute("/build")({
  component: BuildLayout,
});
