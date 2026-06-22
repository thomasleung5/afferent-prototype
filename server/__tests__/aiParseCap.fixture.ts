import assert from "node:assert/strict";
import {
  alignRecoveredBasisNames,
  evaluateDeterministicResult,
  isDistributionShareBasis,
  mergeBasisUnits,
  missingScheduleBasisNames,
  parseBasisUnitsResponse,
  receiverTotalMatchesPrintedTotal,
  shouldSkipMissingScheduleBasis,
} from "../aiParseCap";

const gross = {
  basis: "Gross Operating Expenses",
  source: "Exhibit 5",
  receivers: [{
    dept: "Planning",
    glCode: "100-512-0",
    deptCode: "PLAN",
    units: 2_030_145,
    confidence: "high" as const,
  }],
};

{
  const rows = parseBasisUnitsResponse(JSON.stringify({ basisUnits: [gross] }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].basis, "Gross Operating Expenses");
  console.log("  ✓ CAP schedule response parses complete JSON");
}

{
  const truncated = '{"basisUnits":['
    + JSON.stringify(gross) + ","
    + '{"basis":"Modified Operating Expenses","receivers":[';
  const rows = parseBasisUnitsResponse(truncated);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].basis, "Gross Operating Expenses");
  console.log("  ✓ CAP schedule response recovers complete rows from truncation");
}

{
  const bases = [
    { name: "Gross Operating Expenses", source: "Document", driverKey: "EXPEND", confidence: "high" as const },
    { name: "City Council Agenda Items", source: "Document", driverKey: "AGENDA", confidence: "high" as const },
    { name: "Direct Assignment", source: "Document", driverKey: "DIRECT", confidence: "high" as const },
  ];
  const pools = [
    {
      center: "City Manager", pool: "General Service", allocationPercent: 50,
      amount: 100, basis: "Gross Operating Expenses", confidence: "high" as const,
    },
    {
      center: "City Council", pool: "Council", allocationPercent: 100,
      amount: 200, basis: "City Council Agenda Items", confidence: "high" as const,
    },
    {
      center: "Finance", pool: "Direct", allocationPercent: 10,
      amount: 50, basis: "Direct Assignment", confidence: "high" as const,
    },
  ];
  const agenda = {
    basis: "City Council Agenda Items",
    receivers: [{
      dept: "Planning", glCode: "100-512-0", units: 4, confidence: "high" as const,
    }],
  };
  assert.deepEqual(
    missingScheduleBasisNames(bases, [agenda], pools),
    ["Gross Operating Expenses"],
    "legacy driverKey 'DIRECT' bases are still treated as direct and skipped",
  );
  console.log("  ✓ CAP schedule recovery: legacy driverKey DIRECT bases skip recovery");
}

{
  // Post-refactor: bases may have no recognizable driverKey at all. Skip
  // pools whose name appears in directAllocations — the import will fold
  // those into a synthetic basis schedule. Other pools whose basis has
  // no schedule still surface for recovery.
  const bases = [
    { name: "Gross Operating Expenses", source: "Document", driverKey: "OTHER", confidence: "high" as const },
    { name: "Novel Custom Basis",       source: "Document", driverKey: "OTHER", confidence: "high" as const },
    { name: "Town-Wide Support",        source: "Document", driverKey: "OTHER", confidence: "high" as const },
  ];
  const pools = [
    {
      center: "City Manager", pool: "General Service", allocationPercent: 50,
      amount: 100, basis: "Gross Operating Expenses", confidence: "high" as const,
    },
    {
      center: "City Council", pool: "Town-Wide Support", allocationPercent: 100,
      amount: 200, basis: "Town-Wide Support", confidence: "high" as const,
    },
    {
      center: "City Manager", pool: "Law Enforcement Contract", allocationPercent: 10,
      amount: 50, basis: "Novel Custom Basis", confidence: "high" as const,
    },
  ];
  const directAllocations = [
    {
      pool: "Law Enforcement Contract",
      center: "City Manager",
      receivers: [{
        dept: "Sheriff", glCode: "100-700-0", deptCode: "OTHER", percent: 100, confidence: "high" as const,
      }],
    },
  ];
  assert.deepEqual(
    missingScheduleBasisNames(bases, [], pools, directAllocations),
    ["Gross Operating Expenses", "Town-Wide Support"],
    "Direct pools skip schedule recovery; their bases (here Novel Custom Basis) drop out",
  );
  console.log("  ✓ CAP schedule recovery: direct-allocation pools skip schedule lookup regardless of driverKey");
}

{
  const aligned = alignRecoveredBasisNames([{
    ...gross,
    basis: "Purchasing Staff Time Analysis",
  }], ["Purchasing Time Analysis"]);
  assert.equal(aligned[0].basis, "Purchasing Time Analysis");
  console.log("  ✓ CAP schedule recovery normalizes purchasing basis aliases");
}

