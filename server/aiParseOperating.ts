import { runPdfParser } from "./aiParseRunner";

const SYSTEM = `You are extracting expenditure line items (both operating AND personnel) from a municipal budget document. The document may be a budget book, an ERP/GL export, a fund-detail report, or a department appendix inside a larger fee study — only the line-item rows matter.

IMPORTANT — if the document is a comprehensive fee study, annual report, or multi-section document:
- Skip narrative chapters, methodology sections, executive summaries, recommendation tables, and revenue/fee tables
- Focus on the expenditure tables: sections titled "Operating Expenditures", "Services & Supplies", "Materials & Services", "Operating Budget Detail", "Expenditure Detail", AND personnel sections titled "Salaries & Benefits", "Personnel", "Personnel Services", "Personnel Budget", "Compensation", or any tabular section listing account-level expenditure lines (operating or personnel) with adopted/budgeted amounts
- In ERP/GL exports, "Salaries & Benefits" may appear as an account_category column value rather than as a section title. Those rows are personnel expenditure line items and MUST be extracted when the department is in scope.
- Do not read or process narrative paragraphs — jump directly to the expenditure tables

Extract every expenditure line item you find — operating AND personnel — and return ONLY this JSON, no prose:

{
  "operating": [
    { "code": "51110", "dept": "PLAN", "sourceDept": "Planning Division", "fiscalYear": "FY 2025-26", "amountType": "adopted", "category": "Other Operational Expenses", "line": "Regular Salaries", "amount": 850000, "include": true, "confidence": "high" },
    { "code": "51210", "dept": "PLAN", "sourceDept": "Planning Division", "fiscalYear": "FY 2025-26", "amountType": "adopted", "category": "Other Operational Expenses", "line": "Retirement (PERS)", "amount": 220000, "include": true, "confidence": "high" },
    { "code": "53120", "dept": "PLAN", "sourceDept": "Planning Division", "fiscalYear": "FY 2025-26", "amountType": "adopted", "category": "Professional & Contractual Services", "line": "Consulting Services", "amount": 620000, "include": true, "confidence": "high" },
    { "code": "54330", "dept": "BLDG", "sourceDept": "Building & Safety", "fiscalYear": "FY 2025-26", "amountType": "adopted", "category": "Software & Subscriptions", "line": "Software Subscriptions", "amount": 84000, "include": true, "confidence": "high" },
    { "code": "55210", "dept": "ENG", "sourceDept": "Public Works — Development Engineering", "fiscalYear": "FY 2025-26", "amountType": "proposed", "category": "Vehicles & Fleet", "line": "Field Equipment", "amount": 42000, "include": true, "confidence": "low" },
    { "code": "53120", "dept": "FIN", "sourceDept": "Finance / Administrative Services", "fiscalYear": "FY 2025-26", "amountType": "adopted", "category": "Software & Subscriptions", "line": "Utility Billing Software", "amount": 18000, "include": true, "confidence": "high" }
  ]
}

Rules:
- dept must be exactly one of: "ADMIN" (Administration), "CLK" (Clerk), "FIN" (Finance), "HR" (Human Resources), "IT" (Information Technology), "LEGAL" (Legal), "BLDG" (Building), "PLAN" (Planning), "ENG" (Engineering), "CODE" (Code Enforcement), "FIRE" (Fire), "PW" (Public Works), "TRANS" (Transportation), "ENV" (Environmental Services), "UTIL" (Utilities), "PD" (Police), "PARKS" (Parks & Recreation), "LIB" (Library), "ANIMAL" (Animal Services), "HOUSING" (Housing), "ECON" (Economic Development), "HEALTH" (Public Health), "COMMUNITY" (Community Services), "AIR_HARBOR" (Airport / Harbor), "GEN_GOV" (General Government), or "SHARED:CDS" (shared Community Development / Development Services)
- sourceDept must preserve the raw department / division / program name EXACTLY as written in the document (e.g. "Planning Division", "Building & Safety", "Public Works — Development Engineering", "Community Development Department"). Do not normalize or shorten it.
- Department inclusion logic:
  * INCLUDE: any listed fee department when the line item supports a fee-bearing service, including Administration, Clerk, Finance, Planning, Building / Inspection, Code Enforcement, Engineering / Development Engineering, Parks & Recreation, Police, Fire / Fire Prevention, Public Works, Utilities, and any shared Community Development / Development Services umbrella that contains those functions.
  * Public Works rows: when the section or line clearly relates to development engineering, permit review, encroachment permits, grading, inspections, plan check, land development, or fee-supported development services — map dept="ENG" and set confidence as warranted.
  * Out-of-scope departments (streets, parks operations, utilities operations, sewer/water/storm drain, fleet, facilities, refuse, Library, City Manager, HR, IT unless billed to a fee-supported division, etc.): RETURN the row anyway. Map dept to the closest fee-supported code you can justify (or to the listed dept the source document used if it's already in the enum) and set confidence="low". The downstream importer routes uncertain depts to an analyst review queue with source lineage — do not silently drop the row.
- Personnel lines ARE in scope — extract regular salaries, overtime, part-time wages, retirement contributions, PERS, OPEB, health insurance, dental, vision, payroll taxes, Medicare, FICA, workers' comp, life insurance, and similar pay/benefit accounts. Do NOT skip a row just because account_category is "Salaries & Benefits"; extract it and set category="Other". Preserve the source line text exactly (e.g. "Regular Salaries", "Health Insurance", "Retirement (PERS)") — downstream classification reads the line text to tag rows as Salary vs Benefits automatically.
- category must be exactly one of these thirteen values — pick the closest match. For personnel lines (salaries, benefits, retirement, etc.), use "Other Operational Expenses" — the downstream tagger reads the line text directly:
  * "Professional & Contractual Services" — consulting, contract services, legal counsel (non-noticing), plan review services, contract inspection, contract engineering, outside professional services
  * "Software & Subscriptions" — software licenses, SaaS, cloud services, IT subscriptions, technology platforms
  * "Utilities" — electricity, water, sewer, gas, refuse, stormwater utility charges
  * "Communications" — telephone, cellular, internet, data lines, postage, mailing
  * "Insurance" — general liability, property, vehicle liability, umbrella policies (NOT workers' comp — that's personnel)
  * "Repairs & Maintenance" — facility R&M, equipment R&M, HVAC, janitorial supplies, grounds maintenance
  * "Rent & Facilities" — building rent, equipment leases, facility space charges, storage rental
  * "Travel" — mileage, per diem, lodging, airfare, parking, conference travel costs
  * "Training & Professional Development" — conferences, training fees, certifications, CEUs, registrations
  * "Memberships & Dues" — professional memberships, association dues, subscriptions to publications
  * "Vehicles & Fleet" — vehicle purchases below capitalization threshold, fuel, vehicle maintenance, fleet services
  * "Office Supplies" — office supplies, printing, general operating supplies (non-equipment)
  * "Other Operational Expenses" — anything that doesn't clearly fit above, including public hearing / legal noticing, capital outlay (still tagged include=false separately), and personnel lines awaiting downstream classification
- ERP-style category labels translate as follows: "Technology" → "Software & Subscriptions"; "Maintenance" of fleet/vehicles → "Vehicles & Fleet"; "Maintenance" of buildings/facilities → "Repairs & Maintenance"; "Operating Supplies" → "Office Supplies" unless the line clearly describes equipment (then "Vehicles & Fleet"); "Programming" → "Software & Subscriptions"; "Contract Services" / "Professional Services" → "Professional & Contractual Services"; "Legal Noticing" → "Other Operational Expenses"
- amount must be a plain JavaScript number — STRIP any "$" sign, commas, and whitespace ("$620,000" → 620000). Drop any text-formatted ranges, percentages, or footnote markers.
- Zero amounts: RETAIN. A line item with amount=0 is still a real line item the analyst will review (e.g., a placeholder budget line, a category the city intends to fund later). Do not drop it just because the dollar value is 0.
- Negative amounts: RETAIN as a negative JavaScript number (e.g. -12500) and set confidence to "low" so the reviewer sees it on the audit list. Do not skip negatives.
- code is the GL account number / object code if present (e.g. "53120"); omit the field if the document has no account numbers
- line is the human-readable description of the expenditure (e.g. "Consulting Services", "Software Subscriptions")
- fiscalYear: include the fiscal year that the amount belongs to, formatted as "FY 2025-26" (or "FY 2025" for single-year jurisdictions). Omit the field entirely if the document does not make the fiscal year clear for the row's column.
- amountType: include one of "adopted", "proposed", "amended", "actual", "estimated", "budgeted" when the column heading or section title makes the basis clear. Prefer ADOPTED or current-budget amounts when the document presents multiple columns (e.g. Actual / Adopted / Proposed). Omit the field when the basis is ambiguous.
- include defaults to true for recurring operating costs (services & supplies, contracts, software, materials, vehicle maintenance, utilities, professional services, etc.) AND for recurring personnel costs (salaries, wages, retirement, healthcare, payroll taxes, etc.).
- Set include=false (with an excludeReason) — DO NOT drop the row — for any of:
  * Capital outlay; capital improvement project; capital asset / equipment purchase — excludeReason: "capital outlay"
  * Debt service; principal / interest payment; bond / lease principal or interest — excludeReason: "debt service"
  * Interfund / interagency / interdepartmental transfers; "Transfer in/out"; fund transfer — excludeReason: "transfer"
  * Reimbursed pass-throughs; grant pass-throughs; reimbursable cost/expense — excludeReason: "pass-through"
  * Applicant-reimbursed / developer-funded / deposit-funded costs — excludeReason: "applicant reimbursed"
  * Lines the document explicitly marks one-time, non-recurring — excludeReason: "one-time"
- IMPORTANT: when in doubt about whether a line falls into one of these buckets, set include=true. The downstream importer applies the same keyword classifier and will set include=false for any line it recognizes, so you never need to over-exclude.
- confidence: "high" if dept, category, line, and amount are all clear from the document; "low" if any are ambiguous, estimated, or inferred from context (and always "low" when including a negative-amount adjustment)
- Skip totals, subtotals, grand totals, "Department Total" rows, fund totals, and summary rows
- Skip blank rows, header rows, and rows where the line description or required identity fields are missing/unreadable. Retain rows with amount=0 (those are still real line items).
- Use the exact line description as written in the document
- Return only the JSON object, nothing else`;

export async function handleAiParseOperating(req: Request): Promise<Response> {
  return runPdfParser(req, {
    tag: "ai-parse-operating",
    rowsKey: "operating",
    rowAnchor: "line",
    rowNoun: "operating",
  }, () => SYSTEM);
}
