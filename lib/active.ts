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
import type { SourceTag } from "@/lib/types";

/** Slices whose rows must carry a SourceTag for the Source column to
 *  render. Mirrors the coercion `onRehydrateStorage` does for state
 *  persisted before the SourceTag standardization. Seeds applied at
 *  runtime go through the same coercion so the in-memory state is
 *  well-formed without waiting for a browser refresh. */
const SOURCE_TAGGED_SLICES = [
  "operating", "services", "positions", "volume",
  "capPools", "policyTargets", "policyExceptions",
] as const;

function coerceSeedSources(seed: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...seed };
  for (const k of SOURCE_TAGGED_SLICES) {
    const arr = out[k];
    if (!Array.isArray(arr)) continue;
    out[k] = arr.map((r) => {
      if (r && typeof r === "object" && (r as { source?: unknown }).source === undefined) {
        return { ...r, source: "seed" as SourceTag };
      }
      return r;
    });
  }
  return out;
}

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
 *  the rest of the app reads from. Two-step:
 *    1. Reset the store to the canonical baseline (the LAH seed via
 *       resetAll). Guarantees switching back to LAH gives a clean state.
 *    2. If the target jurisdiction declares a seedFile, fetch it and
 *       overlay onto the baseline. Fields the seed doesn't specify keep
 *       the baseline value — fine for the prototype since both demo
 *       seeds share the same overall shape.
 *  Finally, pin activeJurisdictionId / activeFiscalYear so the UI
 *  resolves the target jurisdiction's metadata. */
export async function switchJurisdiction(id: string): Promise<void> {
  const target = getJurisdiction(id);
  if (!target) return;

  // Step 1 — reset to the canonical baseline. resetAll() loads
  // initialState() (LAH seed) and clears any persisted edits.
  useBuildStore.getState().resetAll();

  // Step 2 — overlay the target's seed if one is declared.
  if (target.seedFile) {
    try {
      const res = await fetch(target.seedFile);
      if (res.ok) {
        const seedData = coerceSeedSources(await res.json());
        // Clear CAP center metadata before applying the seed so the
        // LAH baseline keyed by LAH center names ("Finance &
        // Administrative Services" etc.) doesn't bleed through into
        // jurisdictions that use different names ("Finance & Admin").
        // The seed re-supplies any fields the target needs.
        useBuildStore.setState({
          capCenterTotals: {},
          capCenterDisallowed: {},
          capCenterSources: {},
          ...seedData,
        });
      }
    } catch {
      // Seed fetch failed — leave the baseline in place. The active
      // context below still gets set so the UI labels the target.
    }
  }

  // Final pin — seed JSON files don't always specify these.
  useBuildStore.setState({
    activeJurisdictionId: id,
    activeFiscalYear: target.defaultFiscalYear,
  });
}
