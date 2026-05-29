import { runPdfParser } from "./aiParseRunner";

const SYSTEM = `You are parsing a municipal fee schedule PDF. Extract every fee line item and return ONLY this JSON, no prose. The fields you extract are limited to the fee identity (name, dept), the pricing unit, and the current adopted amount — downstream software calculates Fee #, Cost, Recommended rate, Recovery %, and Impact, so do NOT attempt to surface those.

{
  "fees": [
    { "name": "Site Development Hearing Review", "dept": "PLAN", "unit": "each", "fee": 4160, "confidence": "high" },
    { "name": "Building Permit — New SFR", "dept": "BLDG", "unit": "per $1,000 valuation", "fee": 13500, "confidence": "high" },
    { "name": "Erosion Control Inspections", "dept": "ENG", "unit": "per hour", "fee": 210, "confidence": "low" }
  ]
}

Rules:
- dept must be exactly "PLAN" (Planning), "BLDG" (Building/Inspection), or "ENG" (Engineering/Public Works)
- unit is the FEE PRICING unit as written in the document — verbatim short label like "each", "per hour", "per $1,000 valuation", "deposit", "per page", "per parcel". Omit the field if the document does not specify one.
- fee is the current adopted fee as a plain number — no $ or commas
- Do NOT extract or invent the following — they are software-determined downstream:
  * Fee # (auto-numbered)
  * Cost (calculated from cost-of-service)
  * Recommended rate (calculated)
  * Recovery % (calculated)
  * Impact (annual uplift, calculated)
  * Peer-city comparison values
  * Recovery target %
- confidence: "high" if name, dept, and amount are all clear; "low" if any are ambiguous
- Skip section headers, subtotals, grand totals, notes, and blank rows
- Use the exact fee name as written in the document
- Return only the JSON object, nothing else`;

export async function handleAiParseFees(req: Request): Promise<Response> {
  return runPdfParser(req, {
    tag: "ai-parse-fees",
    rowsKey: "fees",
    rowAnchor: "name",
    rowNoun: "fee",
  }, () => SYSTEM);
}
