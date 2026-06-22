/* CAP document "profiles" are prompt-tuning + detection hints keyed by the
 * originating vendor's typical document conventions (section naming, table
 * layout, receiver-identity formatting). They are NOT separate business
 * schemas: every profile feeds the same normalized CAP entities (pools,
 * bases, receivers) through the same parser. A profile only changes which
 * promptGuidance text and deterministicScheduleMode the parser uses to read
 * a given document's particular layout. */

export type CapDocumentProfileId =
  | "clearsource-allocation-inventory"
  | "matrix-provider-detail"
  | "nbs-exhibit-a-detail"
  | "generic-cap";

export interface CapDocumentProfile {
  id: CapDocumentProfileId;
  vendor: "ClearSource" | "Matrix" | "NBS" | "Generic";
  label: string;
  deterministicScheduleMode: "allocation-inventory" | "provider-detail" | "generic";
  promptGuidance: string;
}

const CLEAR_SOURCE_PROFILE: CapDocumentProfile = {
  id: "clearsource-allocation-inventory",
  vendor: "ClearSource",
  label: "ClearSource allocation-factor inventory",
  deterministicScheduleMode: "allocation-inventory",
  promptGuidance: `DOCUMENT PROFILE — ClearSource allocation-factor inventory:
- These reports commonly publish Section/Exhibit 5 as an "Inventory of Allocation Factors and Resulting Metrics" with several parallel basis groups over the same receiver spine.
- Treat each named Value column as a distinct basis schedule. Import every positive Value row, including indirect/internal service receivers, and use "Grand Total: All Services" when both All Services and Direct Services totals are printed.
- Receiver identity may be split across Fund, Organization/Department, and Division/Cost Pool columns. Join those printed segments in order, preserve zero segments, and use "Ex. #" markers to distinguish duplicate direct-service rows from central-service rows.
- For cost centers and pools, prefer the center's "Determination of Allocable Central Services Expense" detail page and the "Central Services Department / Indirect Cost Pool Allocation Basis" summary over high-level comparison/narrative pages. The detail page's Total Expense Basis / Cost Pools row is authoritative for the center total and pool amounts.
- When a ClearSource center is split into named functions such as General Service and Specific Service, emit one pool per named function. The center total is the full allocable amount before the split; each pool amount is the dollar amount in that function's column, and the pool basis comes from the allocation-basis summary table.
- Do not treat direct-services summary rows, comparison-to-prior-plan rows, or distribution outcome tables as source cost-center/pool definitions.`,
};

const MATRIX_PROFILE: CapDocumentProfile = {
  id: "matrix-provider-detail",
  vendor: "Matrix",
  label: "Matrix provider-detail CAP",
  deterministicScheduleMode: "provider-detail",
  promptGuidance: `DOCUMENT PROFILE — Matrix provider-detail CAP:
- Matrix reports are organized around provider/function "ALLOCATION DETAIL" pages, with summary pages such as "Summary of Functions and Allocation Bases" and "Providers"/"Grantee" listings.
- Units belong to the provider/function allocation-detail tables for the named basis. Do not treat dollar columns such as Allocated, Gross, Direct, First, Second, Billed, Allocation, or Total as basis units.
- Use the function/basis summary to map each provider pool to its basis, then read the corresponding detail table for receiver units when the table prints units.
- The ClearSource parallel allocation-inventory assumptions do not apply unless the document separately prints a matching inventory table.`,
};

const NBS_PROFILE: CapDocumentProfile = {
  id: "nbs-exhibit-a-detail",
  vendor: "NBS",
  label: "NBS Exhibit A CAP",
  deterministicScheduleMode: "provider-detail",
  promptGuidance: `DOCUMENT PROFILE — NBS Exhibit A CAP:
- NBS reports commonly use Exhibit A sections such as "ALLOCATION INVENTORY", "ALLOCABLE BUDGET UNITS", "ALLOCATION DETAIL", and "ALLOCATION SUMMARY".
- Treat allocable budget units as potential cost centers even when their own budget is zero; incoming costs may still be redistributed by their allocation detail schedules.
- Units should come from allocation-detail tables for the relevant budget unit/function. Do not confuse allocation-dollar columns or full-cost iteration summaries with raw basis units.
- The ClearSource parallel allocation-inventory assumptions do not apply unless the document separately prints a matching inventory table.`,
};

const GENERIC_PROFILE: CapDocumentProfile = {
  id: "generic-cap",
  vendor: "Generic",
  label: "Generic CAP",
  deterministicScheduleMode: "generic",
  promptGuidance: `DOCUMENT PROFILE — generic CAP:
- Use the document's own headings and table labels to distinguish cost centers, basis definitions, basis-unit schedules, cost pools, and direct allocations.
- Do not assume a vendor-specific layout unless the report clearly matches one.`,
};

function normalizeProfileText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function detectCapDocumentProfileFromText(text: string): CapDocumentProfile {
  const normalized = normalizeProfileText(text);

  if (
    normalized.includes("clearsource financial consulting")
    || normalized.includes("inventory of allocation factors and resulting metrics")
    || (normalized.includes("exhibit 5") && normalized.includes("allocation factors"))
  ) {
    return CLEAR_SOURCE_PROFILE;
  }

  if (
    normalized.includes("matrix consulting group")
    || (
      normalized.includes("summary of functions and allocation bases")
      && normalized.includes("allocated gross direct first second")
    )
  ) {
    return MATRIX_PROFILE;
  }

  if (
    normalized.includes("prepared by nbs")
    || normalized.includes("allocable budget units")
    || (
      normalized.includes("allocation inventory")
      && normalized.includes("full cost iteration")
    )
  ) {
    return NBS_PROFILE;
  }

  return GENERIC_PROFILE;
}

export function capDocumentProfileGuidance(profile: CapDocumentProfile): string {
  return profile.promptGuidance;
}
