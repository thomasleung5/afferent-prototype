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
    { "code": "51110", "dept": "PLAN", "sourceDept": "Planning Division", "fiscalYear": "FY 2025-26", "amountType": "adopted", "category": "Other", "line": "Regular Salaries", "amount": 850000, "include": true, "confidence": "high" },
    { "code": "51210", "dept": "PLAN", "sourceDept": "Planning Division", "fiscalYear": "FY 2025-26", "amountType": "adopted", "category": "Other", "line": "Retirement (PERS)", "amount": 220000, "include": true, "confidence": "high" },
    { "code": "53120", "dept": "PLAN", "sourceDept": "Planning Division", "fiscalYear": "FY 2025-26", "amountType": "adopted", "category": "Professional services", "line": "Consulting Services", "amount": 620000, "include": true, "confidence": "high" },
    { "code": "54330", "dept": "BLDG", "sourceDept": "Building & Safety", "fiscalYear": "FY 2025-26", "amountType": "adopted", "category": "Software & subscriptions", "line": "Software Subscriptions", "amount": 84000, "include": true, "confidence": "high" },
    { "code": "55210", "dept": "ENG", "sourceDept": "Public Works — Development Engineering", "fiscalYear": "FY 2025-26", "amountType": "proposed", "category": "Vehicles & equipment", "line": "Field Equipment", "amount": 42000, "include": true, "confidence": "low" }
  ]
}

Rules:
- dept must be exactly one of: "PLAN" (Planning), "BLDG" (Building/Inspection), "ENG" (Engineering / Development Engineering), "PARKS" (Parks & Recreation), "PD" (Police), "FIRE" (Fire), or "SHARED:CDS" (shared Community Development / Development Services)
- sourceDept must preserve the raw department / division / program name EXACTLY as written in the document (e.g. "Planning Division", "Building & Safety", "Public Works — Development Engineering", "Community Development Department"). Do not normalize or shorten it.
- Department inclusion logic:
  * INCLUDE: Planning, Building / Inspection / Code Enforcement on the permit side, Engineering / Development Engineering, Parks & Recreation, Police, Fire / Fire Prevention, and any shared Community Development / Development Services umbrella that contains those functions.
  * Public Works rows: include ONLY when the section or line clearly relates to development engineering, permit review, encroachment permits, grading, inspections, plan check, land development, or fee-supported development services. Map those to dept="ENG".
  * SKIP unrelated Public Works operations: streets, parks, utilities, maintenance, fleet, facilities, sewer, water, storm drain operations, traffic signal maintenance, street sweeping, refuse, etc.
  * SKIP every row whose department is clearly outside the fee-supported departments above: Library, Finance, City Manager, City Clerk, Admin, HR, IT (unless directly billed to a fee-supported division), etc.
- Personnel lines ARE in scope — extract regular salaries, overtime, part-time wages, retirement contributions, PERS, OPEB, health insurance, dental, vision, payroll taxes, Medicare, FICA, workers' comp, life insurance, and similar pay/benefit accounts. Do NOT skip a row just because account_category is "Salaries & Benefits"; extract it and set category="Other". Preserve the source line text exactly (e.g. "Regular Salaries", "Health Insurance", "Retirement (PERS)") — downstream classification reads the line text to tag rows as Salary vs Benefits automatically.
- category must be exactly one of these nine values — pick the closest match. For personnel lines (salaries, benefits, retirement, etc.), use "Other" — the downstream tagger reads the line text directly:
  * "Software & subscriptions" — software licenses, SaaS, cloud services, IT subscriptions, technology platforms
  * "Professional services" — consulting, contract services, legal (non-noticing), plan review services, contract inspection, contract engineering, outside professional services
  * "Training & travel" — conferences, training, certifications, travel, mileage, per diem
  * "Office & supplies" — office supplies, postage, printing, general operating supplies (non-equipment)
  * "Memberships & dues" — professional memberships, association dues, subscriptions to publications
  * "Vehicles & equipment" — vehicles, fleet, field equipment, inspection equipment, tools, fuel, vehicle maintenance, equipment maintenance
  * "Legal noticing" — public hearing notices, legal advertising, publication of notices
  * "Capital outlay" — one-time capital purchases, capital improvements, equipment purchases capitalized as assets
  * "Other" — anything that doesn't clearly fit above (utilities, rent, telephone, generic maintenance of facilities, etc.)
- ERP-style category labels translate as follows: "Technology" → "Software & subscriptions"; "Maintenance" of fleet/vehicles → "Vehicles & equipment"; "Maintenance" of buildings/facilities → "Other"; "Utilities" → "Other"; "Operating Supplies" → "Office & supplies" unless the line clearly describes equipment (then "Vehicles & equipment"); "Programming" → "Software & subscriptions"; "Contract Services" / "Professional Services" → "Professional services"
- amount must be a plain JavaScript number — STRIP any "$" sign, commas, and whitespace ("$620,000" → 620000). Drop any text-formatted ranges, percentages, or footnote markers.
- Negative amounts: SKIP any negative amount unless it is clearly an expenditure adjustment that should reduce operating cost (e.g. an explicit credit, refund, or expense offset booked against the operating account). When you do include a negative, keep the amount as a negative JavaScript number (e.g. -12500) and set confidence to "low".
- code is the GL account number / object code if present (e.g. "53120"); omit the field if the document has no account numbers
- line is the human-readable description of the expenditure (e.g. "Consulting Services", "Software Subscriptions")
- fiscalYear: include the fiscal year that the amount belongs to, formatted as "FY 2025-26" (or "FY 2025" for single-year jurisdictions). Omit the field entirely if the document does not make the fiscal year clear for the row's column.
- amountType: include one of "adopted", "proposed", "amended", "actual", "estimated", "budgeted" when the column heading or section title makes the basis clear. Prefer ADOPTED or current-budget amounts when the document presents multiple columns (e.g. Actual / Adopted / Proposed). Omit the field when the basis is ambiguous.
- include defaults to true for recurring operating costs (services & supplies, contracts, software, materials, vehicle maintenance, utilities, professional services, etc.).
- Set include=false for: capital outlay; debt service / principal / interest; interfund transfers; reimbursed pass-throughs; applicant-reimbursed costs; any line the document explicitly marks one-time or non-recurring. When you set include=false, add a short excludeReason like "capital outlay", "debt service", "transfer", "reimbursed pass-through", "applicant reimbursed", or "one-time".
- confidence: "high" if dept, category, line, and amount are all clear from the document; "low" if any are ambiguous, estimated, or inferred from context (and always "low" when including a negative-amount adjustment)
- Skip totals, subtotals, grand totals, "Department Total" rows, fund totals, and summary rows
- Skip blank rows, header rows, and rows where amount is zero or missing
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
