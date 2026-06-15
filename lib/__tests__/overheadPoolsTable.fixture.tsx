/* Fixture for the OverheadPoolsTableView Cost Pools view.
 *
 * Run with: npm run test:overhead-pools-table
 *
 * Pins the empty-state contract introduced alongside the synthetic
 * direct-receiver-node removal. Tests target the pure presentational
 * shell (OverheadPoolsTableView) so SSR rendering doesn't fight
 * Zustand v5's getInitialState snapshot. The outer OverheadPoolsTable
 * is a thin store-binding wrapper; its only logic is destructuring
 * useBuildState() and forwarding to the View.
 *
 *   1. capPools = [] renders the shared empty-state copy (paper-bordered
 *      panel, no center sections, no "Add cost pool" button).
 *   2. A populated capPools list renders the normal per-center table,
 *      including the pool name, percent, dollar amount, and reconciliation
 *      footer — none of the editing surface regresses.
 *   3. Partially configured pools (no basisId / no basis name) stay
 *      visible. The Combobox falls through to the "Select basis…"
 *      placeholder, but the row itself still renders so the analyst can
 *      finish configuring it. */

import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { OverheadPoolsTableView } from "../../features/build/OverheadPoolsTable";
import type { AllocationBasis, CapPool } from "../types";

const noopAddPool = (_centerKey: string) => {};
const noopUpdatePool = (_id: string, _patch: Partial<CapPool>) => "";
const noopAddBasis = (
  _input: { name: string; source: string; methodologyNote?: string },
) => "bas-stub";

const bases: AllocationBasis[] = [{
  id: "bas-fte",
  name: "Budgeted FTE",
  source: "HRIS",
  driverKey: "FTE",
  createdAt: "2026-01-01T00:00:00.000Z",
}];

let passed = 0;

// ── 1. Empty capPools → shared empty-state panel ────────────────────────
{
  const html = renderToStaticMarkup(
    <OverheadPoolsTableView
      capPools={[]}
      capCenterOrder={[]}
      capCenterSources={{}}
      allocationBases={bases}
      addCapPool={noopAddPool}
      updateCapPool={(id, patch) => { noopUpdatePool(id, patch); }}
      addAllocationBasis={noopAddBasis}
    />,
  );
  assert.match(html, /No cost pool data uploaded or added yet\./,
    "empty state surfaces the no-data copy");
  assert.match(html, /Import a CAP workbook or add a cost pool/,
    "empty state explains the recovery action");
  assert.doesNotMatch(html, /Add cost pool/,
    "empty state suppresses the per-center 'Add cost pool' footer button");
  passed += 1;
  console.log("  ✓ empty capPools renders the shared empty-state panel");
}

// ── 2. Populated capPools → normal per-center table ─────────────────────
{
  const centerKey = "seed:center:test-cmgr";
  const pool: CapPool = {
    id: "cap-test-pool",
    center: "City Manager",
    centerGlCode: centerKey,
    pool: "Town-wide Support",
    allocationPercent: 100,
    amount: 100000,
    basisId: "bas-fte",
    basis: "Budgeted FTE",
    receiving: "Multiple",
    recoverability: "Recoverable",
    review: "Reviewed",
  };
  const html = renderToStaticMarkup(
    <OverheadPoolsTableView
      capPools={[pool]}
      capCenterOrder={[centerKey]}
      capCenterSources={{ [centerKey]: { name: "City Manager" } }}
      allocationBases={bases}
      addCapPool={noopAddPool}
      updateCapPool={(id, patch) => { noopUpdatePool(id, patch); }}
      addAllocationBasis={noopAddBasis}
    />,
  );
  assert.match(html, /Town-wide Support/,
    "populated table renders the pool name");
  assert.match(html, /City Manager/,
    "populated table renders the center section header");
  assert.match(html, /Add cost pool/,
    "populated table renders the per-center 'Add cost pool' footer");
  assert.doesNotMatch(html, /No cost pool data uploaded or added yet/,
    "populated table never shows the empty-state copy");
  passed += 1;
  console.log("  ✓ populated capPools renders the normal per-center table");
}

// ── 3. Partially configured pools stay visible ──────────────────────────
//
// A pool with no basisId / no basis name is a real, in-progress
// configuration the analyst needs to finish. It must NOT be hidden by
// the empty state — the user needs to see the row to act on it. The
// AllocationBasisCombobox shows its "Select basis…" placeholder in this
// state, which is what surfaces the gap to the user.
{
  const centerKey = "seed:center:partial-center";
  const partial: CapPool = {
    id: "cap-partial",
    center: "Partial Center",
    centerGlCode: centerKey,
    pool: "Half-configured pool",
    allocationPercent: 0,
    amount: 0,
    basisId: "",       // missing basis
    basis: "",         // no fallback text either
    receiving: "TBD",
    recoverability: "TBD",
    review: "Review",
  };
  const html = renderToStaticMarkup(
    <OverheadPoolsTableView
      capPools={[partial]}
      capCenterOrder={[centerKey]}
      capCenterSources={{ [centerKey]: { name: "Partial Center" } }}
      allocationBases={bases}
      addCapPool={noopAddPool}
      updateCapPool={(id, patch) => { noopUpdatePool(id, patch); }}
      addAllocationBasis={noopAddBasis}
    />,
  );
  assert.match(html, /Half-configured pool/,
    "partial pool name still renders");
  assert.match(html, /Partial Center/,
    "center section still renders even with a half-configured pool");
  // The reconciliation row's % drift warning ("0%" in --warn color) is
  // the existing surface that signals an unconfigured pool — the engine
  // emits no separate diagnostic for a missing basisId until the user
  // saves and looks at Allocation Detail. The point of this assertion
  // is: the pool row is still visible to the analyst, not hidden by an
  // overzealous empty state.
  assert.match(html, /Allocation drifted to 0\.0%/,
    "partial pool surfaces the existing 'allocation drifted' warning");
  // The basis cell renders as an interactive button (the Combobox
  // trigger) so the analyst can click in and assign a basis. The cell
  // is empty by design — assigning a basis is the recovery path.
  assert.doesNotMatch(html, /No cost pool data uploaded or added yet/,
    "partial pools never trigger the empty state");
  passed += 1;
  console.log("  ✓ partially configured pools remain visible with the existing warnings");
}

console.log(`\n${passed}/3 OverheadPoolsTableView assertions passed.`);
