import assert from "node:assert/strict";
import {
  alignRecoveredBasisNames,
  mergeBasisUnits,
  missingScheduleBasisNames,
  parseBasisUnitsResponse,
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
    "only referenced non-DIRECT bases without valid schedules are recovered",
  );
  console.log("  ✓ CAP schedule recovery targets only missing referenced bases");
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

console.log("\nAll aiParseCap assertions passed.");
