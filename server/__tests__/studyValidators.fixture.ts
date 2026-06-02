/* Fixture for the /api/studies/* request-body validators.
 *
 * Run with: npm run test:study-validators
 *
 * Pure-function coverage — no DB, no Hono context. Each validator
 * gets a happy path + the reject branches the handler depends on. */

import assert from "node:assert/strict";
import {
  isUuid,
  validateCreateStudy,
  validateSnapshotPayload,
  validateSnapshotField,
  validateCreateVersion,
} from "../studies/validators";

const UUID = "8d4cfa11-3b1a-4a8c-9c0b-2f1e9c7d4321";
const VALID_SNAPSHOT = { services: [], operating: [], studyContext: {} };

let passed = 0;

// ── isUuid ────────────────────────────────────────────────────────
{
  assert.equal(isUuid(UUID), true);
  assert.equal(isUuid(UUID.toUpperCase()), true, "case-insensitive");
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid(""), false);
  passed++;
}

// ── validateCreateStudy: happy path ───────────────────────────────
{
  const r = validateCreateStudy({
    organizationId: UUID,
    name: "  FY26 fee study  ",
    fiscalYear: " FY 2025-26 ",
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.organizationId, UUID);
    assert.equal(r.value.name, "FY26 fee study", "name trimmed");
    assert.equal(r.value.fiscalYear, "FY 2025-26", "fy trimmed");
  }
  passed++;
}

// ── validateCreateStudy: missing org id ───────────────────────────
{
  const r = validateCreateStudy({ name: "x" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /organizationId/);
  passed++;
}

// ── validateCreateStudy: bad org id shape ─────────────────────────
{
  const r = validateCreateStudy({ organizationId: "not-uuid", name: "x" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /UUID/);
  passed++;
}

// ── validateCreateStudy: blank name ───────────────────────────────
{
  const r = validateCreateStudy({ organizationId: UUID, name: "   " });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /blank/);
  passed++;
}

// ── validateCreateStudy: oversize name ────────────────────────────
{
  const r = validateCreateStudy({
    organizationId: UUID,
    name: "x".repeat(201),
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /name must be ≤ 200/);
  passed++;
}

// ── validateCreateStudy: oversize fiscalYear ──────────────────────
{
  const r = validateCreateStudy({
    organizationId: UUID,
    name: "ok",
    fiscalYear: "x".repeat(51),
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /fiscalYear must be ≤ 50/);
  passed++;
}

// ── validateCreateStudy: non-object body ──────────────────────────
{
  assert.equal(validateCreateStudy(null).ok, false);
  assert.equal(validateCreateStudy(42).ok, false);
  assert.equal(validateCreateStudy([]).ok, false);
  passed++;
}

// ── validateCreateStudy: optional fiscalYear ──────────────────────
{
  const r = validateCreateStudy({ organizationId: UUID, name: "ok" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.fiscalYear, undefined);
  passed++;
}

// ── validateSnapshotPayload: happy path ───────────────────────────
{
  const r = validateSnapshotPayload({ snapshot: VALID_SNAPSHOT });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value.snapshot, VALID_SNAPSHOT);
  passed++;
}

// ── validateSnapshotPayload: missing snapshot field ───────────────
{
  const r = validateSnapshotPayload({});
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /snapshot must be an object/);
  passed++;
}

// ── validateSnapshotPayload: snapshot is array ────────────────────
{
  const r = validateSnapshotPayload({ snapshot: [] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /snapshot must be an object/);
  passed++;
}

// ── validateSnapshotPayload: snapshot lacks any canonical field ───
{
  const r = validateSnapshotPayload({ snapshot: { random: 1 } });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /does not look like a BuildSnapshot/);
  passed++;
}

// ── validateSnapshotPayload: expected_revision_id passes through ──
{
  const REV = "550e8400-e29b-41d4-a716-446655440000";
  const r = validateSnapshotPayload({
    snapshot: VALID_SNAPSHOT,
    expected_revision_id: REV,
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.expectedRevisionId, REV);
  passed++;
}

// ── validateSnapshotPayload: omitted expected_revision_id is fine ─
{
  const r = validateSnapshotPayload({ snapshot: VALID_SNAPSHOT });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.expectedRevisionId, undefined);
  passed++;
}

// ── validateSnapshotPayload: bad expected_revision_id shape ───────
{
  const r1 = validateSnapshotPayload({
    snapshot: VALID_SNAPSHOT,
    expected_revision_id: "not-a-uuid",
  });
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.match(r1.message, /expected_revision_id.*UUID/);

  const r2 = validateSnapshotPayload({
    snapshot: VALID_SNAPSHOT,
    expected_revision_id: 42,
  });
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.match(r2.message, /expected_revision_id.*UUID/);
  passed++;
}

// ── validateSnapshotField: accepts each canonical field ───────────
{
  for (const k of ["services", "operating", "studyContext", "productiveHours", "activeFiscalYear"]) {
    const r = validateSnapshotField({ [k]: null });
    assert.equal(r.ok, true, `canonical field '${k}' should be accepted`);
  }
  passed++;
}

// ── validateCreateVersion: happy path defaults status to draft ────
{
  const r = validateCreateVersion({ label: "  Mid-year cut  " });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.label, "Mid-year cut", "label trimmed");
    assert.equal(r.value.status, "draft", "status defaults to draft");
    assert.equal(r.value.notes, undefined);
    assert.equal(r.value.snapshot, undefined, "snapshot optional");
  }
  passed++;
}

// ── validateCreateVersion: every valid status accepted ────────────
{
  for (const s of ["draft", "review", "published", "adopted", "archived"]) {
    const r = validateCreateVersion({ label: "x", status: s });
    assert.equal(r.ok, true, `status '${s}' should pass`);
  }
  passed++;
}

// ── validateCreateVersion: invalid status rejected ────────────────
{
  const r = validateCreateVersion({ label: "x", status: "bogus" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /status must be one of/);
  passed++;
}

// ── validateCreateVersion: blank label rejected ───────────────────
{
  const r = validateCreateVersion({ label: "   " });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /label must not be blank/);
  passed++;
}

// ── validateCreateVersion: oversize label rejected ────────────────
{
  const r = validateCreateVersion({ label: "x".repeat(201) });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /label must be ≤ 200/);
  passed++;
}

// ── validateCreateVersion: oversize notes rejected ────────────────
{
  const r = validateCreateVersion({
    label: "ok",
    notes: "x".repeat(10_001),
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /notes must be ≤ 10000/);
  passed++;
}

// ── validateCreateVersion: embedded snapshot validated ────────────
{
  const r1 = validateCreateVersion({
    label: "ok",
    snapshot: VALID_SNAPSHOT,
  });
  assert.equal(r1.ok, true);
  if (r1.ok) assert.deepEqual(r1.value.snapshot, VALID_SNAPSHOT);

  const r2 = validateCreateVersion({
    label: "ok",
    snapshot: { random: 1 },
  });
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.match(r2.message, /does not look like a BuildSnapshot/);
  passed++;
}

console.log(`PASS: studyValidators.fixture — ${passed} cases`);
