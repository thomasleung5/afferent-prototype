/* Deterministic fixture for the productive-hours breakdown helper.
 *
 * Run with: npm run test:productive-hours
 *
 * Verifies:
 *   1. With no row overrides, all six default deductions are returned
 *      verbatim and the net matches the citywide 1,720-hour assumption.
 *   2. Each deduction is tagged with the correct source (row vs default).
 *   3. Row-level overrides take precedence over defaults on a per-field
 *      basis, with unset fields still falling back.
 *   4. Net productive hours and productive percent recompute from the
 *      resolved deduction set.
 *   5. Custom defaults (e.g. an alternate gross-hours baseline) flow
 *      through.
 *   6. Negative overrides are clamped to zero rather than inflating the
 *      net above gross.
 */

import assert from "node:assert/strict";
import type { Position } from "../types";
import {
  calculateProductiveHours, DEFAULT_PRODUCTIVE_HOURS,
} from "../productiveHours";

type Row = Pick<Position, "productiveHoursBreakdown">;

// ── 1. Defaults only ──────────────────────────────────────────────────────
{
  const row: Row = {};
  const r = calculateProductiveHours(row);

  assert.equal(r.grossAnnualHours, 2080);
  assert.equal(r.deductions.length, 6);
  assert.equal(r.totalNonproductiveHours, 360);
  assert.equal(r.netProductiveHours, 1720);
  assert.equal(r.productivePercent.toFixed(2), "82.69");

  for (const d of r.deductions) {
    assert.equal(d.fromRow, false, `${d.key} should report fromRow=false`);
  }
}

// ── 2. Order + labels are stable ──────────────────────────────────────────
{
  const r = calculateProductiveHours({});
  const keys = r.deductions.map((d) => d.key);
  assert.deepEqual(keys, ["vacation", "sick", "holidays", "admin", "training", "other"]);
}

// ── 3. Partial row override ───────────────────────────────────────────────
{
  // Override vacation only — every other field still uses the default.
  const row: Row = { productiveHoursBreakdown: { vacation: 160 } };
  const r = calculateProductiveHours(row);

  const vac = r.deductions.find((d) => d.key === "vacation")!;
  assert.equal(vac.hours, 160);
  assert.equal(vac.fromRow, true);

  const sick = r.deductions.find((d) => d.key === "sick")!;
  assert.equal(sick.hours, DEFAULT_PRODUCTIVE_HOURS.sick);
  assert.equal(sick.fromRow, false);

  // 160 + 96 + 104 + 16 + 24 + 0 = 400; 2080 − 400 = 1680.
  assert.equal(r.totalNonproductiveHours, 400);
  assert.equal(r.netProductiveHours, 1680);
}

// ── 4. Spec-example breakdown reconciles ──────────────────────────────────
{
  // The shape from the spec: 120 vacation + 96 sick + 104 holidays + 24
  // training, no admin/other → 1736 net productive.
  const row: Row = {
    productiveHoursBreakdown: {
      vacation: 120, sick: 96, holidays: 104, admin: 0, training: 24, other: 0,
    },
  };
  const r = calculateProductiveHours(row);
  assert.equal(r.totalNonproductiveHours, 344);
  assert.equal(r.netProductiveHours, 1736);
}

// ── 5. Custom defaults flow through ───────────────────────────────────────
{
  const r = calculateProductiveHours({}, {
    ...DEFAULT_PRODUCTIVE_HOURS,
    grossAnnualHours: 2000,
    holidays: 80,
  });
  // vacation 120 + sick 96 + holidays 80 + admin 16 + training 24 + other 0 = 336
  // net 2000 − 336 = 1664
  assert.equal(r.grossAnnualHours, 2000);
  assert.equal(r.totalNonproductiveHours, 336);
  assert.equal(r.netProductiveHours, 1664);
}

// ── 6. Negative overrides clamp to zero ───────────────────────────────────
{
  const row: Row = { productiveHoursBreakdown: { sick: -50 } };
  const r = calculateProductiveHours(row);
  const sick = r.deductions.find((d) => d.key === "sick")!;
  assert.equal(sick.hours, 0);
  // total drops by the default 96 to 264; net climbs to 1816.
  assert.equal(r.totalNonproductiveHours, 264);
  assert.equal(r.netProductiveHours, 1816);
}

// ── 7. Override of zero is honored (not treated as missing) ───────────────
{
  const row: Row = { productiveHoursBreakdown: { training: 0 } };
  const r = calculateProductiveHours(row);
  const tr = r.deductions.find((d) => d.key === "training")!;
  assert.equal(tr.hours, 0);
  assert.equal(tr.fromRow, true);
}

// eslint-disable-next-line no-console
console.log("All productive-hours assertions passed.");
