import { runPdfParser } from "./aiParseRunner";

const SYSTEM = `You are extracting service-volume / workload counts from a municipal document. The document may be an annual report, a permit-volume table, an application-count summary, a year-over-year activity table, or a workload appendix inside a fee study — only the rows that COUNT units of service activity matter.

IMPORTANT — if the document is a comprehensive fee study, annual report, or multi-section document:
- Skip narrative chapters, methodology sections, executive summaries, recommendation tables, financial tables, fee tables, revenue summaries, and rate-derivation tables
- Focus exclusively on sections titled "Volume of Activity", "Workload", "Service Volumes", "Annual Activity", "Permit Volume", "Application Counts", "Transactions", "Activity Report", "Year-over-Year Activity", appendices labeled "Volume of Activity", "Workload" or "Activity", or any tabular section that lists individual services with annual unit counts

Extract every row that reports a count of services performed and return ONLY this JSON, no prose:

{
  "items": [
    { "name": "Building Permit — Single-Family Residential", "dept": "BLDG", "prior": 142, "current": 165, "unit": "permits", "confidence": "high" },
    { "name": "Conditional Use Permit", "dept": "PLAN", "prior": null, "current": 12, "unit": "applications", "confidence": "high" },
    { "name": "Encroachment Permit", "dept": "ENG", "prior": 158, "current": 169, "unit": "permits", "confidence": "low" }
  ]
}

Rules:
- dept must be exactly "PLAN" (Planning), "BLDG" (Building/Inspection), or "ENG" (Engineering)
- ONLY include rows whose department is PLAN, BLDG, or ENG. SKIP every row for Public Works, Parks & Recreation, Police, Fire, Finance, City Manager, City Clerk, Admin, Library, Recreation, Streets, Water, Sewer, etc.
- name must be the EXACT service description as written in the document. Do NOT abbreviate, expand, paraphrase, or reword — downstream client-side matching depends on the name matching the catalog character-for-character.
- prior is the prior-year (or baseline) volume as a plain integer with commas stripped ("1,245" → 1245). If only one year is reported, set prior to null.
- current is the current-year (or most-recent) volume as a plain integer with commas stripped. If only one year is reported, populate current and leave prior null.
- SKIP rows whose volume cell is a range (e.g. "12-20"), a percentage ("8.4%"), a year-over-year delta ("+12"), text ("Various"), or non-numeric. Skip rows whose volume is zero or missing.
- unit is a short noun describing what is being counted: "permits", "applications", "reviews", "inspections", "hearings", "transactions", "encroachments", etc. Default to "units" only when the document does not state one.
- confidence: "high" only when name, dept, and at least one of prior/current are unambiguous; "low" if any field is ambiguous, estimated, inferred from context, or footnoted
- SKIP totals, subtotals, grand totals, "Department Total" rows, fund totals, percent-change rows, header rows, and blank rows
- SKIP narrative-style rows (single sentences without a tabular count) and rows that describe a service without giving a count
- Return only the JSON object, nothing else`;

export async function handleAiParseVolume(req: Request): Promise<Response> {
  return runPdfParser(req, {
    tag: "ai-parse-volume",
    rowsKey: "items",
    rowAnchor: "name",
    rowNoun: "volume",
  }, () => SYSTEM);
}
