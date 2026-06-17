import assert from "node:assert/strict";
import { detectCapDocumentProfileFromText } from "../capDocumentProfiles";

{
  const profile = detectCapDocumentProfileFromText(`
    ClearSource Financial Consulting
    Exhibit 5 CITY OF MILPITAS FULL COST ALLOCATION PLAN
    Inventory of Allocation Factors and Resulting Metrics
    Grand Total: All Services
  `);
  assert.equal(profile.id, "clearsource-allocation-inventory");
  assert.equal(profile.deterministicScheduleMode, "allocation-inventory");
  assert.match(profile.promptGuidance, /parallel basis groups/i);
  assert.match(profile.promptGuidance, /Determination of Allocable Central Services Expense/i);
  console.log("  ✓ ClearSource allocation-factor inventory profile detected");
}

{
  const profile = detectCapDocumentProfileFromText(`
    matrix consulting group
    FULL COST ALLOCATION PLAN FY24 Budgeted Expenditures CITY OF CUPERTINO
    Summary of Functions and Allocation Bases
    Allocation Allocated Gross Direct First Second Units Percent Allocation Billed Allocation Allocation Total
  `);
  assert.equal(profile.id, "matrix-provider-detail");
  assert.equal(profile.deterministicScheduleMode, "provider-detail");
  assert.match(profile.promptGuidance, /Do not treat dollar columns/i);
  console.log("  ✓ Matrix provider-detail profile detected");
}

{
  const profile = detectCapDocumentProfileFromText(`
    Prepared by NBS
    Town of Los Altos Hills Cost Allocation Plan
    Exhibit A ALLOCATION INVENTORY
    ALLOCABLE BUDGET UNITS
    Full Cost Iteration
  `);
  assert.equal(profile.id, "nbs-exhibit-a-detail");
  assert.equal(profile.deterministicScheduleMode, "provider-detail");
  assert.match(profile.promptGuidance, /budget units/i);
  console.log("  ✓ NBS Exhibit A profile detected");
}

{
  const profile = detectCapDocumentProfileFromText(`
    Citywide Cost Allocation Plan
    Indirect Cost Pool Detail
    Allocation Bases
  `);
  assert.equal(profile.id, "generic-cap");
  assert.equal(profile.deterministicScheduleMode, "generic");
  console.log("  ✓ Generic CAP fallback profile detected");
}

console.log("CAP document profile fixtures passed");
