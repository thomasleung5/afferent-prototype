/* Fixture for the role → permission helpers in server/studies/authorization.ts.
 *
 * Run with: npm run test:study-authorization
 *
 * The contract these helpers encode mirrors the RLS policies in the
 * initial migration; this fixture exists to catch drift between the
 * two surfaces. */

import assert from "node:assert/strict";
import {
  canCreateStudy, canCreateVersion, canMutateDraft, canRead, canUpdateStudy,
  isValidRole,
} from "../studies/authorization";

let passed = 0;

// ── isValidRole accepts the four documented roles, nothing else ──
{
  for (const r of ["owner", "admin", "analyst", "viewer"]) {
    assert.equal(isValidRole(r), true, `role '${r}' should be valid`);
  }
  for (const r of ["", "guest", "service_role", null, undefined, 42 as unknown as string]) {
    assert.equal(isValidRole(r as string), false, `'${String(r)}' should NOT be valid`);
  }
  passed++;
}

// ── canRead — every documented role can read ────────────────────
{
  assert.equal(canRead("owner"), true);
  assert.equal(canRead("admin"), true);
  assert.equal(canRead("analyst"), true);
  assert.equal(canRead("viewer"), true);
  assert.equal(canRead("guest"), false);
  assert.equal(canRead(null), false);
  assert.equal(canRead(undefined), false);
  passed++;
}

// ── canMutateDraft — owner/admin/analyst yes, viewer no ─────────
{
  assert.equal(canMutateDraft("owner"), true);
  assert.equal(canMutateDraft("admin"), true);
  assert.equal(canMutateDraft("analyst"), true);
  assert.equal(canMutateDraft("viewer"), false);
  assert.equal(canMutateDraft(null), false);
  passed++;
}

// ── canCreateStudy — same set as canMutateDraft ─────────────────
{
  assert.equal(canCreateStudy("owner"), true);
  assert.equal(canCreateStudy("admin"), true);
  assert.equal(canCreateStudy("analyst"), true);
  assert.equal(canCreateStudy("viewer"), false);
  passed++;
}

// ── canCreateVersion — same as canMutateDraft ───────────────────
{
  assert.equal(canCreateVersion("owner"), true);
  assert.equal(canCreateVersion("admin"), true);
  assert.equal(canCreateVersion("analyst"), true);
  assert.equal(canCreateVersion("viewer"), false);
  passed++;
}

// ── canUpdateStudy — narrower: owner + admin only ───────────────
{
  assert.equal(canUpdateStudy("owner"), true);
  assert.equal(canUpdateStudy("admin"), true);
  assert.equal(canUpdateStudy("analyst"), false, "analysts cannot rename/archive");
  assert.equal(canUpdateStudy("viewer"), false);
  passed++;
}

// ── never crashes on garbage input ──────────────────────────────
{
  assert.equal(canRead(null), false);
  assert.equal(canMutateDraft(null), false);
  assert.equal(canCreateStudy(null), false);
  assert.equal(canCreateVersion(null), false);
  assert.equal(canUpdateStudy(null), false);
  passed++;
}

console.log(`PASS: studyAuthorization.fixture — ${passed} cases`);
