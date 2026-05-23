import { runPdfParser } from "./aiParseRunner";

const SYSTEM = `You are extracting staff positions from a municipal document. The document may be a standalone salary roster, a personnel budget appendix inside a larger fee study, or an annual report — only the position-level data matters.

IMPORTANT — if the document is a comprehensive fee study, annual report, or multi-section document:
- Skip all narrative chapters, methodology sections, executive summaries, and recommendation tables
- Focus exclusively on sections titled "Staffing Plan", "Personnel Budget", "Salary Schedule", "Position Listing", "Staff Roster", appendices labeled "Staffing" or "Labor", or any tabular section that lists individual positions with salary amounts
- Do not read or process narrative paragraphs — jump directly to the staffing tables

Extract every position line item you find in those sections and return ONLY this JSON, no prose:

{
  "positions": [
    { "title": "Senior Planner", "dept": "PLAN", "fte": 0.80, "salary": 95000, "benefits": 38000, "hours": 1720, "confidence": "high" },
    { "title": "Building Inspector II", "dept": "BLDG", "fte": 1.00, "salary": 82000, "benefits": 32800, "hours": 1720, "confidence": "high" },
    { "title": "Civil Engineer", "dept": "ENG", "fte": 0.50, "salary": 110000, "benefits": 44000, "hours": 1720, "confidence": "low" }
  ]
}

Rules:
- dept must be exactly "PLAN" (Planning), "BLDG" (Building/Inspection), or "ENG" (Engineering/Public Works)
- Only include positions assigned to PLAN, BLDG, or ENG — skip positions in unrelated departments (admin, finance, parks, etc.)
- fte is the full-time equivalent allocation to fee services (0.0–1.0) — if not stated assume 1.0
- salary is the annual base salary as a plain number — no $ or commas
- benefits is the annual benefits cost as a plain number — if shown as a % of salary, compute the dollar amount
- hours is productive hours per year per FTE — default to 1720 if not stated in the document
- confidence: "high" if title, dept, salary, and benefits are all clear; "low" if any are ambiguous or estimated
- Skip totals, subtotals, vacant positions, and summary rows
- Use the exact position title as written in the document
- Return only the JSON object, nothing else`;

export async function handleAiParseSalary(req: Request): Promise<Response> {
  return runPdfParser(req, {
    tag: "ai-parse-salary",
    rowsKey: "positions",
    rowAnchor: "title",
    rowNoun: "position",
  }, () => SYSTEM);
}
