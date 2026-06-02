/* Shared primitives for the Excel-mapping import flow.
 *
 * Each domain (fees, services, volume, labor, operating) has its own
 * column schema, validation rules, and entity construction. The shared
 * primitives below let those converters skip re-implementing:
 *
 *   - cell normalization (string / number / blank)
 *   - header-row detection (find the row with the most recognized labels)
 *   - column-role matching (assign columns to roles via synonyms,
 *     left-to-right, first-match-wins)
 *
 * Each domain owns its own synonym sets and the resulting role typing,
 * but the search logic is identical, so it lives here. */

import type { PreviewCell } from "@/lib/import/excelPreview";
import { normalizeDeptName } from "@/lib/data/departments";

export const HEADER_SCAN_ROWS = 10;
/** Rows scoring this many or more recognized headers are eligible. Set
 *  conservatively to 2 so a sparse first row with one stray match
 *  doesn't get crowned. Domains that want a different threshold can
 *  pass it explicitly. */
export const HEADER_MIN_MATCHES_DEFAULT = 2;

/** Lowercase + non-alphanumeric→space + trim. So "Fee / Service Name"
 *  → "fee service name", "FEE_ITEM" → "fee item". */
export function normalizeHeader(v: PreviewCell): string {
  if (v == null) return "";
  return String(v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isBlankCell(v: PreviewCell): boolean {
  return v == null || (typeof v === "string" && v.trim() === "");
}

export function cellToString(v: PreviewCell): string {
  if (v == null) return "";
  return String(v);
}

/** Coerce a cell to a finite number, or null. Accepts numbers
 *  directly; strings are stripped of common currency / formatting
 *  characters ($, commas, whitespace, percent signs) before parsing. */
export function cellToNumber(v: PreviewCell): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const cleaned = v.replace(/[$,%\s]/g, "");
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export interface RoleSpec<Role extends string> {
  role: Role;
  /** Normalized header strings that should map to this role. Use
   *  `normalizeHeader` on candidate labels to derive the canonical
   *  form. */
  synonyms: Set<string>;
}

export interface AutoMappingResult<Role extends string> {
  headerRowIndex: number;
  /** -1 when no match for the role. Callers translate to their UNSET
   *  sentinel for UI state. */
  cols: Record<Role, number>;
  detected: Record<Role, boolean>;
}

/** Scan the first `HEADER_SCAN_ROWS` rows and pick the one with the
 *  most cells matching any role synonym. Ties favor the earlier row.
 *  Falls back to row 0 when no row reaches `minMatches`. */
export function detectHeaderRow<Role extends string>(
  rows: PreviewCell[][],
  roles: RoleSpec<Role>[],
  minMatches: number = HEADER_MIN_MATCHES_DEFAULT,
): number {
  if (rows.length === 0) return 0;
  const allSynonyms = mergeSynonyms(roles);
  let bestRow = -1;
  let bestScore = 0;
  const scanLimit = Math.min(rows.length, HEADER_SCAN_ROWS);
  for (let i = 0; i < scanLimit; i++) {
    const score = headerScore(rows[i], allSynonyms);
    if (score > bestScore) {
      bestRow = i;
      bestScore = score;
    }
  }
  return bestScore >= minMatches ? bestRow : 0;
}

/** Assign columns to roles by walking the header row left-to-right,
 *  first-match-wins. Synonym sets are expected to be disjoint per
 *  domain — overlapping synonyms produce undefined priority. */
export function matchColumnRoles<Role extends string>(
  headerRow: PreviewCell[] | undefined,
  roles: RoleSpec<Role>[],
): Record<Role, number> {
  const cols = {} as Record<Role, number>;
  for (const r of roles) cols[r.role] = -1;
  if (!Array.isArray(headerRow)) return cols;

  for (let c = 0; c < headerRow.length; c++) {
    const norm = normalizeHeader(headerRow[c]);
    if (norm === "") continue;
    for (const r of roles) {
      if (cols[r.role] < 0 && r.synonyms.has(norm)) {
        cols[r.role] = c;
        break;
      }
    }
  }
  return cols;
}

/** Combine the header-row scan + column-role match into a single
 *  call. Returns the same shape every domain's auto-detect needs:
 *  headerRowIndex + per-role column index + detected flags. */
export function autoMapSheet<Role extends string>(
  rows: PreviewCell[][],
  roles: RoleSpec<Role>[],
  minMatches: number = HEADER_MIN_MATCHES_DEFAULT,
): AutoMappingResult<Role> {
  const empty = (): AutoMappingResult<Role> => {
    const cols = {} as Record<Role, number>;
    const detected = {} as Record<Role, boolean>;
    for (const r of roles) {
      cols[r.role] = -1;
      detected[r.role] = false;
    }
    return { headerRowIndex: 0, cols, detected };
  };
  if (rows.length === 0) return empty();

  const headerRowIndex = detectHeaderRow(rows, roles, minMatches);
  const headerRow = rows[headerRowIndex] ?? [];
  const cols = matchColumnRoles(headerRow, roles);

  const detected = {} as Record<Role, boolean>;
  for (const r of roles) detected[r.role] = cols[r.role] >= 0;

  return { headerRowIndex, cols, detected };
}

function headerScore(
  row: PreviewCell[] | undefined,
  allSynonyms: Set<string>,
): number {
  if (!Array.isArray(row)) return 0;
  let count = 0;
  for (const cell of row) {
    const norm = normalizeHeader(cell);
    if (norm !== "" && allSynonyms.has(norm)) count += 1;
  }
  return count;
}

function mergeSynonyms<Role extends string>(roles: RoleSpec<Role>[]): Set<string> {
  const merged = new Set<string>();
  for (const r of roles) {
    for (const s of r.synonyms) merged.add(s);
  }
  return merged;
}

// ─── Shared dept normalization ─────────────────────────────────────────
//
/** Translate a raw dept cell value to a fee-dept code (PLAN/BLDG/...)
 *  or null. Accepts both the canonical codes and the aliases users
 *  type in Excel. Caller is responsible for narrowing the resulting
 *  string to its domain's dept type. */
export function normalizeDept(v: string, validCodes: readonly string[]): string | null {
  const dept = normalizeDeptName(v);
  return dept && validCodes.includes(dept) ? dept : null;
}
