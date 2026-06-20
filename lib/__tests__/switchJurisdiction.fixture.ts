/* Fixture for demo workspace switching.
 *
 * Run with: npm run test:switch-jurisdiction
 *
 * Verifies live blank workspaces clear seeded data without falling back
 * to another jurisdiction's seed.
 */

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
  const { switchJurisdiction } = await import("../active");
  const { useBuildStore } = await import("../store");

  useBuildStore.getState().resetAll();
  useBuildStore.getState().addService();
  assert.ok(useBuildStore.getState().services.length > 0, "dirty workspace starts with a manual service");

  await switchJurisdiction("city-of-milpitas");

  const milpitas = useBuildStore.getState();
  assert.equal(milpitas.activeJurisdictionId, "city-of-milpitas");
  assert.equal(milpitas.activeFiscalYear, "FY 2025-26");
  assert.deepEqual(milpitas.services, []);
  assert.deepEqual(milpitas.operating, []);
  assert.deepEqual(milpitas.productiveHours, []);
  assert.deepEqual(milpitas.capPools, []);
  assert.deepEqual(milpitas.allocationBases, []);
  assert.deepEqual(milpitas.imports, []);
  assert.deepEqual(milpitas.activeFeeDepts, []);
  assert.deepEqual(milpitas.operatingCategoryMappings, {});
  assert.equal(milpitas.stepDownMethod, "double");

  useBuildStore.getState().addService();
  await switchJurisdiction("los-altos-hills");

  const losAltosHills = useBuildStore.getState();
  assert.equal(losAltosHills.activeJurisdictionId, "los-altos-hills");
  assert.equal(losAltosHills.activeFiscalYear, "FY 2025-26");
  assert.deepEqual(losAltosHills.services, []);
  assert.deepEqual(losAltosHills.allocationBases, []);
  assert.deepEqual(losAltosHills.imports, []);

  console.log("PASS: switchJurisdiction.fixture — blank demo workspaces stay empty");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
