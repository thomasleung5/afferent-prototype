import { runPdfParser } from "./aiParseRunner";

const BASE_SYSTEM = `You are parsing a municipal cost-of-service study or fee study PDF. Extract every service line item and return ONLY this JSON, no prose:

{
  "services": [
    { "name": "Site Development Hearing Review", "dept": "PLAN", "hours": 3.5, "volume": 45, "fee": 4160, "target": 100, "confidence": "high" },
    { "name": "Building Permit — New SFR", "dept": "BLDG", "hours": 8.0, "volume": 120, "fee": 13500, "confidence": "high" },
    { "name": "Erosion Control Inspections", "dept": "ENG", "hours": 1.5, "volume": 80, "fee": 210, "confidence": "low" }
  ]
}

Rules:
- dept must be exactly "PLAN" (Planning), "BLDG" (Building/Inspection), or "ENG" (Engineering/Public Works)
- hours is staff hours per service occurrence (fully-burdened hours, not clock hours)
- volume is annual service count or permit count — plain number, no commas
- fee is the current adopted fee as a plain number — no $ or commas
- target is recovery % as 0–100 (e.g. 100 = full cost recovery), omit if not stated
- confidence: "high" if certain, "low" if dept, hours, or volume is ambiguous or estimated
- Skip section headers, subtotals, grand totals, notes, and blank rows
- If hours are not shown but a unit cost and FBHR are shown, compute hours = unit_cost / FBHR
- Return only the JSON object, nothing else`;

function buildSystem(catalogEntries: { name: string; dept: string }[]): string {
  if (catalogEntries.length === 0) return BASE_SYSTEM;
  const list = catalogEntries.map((e) => `  - ${e.name} (${e.dept})`).join("\n");
  return `${BASE_SYSTEM}

IMPORTANT — existing service catalog (you MUST use these exact names when there is a match):
${list}

When a row in the PDF clearly corresponds to a catalog entry, use the catalog name verbatim in your output even if the PDF spells it differently. Only use a name from the PDF directly when there is no reasonable catalog match.`;
}

export async function handleAiParseServices(req: Request): Promise<Response> {
  return runPdfParser(req, {
    tag: "ai-parse-services",
    rowsKey: "services",
    rowAnchor: "name",
    rowNoun: "service",
  }, (form) => {
    const catalogRaw = form.get("catalog");
    const catalog = typeof catalogRaw === "string" && catalogRaw
      ? JSON.parse(catalogRaw) as { name: string; dept: string }[]
      : [];
    return buildSystem(catalog);
  });
}
