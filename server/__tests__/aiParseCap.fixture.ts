import assert from "node:assert/strict";
import {
  alignRecoveredBasisNames,
  evaluateDeterministicResult,
  mergeBasisUnits,
  missingScheduleBasisNames,
  parseBasisUnitsResponse,
  receiverTotalMatchesPrintedTotal,
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

console.log("\nAll aiParseCap assertions passed.");
