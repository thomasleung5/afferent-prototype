/* Shared helpers for the optional `?dept=<DeptCode>` query parameter
 * routes use to preserve dept context across Build Model cross-nav.
 *
 * Functional Allocation drilldowns emit links carrying `?dept=PLAN`
 * etc.; each receiving route's validateSearch decodes the param via
 * coerceDeptCode so the dept-filter / dept-drilldown auto-opens on
 * landing. */

import type { DeptCode } from "@/lib/types";
import { FEE_DEPTS } from "./departments";

export interface DeptSearch {
  /** Dept code carried from upstream cross-nav. Undefined when the
   *  user landed without a dept context. */
  dept?: DeptCode;
}

const DEPT_SET: ReadonlySet<DeptCode> = new Set(FEE_DEPTS);

/** Returns the value when it's a recognised fee-dept code; otherwise
 *  undefined (silently strips unknown values rather than throwing so
 *  bookmarked URLs with stale codes still load). */
export function coerceDeptCode(v: unknown): DeptCode | undefined {
  if (typeof v !== "string") return undefined;
  return DEPT_SET.has(v as DeptCode) ? (v as DeptCode) : undefined;
}