{
  const aligned = alignRecoveredBasisNames([{
    ...gross,
    basis: "Attorney Workload",
  }], ["City Attorney Workload"]);
  assert.equal(aligned[0].basis, "City Attorney Workload");
  console.log("  ✓ single-basis recovery preserves the requested catalog name");
}

{
  const replacement = {
    ...gross,
    receivers: [{ ...gross.receivers[0], units: 99 }],
  };
  const merged = mergeBasisUnits([gross], [replacement]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].receivers[0].units, 99);
  console.log("  ✓ recovered CAP schedules replace same-name first-pass schedules");
}

{
  assert.equal(
    receiverTotalMatchesPrintedTotal(
      { printedTotal: 372.92 },
      [{ units: 6 }, { units: 366.92 }],
    ),
    true,
    "deterministic schedule can prove itself against the printed total",
  );
  assert.equal(
    receiverTotalMatchesPrintedTotal(
      { printedTotal: 372.92 },
      [{ units: 6 }, { units: 360 }],
    ),
    false,
    "deterministic schedule that does not reconcile should not override uncertainty",
  );
  assert.equal(
    receiverTotalMatchesPrintedTotal({}, [{ units: 372.92 }]),
    false,
    "missing printed total cannot prove deterministic completeness",
  );
  console.log("  ✓ deterministic CAP schedules use printed total as reconciliation evidence");
}

{
  // "As Total ... Organization"-style bases print a department's
  // percentage SHARE of the total; their literal Value sub-column rounds
  // to whole numbers and prints a dash (not "0") for any department under
  // ~0.5% share, so the deterministic total legitimately undercounts the
  // printed grand total. `allowUndercount` lets that known-incomplete
  // result stand rather than falling back to AI's own (worse) guess, but
  // must still catch a genuine overcount — that's still a row-shift/
  // double-count bug, not a documented source-data limitation.
  assert.equal(
    receiverTotalMatchesPrintedTotal(
      { printedTotal: 100 },
      [{ units: 94 }],
      { allowUndercount: true },
    ),
    true,
    "allowUndercount trusts a deterministic total that falls short of the printed total",
  );
  assert.equal(
    receiverTotalMatchesPrintedTotal(
      { printedTotal: 100 },
      [{ units: 110 }],
      { allowUndercount: true },
    ),
    false,
    "allowUndercount still distrusts a deterministic total that exceeds the printed total",
  );
  console.log("  ✓ allowUndercount only relaxes the gate for undercounting, not overcounting");
}

{
  assert.equal(isDistributionShareBasis("As Total City Manager Organization"), true);
  assert.equal(isDistributionShareBasis("  as total of something  "), true);
  assert.equal(isDistributionShareBasis("Modified Operating Expenses"), false);
  assert.equal(isDistributionShareBasis("Gross Operating Expenses"), false);
  console.log("  ✓ isDistributionShareBasis recognizes only \"As Total ...\" basis names");
}

{
  // End-to-end: the same total-mismatch case from above (which fails the
  // default strict gate) is trusted once routed through
  // evaluateDeterministicResult with allowUndercount set, mirroring the
  // call site's `{ allowUndercount: isDistributionShareBasis(basisName) }`.
  const row = { printedTotal: 100 };
  const result = { receivers: [{ dept: "Land Development", glCode: "100-413-0", units: 94 }], unmatchedReceivers: [] };

  const strict = evaluateDeterministicResult(row, result);
  assert.deepEqual(strict, { trust: false, reason: "total-mismatch" });

  const relaxed = evaluateDeterministicResult(row, result, { allowUndercount: true });
  assert.deepEqual(relaxed, { trust: true });
  console.log("  ✓ evaluateDeterministicResult trusts an undercounted distribution-share basis when allowUndercount is set");
}

{
  // Regression: `evaluatePdfReceiverGroup` (the derive-from-PDF path used
  // at every real call site) always returns `unmatchedReceivers: []`,
  // since it has no AI candidate list to fail to match against. A gate
  // that only distrusted a result via `unmatchedReceivers.length > 0`
  // could never catch a deterministic extraction that silently
  // undercounted receivers — exactly what happened in production
  // (Gross/Modified Operating Expenses, FTE, Cash and Investments all
  // landed below their printed totals while still reporting zero
  // unmatched receivers). This case is the one that must fail trust.
  const decision = evaluateDeterministicResult(
    { printedTotal: 189_758_589 },
    { receivers: [{ dept: "Planning", glCode: "100-512-0", units: 150_000_000 }], unmatchedReceivers: [] },
  );
  assert.deepEqual(decision, { trust: false, reason: "total-mismatch" });
  console.log("  ✓ evaluateDeterministicResult distrusts a total mismatch even with zero unmatched receivers");
}

