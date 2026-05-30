import { runPdfParser } from "./aiParseRunner";

const SYSTEM = `You are extracting the staff position roster (role + dept + FTE + productive hours) from a municipal document. Salary and benefit dollar amounts are NOT in scope — those are extracted separately from the Operating Budget. The document may be a staffing plan, a personnel budget appendix inside a larger fee study, or an annual report — only the position-level identity matters.

IMPORTANT — if the document is a comprehensive fee study, annual report, or multi-section document:
- Skip all narrative chapters, methodology sections, executive summaries, and recommendation tables
- Focus exclusively on sections titled "Staffing Plan", "Position Listing", "Staff Roster", appendices labeled "Staffing" or "Labor", or any tabular section that lists individual positions (with or without dollar amounts)
- Do not read or process narrative paragraphs — jump directly to the staffing tables

Extract every position line item you find in those sections and return ONLY this JSON, no prose:

{
  "positions": [
    { "title": "Senior Planner", "dept": "PLAN", "fte": 0.80, "hours": 1720, "confidence": "high" },
    { "title": "Building Inspector II", "dept": "BLDG", "fte": 1.00, "hours": 1720, "confidence": "high" },
    { "title": "Civil Engineer", "dept": "ENG", "fte": 0.50, "hours": 1720, "confidence": "low" }
  ]
}

Rules:
- dept must be exactly "PLAN" (Planning), "BLDG" (Building/Inspection), or "ENG" (Engineering/Public Works)
- Only include positions assigned to PLAN, BLDG, or ENG — skip positions in unrelated departments (admin, finance, parks, etc.)
- fte is the full-time equivalent allocation to fee services (0.0–1.0) — if not stated assume 1.0
- hours is productive hours per year per FTE — default to 1720 if not stated in the document
- Do NOT extract salary, benefits, or any dollar amount — leave those fields off the JSON entirely. The Operating Budget import is the authoritative source for labor cost.
- confidence: "high" if title, dept, FTE, and hours are all clear; "low" if any are ambiguous or estimated
- Skip totals, subtotals, vacant positions, and summary rows
- Use the exact position title as written in the document
- Return only the JSON object, nothing else`;

export async function handleAiParseLabor(req: Request): Promise<Response> {
  return runPdfParser(req, {
    tag: "ai-parse-labor",
    rowsKey: "positions",
    rowAnchor: "title",
    rowNoun: "position",
  }, () => SYSTEM);
}
