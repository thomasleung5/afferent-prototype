/* Active demo context — single source of truth for which jurisdiction
 * and fiscal year the UI is bound to.
 *
 * The active context lives in the build store (state.activeJurisdictionId /
 * state.activeFiscalYear). This module just gives React + non-React
 * consumers a small, stable API so the rest of the codebase doesn't have
 * to know the field names.
 *
 * If/when the prototype grows real multi-jurisdiction data, the store's
 * data slices will be sharded by activeJurisdictionId × activeFiscalYear
 * and these hooks will continue to read the active record transparently. */

import {
  getJurisdiction, getJurisdictionOrDefault, type Jurisdiction,
} from "@/lib/data/jurisdictions";
import { useBuildState, useBuildStore } from "@/lib/store";

/** React hook: returns the active jurisdiction's full config record. */
export function useActiveJurisdiction(): Jurisdiction {
  const id = useBuildState().activeJurisdictionId;
  return getJurisdictionOrDefault(id);
}

/** React hook: returns the active fiscal year string. */
export function useActiveFiscalYear(): string {
  return useBuildState().activeFiscalYear;
}

/** Atomically switch the active jurisdiction AND swap the demo data
 *  the rest of the app reads from. The canonical LAH demo comes from
 *  resetAll(); seed-file jurisdictions load their declared snapshot
 *  directly. */
export async function switchJurisdiction(id: string): Promise<void> {
  const target = getJurisdiction(id);
  if (!target) return;

  if (!target.seedFile) {
    useBuildStore.getState().resetAll();
    return;
  }

  try {
    const res = await fetch(target.seedFile);
    if (res.ok) {
      const seedData = await res.json() as Record<string, unknown>;
      useBuildStore.setState(seedData);
      return;
    }
  } catch {
    // Seed fetch failed — fall back to the canonical baseline.
  }
  useBuildStore.getState().resetAll();
}
