import { SubsectionNav, type SubsectionNavItem } from "@/components/layout";

/** Card-style secondary nav for the Cost Inputs subsection. Mounted at
 *  the top of /build/direct-labor, /build/operating, and /build/cap so the
 *  user can hop between the three sub-views without going back to the
 *  primary nav. */
const COST_INPUTS_ITEMS: SubsectionNavItem[] = [
  {
    href: "/build/direct-labor",
    label: "Direct Labor",
    hint: "Salaries, benefits, and productive hours per department.",
  },
  {
    href: "/build/operating",
    label: "Operating",
    hint: "Non-labor operating expenses per department.",
  },
  {
    href: "/build/cap",
    label: "Overhead Cost Allocation",
    hint: "Indirect cost centers allocated across direct departments.",
  },
];

export function CostInputsSubsectionNav() {
  return <SubsectionNav items={COST_INPUTS_ITEMS}/>;
}
