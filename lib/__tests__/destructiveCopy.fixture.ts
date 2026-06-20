/* Fixture for the destructive-action confirmation copy helpers.
 *
 * Run with: npm run test:destructive-copy
 *
 * Verifies the copy explicitly discloses the server-draft
 * side-effect when relevant and stays quiet otherwise. */

import assert from "node:assert/strict";
import {
  resetConfirmCopy, clearConfirmCopy, switchConfirmCopy,
} from "../studies/destructiveCopy";

let passed = 0;

// ── reset: local-only seeded workspace ───────────────────────────
{
  const msg = resetConfirmCopy({
    jurisdictionName: "Maplewood",
    activeStudyName: null,
  });
  assert.match(msg, /Reset Maplewood to the seed model/);
  assert.match(msg, /Local edits will be discarded/);
  assert.doesNotMatch(msg, /server draft/i,
    "no server-draft mention when no active study");
  passed++;
}

// ── reset: local-only blank workspace ────────────────────────────
{
  const msg = resetConfirmCopy({
    jurisdictionName: "Los Altos Hills",
    activeStudyName: null,
    blankWorkspace: true,
  });
  assert.match(msg, /Reset Los Altos Hills to a blank workspace/);
  assert.match(msg, /Local edits will be discarded/);
  assert.doesNotMatch(msg, /seed model/i);
  passed++;
}

// ── reset: with active study ─────────────────────────────────────
{
  const msg = resetConfirmCopy({
    jurisdictionName: "Los Altos Hills",
    activeStudyName: "FY26 Fee Study",
    blankWorkspace: true,
  });
  assert.match(msg, /Reset Los Altos Hills/);
  assert.match(msg, /blank workspace/);
  assert.match(msg, /Local edits will be discarded/);
  assert.match(msg, /Because "FY26 Fee Study" is active/);
  assert.match(msg, /auto-save will also update that server draft/);
  passed++;
}

// ── clear: local-only ────────────────────────────────────────────
{
  const msg = clearConfirmCopy({
    jurisdictionName: "Los Altos Hills",
    activeStudyName: null,
    blankWorkspace: true,
  });
  assert.match(msg, /Clear all build data for Los Altos Hills/);
  assert.match(msg, /empties every input slice/);
  assert.doesNotMatch(msg, /seed/i);
  assert.doesNotMatch(msg, /server draft/i);
  passed++;
}

// ── clear: with active study ─────────────────────────────────────
{
  const msg = clearConfirmCopy({
    jurisdictionName: "Los Altos Hills",
    activeStudyName: "FY26 Fee Study",
  });
  assert.match(msg, /Clear all build data/);
  assert.match(msg, /Because "FY26 Fee Study" is active/);
  assert.match(msg, /server draft/);
  passed++;
}

// ── switch: local-only → no confirm needed ───────────────────────
{
  const r = switchConfirmCopy({
    jurisdictionName: "Goleta",
    activeStudyName: null,
  });
  assert.equal(r.needsConfirm, false);
  assert.equal(r.message, "");
  passed++;
}

// ── switch: with active study → confirm with detach copy ─────────
{
  const r = switchConfirmCopy({
    jurisdictionName: "Goleta",
    activeStudyName: "FY26 Fee Study",
  });
  assert.equal(r.needsConfirm, true);
  assert.match(r.message, /Switch to Goleta/);
  assert.match(r.message, /detached/);
  assert.match(r.message, /server draft will not be modified/);
  assert.match(r.message, /re-select the study/);
  passed++;
}

// ── empty active-study name behaves like local-only ──────────────
{
  // Empty string is the documented placeholder for "id-only legacy
  // state". Helpers should treat falsy / empty names as no active
  // study for copy purposes.
  const msg = resetConfirmCopy({
    jurisdictionName: "Los Altos Hills",
    activeStudyName: "",
  });
  assert.doesNotMatch(msg, /server draft/i,
    "empty-string name is treated as no active study");
  passed++;
}

console.log(`PASS: destructiveCopy.fixture — ${passed} cases`);
