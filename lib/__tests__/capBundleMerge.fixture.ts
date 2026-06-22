/* Fixture for mergeCapBundle's allocationPercent backfill.
 *
 * Run with: npm run test:cap-bundle-merge
 *
 * Regression: a source document that publishes pool splits as dollar
 * amounts only (no printed percent column) can get an AI response that
 * omits allocationPercent for every pool. capPoolsToExtractionResult
 * (lib/ai/parseCap.ts) now imports such a row anyway, with allocationPercent
 * left as a NaN sentinel. mergeCapBundle (lib/store.ts) must backfill that
 * sentinel from amount / center total once the post-merge center total is
 * resolved — same formula as storeMigration.ts's pre-existing legacy
 * backfill — so the pool's % column and the engine's defensive fallback
 * never see a NaN.
 *
 * tsx (Node) has no localStorage; install a Storage-compatible shim on
 * globalThis BEFORE importing the store module so its module-level
 * persist() middleware finds something. Mirrors storeClearReset.fixture.ts. */

import assert from "node:assert/strict";

const storage = new Map<string, string>();
const shim: Storage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => { storage.set(k, v); },
  removeItem: (k: string) => { storage.delete(k); },
  clear: () => { storage.clear(); },
  key: (i: number) => Array.from(storage.keys())[i] ?? null,
  get length() { return storage.size; },
};
(globalThis as unknown as { localStorage: Storage }).localStorage = shim;
(globalThis as unknown as { window: { localStorage: Storage } }).window = { localStorage: shim };

async function main(): Promise<void> {
  const { useBuildStore } = await import("../store");
  const {
    capCentersToExtractionResult,
    capBasesToExtractionResult,
    capBasisUnitsToExtractionResult,
    capPoolsToExtractionResult,
    capDirectAllocationsToExtractionResult,
  } = await import("../ai/parseCap");

  const fileName = "milpitas-cap.pdf";
  useBuildStore.getState().clearAll();

  const centers = capCentersToExtractionResult([
    { name: "City Council", totalCost: 631_378, confidence: "high" },
  ], fileName);
  const bases = capBasesToExtractionResult([
    { name: "City Council Agenda Items", source: "Exhibit 5", driverKey: "OTHER", confidence: "high" },
  ], fileName);
  const importedBases = [...bases.mapped, ...bases.lowConfidence].map((row) => row.entity);
  const basisUnits = capBasisUnitsToExtractionResult([], fileName);
  // No allocationPercent field — the exact shape an AI response omits it
  // in when the source document only publishes a dollar split.
  const pools = capPoolsToExtractionResult([
    { center: "City Council", pool: "City Council", amount: 631_378, basis: "City Council Agenda Items", confidence: "high" },
  ], fileName, importedBases);
  assert.ok(!Number.isFinite(pools.mapped[0].entity.allocationPercent),
    "precondition: the pool carries the NaN sentinel into the merge");
  const directAllocations = capDirectAllocationsToExtractionResult([], pools, fileName);

  useBuildStore.getState().mergeCapBundle({ centers, bases, basisUnits, pools, directAllocations }, fileName);

  const state = useBuildStore.getState();
  const merged = state.capPools.find((p) => p.pool === "City Council" && p.center === "City Council");
  assert.ok(merged, "the pool merges into capPools rather than being dropped");
  assert.ok(Number.isFinite(merged!.allocationPercent),
    "mergeCapBundle backfills the NaN sentinel to a real number");
  assert.equal(merged!.allocationPercent, 100,
    "backfilled allocationPercent = amount / center total * 100 (631378 / 631378 * 100)");
  console.log("  ✓ mergeCapBundle backfills a missing allocationPercent from amount / center total");

  console.log("\nAll capBundleMerge assertions passed.");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
