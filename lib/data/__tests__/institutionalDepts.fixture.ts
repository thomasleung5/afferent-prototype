/* Round-trip checks for the institutional-dept registry.
 *
 * Run with: npm run test:inst-depts
 *
 * Pins the registry shape so a future edit can't drift one projection out
 * of sync with INST_DEPTS — every set/list/map below is computed from the
 * catalog, so adding a dept means appending to INST_DEPTS and nothing else.
 */

import assert from "node:assert/strict";
import {
  INST_DEPTS,
  INDIRECT_DEPT_CODES,
  INST_DEPT_CODE_LIST,
  NAME_BY_DEPT_CODE,
  INDIRECT_CODE_BY_NAME,
} from "../institutionalDepts";

// ── 1. Catalog covers all 16 institutional depts ──────────────────────────
assert.equal(INST_DEPTS.length, 16, "catalog size");
assert.equal(
  INST_DEPTS.filter((d) => d.kind === "indirect").length, 9,
  "9 indirect entries",
);
assert.equal(
  INST_DEPTS.filter((d) => d.kind === "direct").length, 7,
  "7 direct entries",
);
console.log("  ✓ catalog has 9 indirect + 7 direct = 16 depts");

// ── 2. Codes are unique ───────────────────────────────────────────────────
const codes = INST_DEPTS.map((d) => d.code);
assert.equal(new Set(codes).size, codes.length, "duplicate code");
console.log("  ✓ every code appears exactly once");

// ── 3. Indirect set matches the kind-filtered catalog ─────────────────────
const indirectFromCatalog = new Set(
  INST_DEPTS.filter((d) => d.kind === "indirect").map((d) => d.code),
);
assert.deepEqual([...INDIRECT_DEPT_CODES].sort(), [...indirectFromCatalog].sort());
console.log("  ✓ INDIRECT_DEPT_CODES matches kind === 'indirect' filter");

// ── 4. Code list mirrors the catalog order ────────────────────────────────
assert.deepEqual(INST_DEPT_CODE_LIST, codes);
console.log("  ✓ INST_DEPT_CODE_LIST preserves catalog order");

// ── 5. Name map covers every code ─────────────────────────────────────────
assert.equal(NAME_BY_DEPT_CODE.size, 16);
for (const d of INST_DEPTS) {
  assert.equal(NAME_BY_DEPT_CODE.get(d.code), d.name);
}
console.log("  ✓ NAME_BY_DEPT_CODE round-trips every entry");

// ── 6. Indirect name → code map matches the indirect rows exactly ─────────
assert.equal(INDIRECT_CODE_BY_NAME.size, 9);
for (const d of INST_DEPTS.filter((d) => d.kind === "indirect")) {
  assert.equal(INDIRECT_CODE_BY_NAME.get(d.name), d.code);
}
console.log("  ✓ INDIRECT_CODE_BY_NAME round-trips indirect entries");

// ── 7. isFeeDept aligns with the DeptCode subset ──────────────────────────
const feeFromCatalog = INST_DEPTS.filter((d) => d.isFeeDept).map((d) => d.code);
assert.deepEqual(feeFromCatalog.sort(),
  ["BLDG", "ENG", "FIRE", "PARKS", "PD", "PLAN"]);
// PW is direct but not fee — easy to break, easy to detect.
const pw = INST_DEPTS.find((d) => d.code === "PW")!;
assert.equal(pw.kind, "direct");
assert.equal(pw.isFeeDept, false);
console.log("  ✓ isFeeDept matches DeptCode subset (PW direct-but-not-fee)");

console.log("\nAll institutionalDepts assertions passed.");