{
  const decision = evaluateDeterministicResult(
    { printedTotal: 372.92 },
    { receivers: [{ dept: "Planning", glCode: "100-512-0", units: 6 }], unmatchedReceivers: [{ dept: "Housing", glCode: "100-700-0" }] },
  );
  assert.deepEqual(decision, { trust: false, reason: "unmatched-receivers" });
  console.log("  ✓ evaluateDeterministicResult distrusts unmatched receivers even if the total happens to reconcile");
}

{
  const decision = evaluateDeterministicResult(
    {},
    { receivers: [], unmatchedReceivers: [] },
  );
  assert.deepEqual(decision, { trust: false, reason: "no-resolved-receivers" });
  console.log("  ✓ evaluateDeterministicResult distrusts an empty result with no printed total to check");
}

{
  const decision = evaluateDeterministicResult(
    { printedTotal: 372.92 },
    { receivers: [{ dept: "Planning", glCode: "100-512-0", units: 6 }, { dept: "Recreation", glCode: "100-600-0", units: 366.92 }], unmatchedReceivers: [] },
  );
  assert.deepEqual(decision, { trust: true });
  console.log("  ✓ evaluateDeterministicResult trusts a clean, reconciled result");
}

{
  // No printed total to reconcile against — a non-empty, fully-matched
  // result is still trusted (existing schedules without a printed total
  // must keep working).
  const decision = evaluateDeterministicResult(
    {},
    { receivers: [{ dept: "Planning", glCode: "100-512-0", units: 6 }], unmatchedReceivers: [] },
  );
  assert.deepEqual(decision, { trust: true });
  console.log("  ✓ evaluateDeterministicResult trusts a fully-matched result with no printed total to reconcile");
}

{
  // Regression: the primary AI CAP parse's own `printedTotal` field is a
  // separate, fallible extraction — it can itself be wrong even when the
  // deterministic receiver units are correct (Modified Operating Expenses
  // on the Milpitas CAP: AI reported 153,010,013 vs. the schedule's true
  // printed grand total of 154,531,719). The call site in aiParseCap.ts
  // builds a `reconciliationRow` that prefers `result.printedTotalFromPdf`
  // (read deterministically from the same column as the receivers) over
  // the AI's `row.printedTotal` before calling `evaluateDeterministicResult`.
  // Without that override, a correct deterministic result is wrongly
  // distrusted; with it, the same result is trusted.
  const row = { printedTotal: 153_010_013 };
  const result = {
    receivers: [{ dept: "Water M & O Fund", glCode: "400-0", units: 154_531_719 }],
    unmatchedReceivers: [],
    printedTotalFromPdf: 154_531_719,
  };

  const withoutOverride = evaluateDeterministicResult(row, result);
  assert.deepEqual(withoutOverride, { trust: false, reason: "total-mismatch" },
    "the AI's own mis-read printedTotal alone would wrongly reject a correct result");

  const reconciliationRow = result.printedTotalFromPdf != null
    ? { ...row, printedTotal: result.printedTotalFromPdf }
    : row;
  const withOverride = evaluateDeterministicResult(reconciliationRow, result);
  assert.deepEqual(withOverride, { trust: true },
    "preferring the schedule's own printed Grand Total recovers trust in the correct result");
  console.log("  ✓ printedTotalFromPdf override recovers trust when the AI's printedTotal is wrong");
}

{
  // Regression: the missing-schedule recovery loop (bases the primary AI
  // parse never returned a basisUnits row for at all) has no AI-extracted
  // row to fall back to, unlike the primary per-basis loop. A prior change
  // made it hard-skip on ANY distrust reason, which silently dropped real
  // receiver data for every total-mismatch/unmatched-receivers basis when
  // AI schedule recovery is disabled — i.e. every CAP import in the default
  // dev config, not just one vendor. Only "no-resolved-receivers" (nothing
  // to show at all) should skip; the others have data worth surfacing with
  // a review flag instead of being dropped.
  assert.equal(shouldSkipMissingScheduleBasis({ trust: true }), false,
    "a trusted result is never skipped");
  assert.equal(shouldSkipMissingScheduleBasis({ trust: false, reason: "total-mismatch" }), false,
    "a total-mismatch result still has receiver data and must be merged, not dropped");
  assert.equal(shouldSkipMissingScheduleBasis({ trust: false, reason: "unmatched-receivers" }), false,
    "an unmatched-receivers result still has receiver data and must be merged, not dropped");
  assert.equal(shouldSkipMissingScheduleBasis({ trust: false, reason: "no-resolved-receivers" }), true,
    "a result with zero receivers has nothing to merge and should hard-skip");
  console.log("  ✓ Missing-schedule loop only hard-skips when there are zero receivers to show");
}

console.log("\nAll aiParseCap assertions passed.");
