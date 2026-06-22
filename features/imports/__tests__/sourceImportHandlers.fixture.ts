/* feeStudyHistoryFromImports fixture.
 *
 * Run with: npm run test:fee-study-history
 *
 * Fee Study uploads write one BuildImportLog entry per domain they touch
 * (Services/Volume/Fees/Positions), all sharing one batchId stamped by
 * useFeeStudyImportHandlers. This pins the grouping contract the Fee Study
 * card's "Recent imports" list depends on:
 *
 *   - Entries sharing a batchId collapse into one history row, rows summed.
 *   - Entries with no batchId (ordinary single-domain imports) are ignored.
 *   - Rows sort newest-first and cap at 4. */

import assert from "node:assert/strict";
import { feeStudyHistoryFromImports } from "../sourceImportHandlers";
import type { BuildImportLog } from "../../../lib/store";
import type { ImportApplyResult } from "../../../lib/parse/types";

function applyResult(overrides: Partial<ImportApplyResult> = {}): ImportApplyResult {
  return {
    domain: "services",
    fileName: "study.pdf",
    rows: 1,
    mapped: 1,
    lowConfidence: 0,
    unmapped: 0,
    duplicates: 0,
    warnings: [],
    ...overrides,
  };
}

function entry(overrides: Partial<BuildImportLog> = {}): BuildImportLog {
  return {
    id: 1,
    domain: "services",
    result: applyResult(),
    at: "2026-06-20T00:00:00.000Z",
    ...overrides,
  };
}

// ── 1. Entries sharing a batchId collapse into one row, rows summed ────
{
  const imports: BuildImportLog[] = [
    entry({
      id: 1, domain: "services", batchId: "batch-1",
      result: applyResult({ domain: "services", rows: 3, fileName: "study.pdf" }),
      at: "2026-06-20T10:00:00.000Z",
    }),
    entry({
      id: 2, domain: "volume", batchId: "batch-1",
      result: applyResult({ domain: "volume", rows: 5, fileName: "study.pdf" }),
      at: "2026-06-20T10:00:00.001Z",
    }),
    entry({
      id: 3, domain: "fees", batchId: "batch-1",
      result: applyResult({ domain: "fees", rows: 2, fileName: "study.pdf" }),
      at: "2026-06-20T10:00:00.002Z",
    }),
  ];

  const history = feeStudyHistoryFromImports(imports);

  assert.equal(history.length, 1, "three same-batch entries collapse into one row");
  assert.equal(history[0].id, "batch-1");
  assert.equal(history[0].fileName, "study.pdf");
  assert.equal(history[0].rows, 10, "rows sum across every domain in the batch");
  console.log("  ✓ entries sharing a batchId collapse into one row, rows summed");
}

// ── 2. Entries with no batchId are ignored ──────────────────────────────
{
  const imports: BuildImportLog[] = [
    entry({ id: 1, domain: "services", at: "2026-06-20T10:00:00.000Z" }), // no batchId
    entry({
      id: 2, domain: "volume", batchId: "batch-2",
      result: applyResult({ domain: "volume", rows: 4, fileName: "study2.pdf" }),
      at: "2026-06-20T11:00:00.000Z",
    }),
  ];

  const history = feeStudyHistoryFromImports(imports);

  assert.equal(history.length, 1, "the non-batch single-domain entry is excluded");
  assert.equal(history[0].id, "batch-2");
  console.log("  ✓ entries with no batchId (ordinary single-domain imports) are ignored");
}

// ── 3. Rows sort newest-first and cap at 4 ──────────────────────────────
{
  const imports: BuildImportLog[] = Array.from({ length: 6 }, (_, i) =>
    entry({
      id: i, domain: "services", batchId: `batch-${i}`,
      result: applyResult({ domain: "services", fileName: `study-${i}.pdf` }),
      at: `2026-06-${10 + i}T00:00:00.000Z`,
    }));

  const history = feeStudyHistoryFromImports(imports);

  assert.equal(history.length, 4, "capped to the 4 most recent batches");
  assert.equal(history[0].id, "batch-5", "newest batch first");
  assert.equal(history[3].id, "batch-2", "oldest of the kept 4 is the 4th-most-recent");
  console.log("  ✓ rows sort newest-first and cap at 4");
}

console.log("\nAll feeStudyHistoryFromImports assertions passed.");
