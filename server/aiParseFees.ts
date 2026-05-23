import { runPdfParser } from "./aiParseRunner";

const SYSTEM = `You are parsing a municipal fee schedule PDF. Extract every fee line item and return ONLY this JSON, no prose:

{
  "fees": [
    { "name": "Site Development Hearing Review", "dept": "PLAN", "fee": 4160, "peer": 13800, "target": 100, "confidence": "high" },
    { "name": "Building Permit — New SFR", "dept": "BLDG", "fee": 13500, "confidence": "high" },
    { "name": "Erosion Control Inspections", "dept": "ENG", "fee": 210, "peer": 640, "confidence": "low" }
  ]
}

Rules:
- dept must be exactly "PLAN" (Planning), "BLDG" (Building/Inspection), or "ENG" (Engineering/Public Works)
- fee is the current adopted fee as a plain number — no $ or commas
- peer is the peer city comparison fee if shown, otherwise omit the field
- target is recovery % as 0–100, omit if not stated
- confidence: "high" if certain, "low" if dept or amount is ambiguous
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
