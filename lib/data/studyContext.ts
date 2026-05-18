/* Study context (city + fiscal year) used as a scoping prefix on every
 * receiver / center identity key. glCode values are unique only within one
 * city + fiscal year, so cross-study comparisons need this namespace to
 * prevent (e.g.) two different cities' "011-1200" centers from collapsing.
 *
 * Until a real multi-tenant context exists, mergeCapBundle attempts to
 * extract these values from the imported filename, falling back to
 * DEFAULT_STUDY_CONTEXT when the heuristics don't fire.
 */

export interface StudyContext {
  /** Short city / agency identifier. Free text — slugified for use in keys. */
  cityId: string;
  /** Fiscal year identifier — e.g. "fy26-27" / "fy2025" / "current". */
  fiscalYear: string;
}

export const DEFAULT_STUDY_CONTEXT: StudyContext = {
  cityId: "current",
  fiscalYear: "current",
};

/** Lowercase + ascii-only, replace any run of non-word characters with "-". */
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Heuristic fiscal-year extraction. Matches the common municipal patterns:
 *  "FY 24-25", "FY24-25", "FY 2024-2025", "FY2025", "2024-25", "FY 26-27".
 *  Returns a slugified label (e.g. "fy24-25") or null. */
function extractFiscalYear(fileName: string): string | null {
  const f = fileName.toLowerCase();
  // FY 24-25 / FY24-25 / FY 2024-2025 / FY2024-2025
  const fyRange = f.match(/fy\s*(\d{2,4})\s*[-–]\s*(\d{2,4})/);
  if (fyRange) {
    const a = fyRange[1].padStart(4, "20".slice(0, 4 - fyRange[1].length));
    const b = fyRange[2].length === 2 ? fyRange[2] : fyRange[2].slice(-2);
    return `fy${a.slice(-2)}-${b}`;
  }
  // FY 2025 / FY2025
  const fySingle = f.match(/fy\s*(\d{4})/);
  if (fySingle) return `fy${fySingle[1].slice(-2)}`;
  // bare 2024-25 / 2024-2025
  const bareRange = f.match(/(?<!\d)(\d{4})\s*[-–]\s*(\d{2,4})(?!\d)/);
  if (bareRange) {
    const a = bareRange[1].slice(-2);
    const b = bareRange[2].length === 2 ? bareRange[2] : bareRange[2].slice(-2);
    return `fy${a}-${b}`;
  }
  return null;
}

/** Heuristic city extraction. Looks for known patterns; otherwise pulls the
 *  longest alphabetic run from the filename prefix before the fiscal-year
 *  marker. Returns a slug or null. */
function extractCityId(fileName: string): string | null {
  // Strip extension + path
  const base = fileName.replace(/\.[a-z]+$/i, "").split("/").pop() ?? fileName;
  // Common pattern: "<City> CAP FY2025.pdf" / "<City>_FY24-25_CAP.pdf"
  // Take the leading alphabetic run before the first digit or "CAP"/"FY".
  const head = base.split(/\d|cap|fy/i)[0] ?? base;
  const tokens = head.match(/[A-Za-z]+/g) ?? [];
  // Drop common noise words.
  const filtered = tokens.filter(
    (t) => !["cap", "fy", "draft", "final", "report", "plan", "v", "rev"].includes(t.toLowerCase()),
  );
  if (filtered.length === 0) return null;
  return slug(filtered.join("-"));
}

/** Best-effort StudyContext extraction from a filename like
 *  "Sausalito-CAP-FY24-25.pdf". Anything not detected falls back to the
 *  default sentinel ("current") so keys remain well-formed. */
export function extractStudyContext(fileName: string): StudyContext {
  const fiscalYear = extractFiscalYear(fileName) ?? DEFAULT_STUDY_CONTEXT.fiscalYear;
  const cityId = extractCityId(fileName) ?? DEFAULT_STUDY_CONTEXT.cityId;
  return { cityId, fiscalYear };
}
