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
import { useBuildState, useBuildStore, type BuildState } from "@/lib/store";
import { migratePersistedState } from "@/lib/storeMigration";

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
 *  the rest of the app reads from. Seed-file jurisdictions load their
 *  declared snapshot directly; blank workspaces clear every input slice
 *  and then mark the target jurisdiction active. */
export async function switchJurisdiction(id: string): Promise<void> {
  const target = getJurisdiction(id);
  if (!target) return;

  if (target.blankWorkspace) {
    const store = useBuildStore.getState();
    store.clearAll();
    useBuildStore.setState({
      activeJurisdictionId: target.id,
      activeFiscalYear: target.defaultFiscalYear,
      operatingCategoryMappings: {},
      stepDownMethod: "double",
    });
    return;
  }

  if (!target.seedFile) {
    useBuildStore.getState().resetAll();
    return;
  }

  try {
    const res = await fetch(target.seedFile);
    if (res.ok) {
      const seedData = await res.json() as Record<string, unknown>;
      // Run the persisted-state migration on the raw seed before
      // handing it to Zustand. Without this, a seed authored against
      // a prior snapshot shape (e.g. missing activeFeeDepts, untyped
      // unit/activity fields, or legacy capPools rows) drives the next
      // `deriveBuildDerived` straight into an undefined-field access
      // and the error boundary blanks the build pages until reload —
      // reload then runs migration via onRehydrateStorage so things
      // appear "fine" the second time. Migrating here closes the loop.
      migratePersistedState(seedData as Partial<BuildState>);
      useBuildStore.setState(seedData);
      return;
    }
  } catch {
    // Seed fetch failed — fall back to the canonical baseline.
  }
  useBuildStore.getState().resetAll();
}
