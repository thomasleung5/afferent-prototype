// Deterministic CAP basis-schedule extraction.
//
// PR 1 shipped the coordinate-based PDF primitives (server/pdfTableExtract).
// PR 2 composes them with a small AI semantic pass into a hybrid extractor:
//
//   1. The primary CAP AI parse runs as today and returns basisUnits[]
//      with AI-estimated units and receivers (the AI is trustworthy for
//      receiver IDENTITY — dept name, glCode — even when its NUMERIC reads
//      row-shift on parallel-column exhibits).
//   2. A focused semantic AI call asks, for each basis name: "what page is
//      the schedule on, and what's the exact column-header text for its
//      Value column?" — semantic info the deterministic step needs to find
//      the right column.
//   3. This module then reads the unit cells deterministically by:
//      a. Loading text items from the PDF (server/pdfTableExtract).
//      b. Locating the schedule's header row by header-text match.
//      c. Building a column-aligned Table.
//      d. For each AI-supplied receiver, finding its row in the Table by
//         dept-name match and reading the basis column's cell.
//   4. The AI-supplied receivers whose deterministic cell parses as a
//      positive number are kept; receivers whose cell is blank/dash/zero
//      are dropped (the Milpitas Housing case).
//
// The deterministic step never "borrows" a value from an adjacent row,
// because it indexes by anchor-row X position (which doesn't shift) and
// matches receivers by name (not by row index, which shifts when blank
// cells collapse). Row-shift is structurally impossible.

import {
  clusterRows, extractTextItems, tableFromRows, type TextItem,
} from "./pdfTableExtract";

export interface ReceiverIdentity {
  dept: string;
  glCode: string;
  deptCode?: string;
}

export interface ResolvedReceiver extends ReceiverIdentity {
  units: number;
}

export interface DeterministicScheduleResult {
  /** Resolved receivers, with units read from the PDF column. */
  receivers: ResolvedReceiver[];
  /** Diagnostic: receivers whose row was found but whose cell was blank /
   *  dash / non-numeric. They are omitted from `receivers` (matching the
   *  existing import behavior of dropping zero/blank rows) but listed
   *  here so callers can log what was filtered. */
  blankReceivers: ReceiverIdentity[];
  /** Diagnostic: receivers whose dept text could not be located in any
   *  table row. The deterministic pass treats these as "schedule cannot
   *  be fully verified" — callers should decide whether to fall back to
   *  the AI receivers or surface for review. */
  unmatchedReceivers: ReceiverIdentity[];
}

export interface ExtractReceiverUnitsInput {
  /** All PDF text items on the page (or pages) where the schedule lives.
   *  Items from multiple pages are fine — the header-row finder picks
   *  the page containing the header; non-matching items are ignored. */
  pageItems: TextItem[];
  /** Exact (or near-exact) header text the AI semantic pass identified
   *  for this basis's Value column. Matched case-insensitively against
   *  table headers, with whitespace and punctuation normalized away. */
  basisColumnHeader: string;
  /** Basis name from the primary CAP parse. Used to disambiguate generic
   *  subheaders like "Value" in two-line allocation-factor tables. */
  basisName?: string;
  /** Optional printed total from the PDF schedule. When present, candidate
   *  Value columns are reconciled against it so rotated/ambiguous headers
   *  cannot bind the basis to an adjacent Value group. */
  expectedTotal?: number;
  /** When true, derive receivers directly from the PDF identity columns
   *  instead of limiting extraction to the AI-provided receiver list. */
  deriveReceiversFromPdf?: boolean;
  /** Receivers from the primary AI parse, with AI-supplied identity. */
  receivers: ReceiverIdentity[];
}

/** Resolve receiver units from a PDF's text items using AI-supplied
 *  semantic info. Returns null when the schedule's header row cannot be
 *  located — callers should fall back to the AI-extracted schedule in
 *  that case.
 *
 *  This is the load-bearing function for PR 2. The Milpitas row-shift
 *  bug (Recreation's 6.00 FTE landing on Housing) is structurally
 *  prevented here: we match receivers by dept name, not by row index, so
 *  a blank Housing cell in the PDF is correctly returned as blank rather
 *  than borrowing the next row's value. */
export function extractReceiverUnitsFromPdf(
  input: ExtractReceiverUnitsInput,
): DeterministicScheduleResult | null {
  const {
    pageItems, basisColumnHeader, basisName, expectedTotal,
    deriveReceiversFromPdf, receivers,
  } = input;
  if (pageItems.length === 0 || (!deriveReceiversFromPdf && receivers.length === 0)) return null;

  const rows = clusterRows(pageItems);
  if (rows.length < 2) return null;

  const normalizedTarget = normalizeHeaderText(basisColumnHeader);
  const normalizedBasis = normalizeHeaderText(basisName ?? "");
  const hasExpectedTotal = Number.isFinite(Number(expectedTotal)) && Number(expectedTotal) > 0;
  const candidates = headerCandidates(rows, normalizedTarget, normalizedBasis, hasExpectedTotal);
  if (candidates.length === 0) return null;

  const groups = candidateGroups(candidates);
  const results = groups.map((group) => deriveReceiversFromPdf
    ? evaluatePdfReceiverGroup(rows, group)
    : evaluateCandidateGroup(rows, group, receivers));
  if (results.length === 0) return null;

  if (hasExpectedTotal) {
    const printedTotal = Number(expectedTotal);
    const tolerance = Math.max(1, Math.abs(printedTotal) * 0.005);
    const preferredResults = results.filter((result) => result.preferred);
    const candidatesToRank = preferredResults.length > 0 ? preferredResults : results;
    const ranked = [...candidatesToRank].sort((a, b) => {
      const aDiff = Math.abs(resultTotal(a) - printedTotal);
      const bDiff = Math.abs(resultTotal(b) - printedTotal);
      const aMatches = aDiff <= tolerance;
      const bMatches = bDiff <= tolerance;
      if (aMatches !== bMatches) return aMatches ? -1 : 1;
      if (aMatches && bMatches && Math.abs(aDiff - bDiff) > 1e-9) return aDiff - bDiff;
      if (a.receivers.length !== b.receivers.length) return b.receivers.length - a.receivers.length;
      if (Math.abs(aDiff - bDiff) > 1e-9) return aDiff - bDiff;
      return a.unmatchedReceivers.length - b.unmatchedReceivers.length;
    });
    return ranked[0];
  }

  return results.sort((a, b) => {
    if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
    if (a.receivers.length !== b.receivers.length) return b.receivers.length - a.receivers.length;
    return a.unmatchedReceivers.length - b.unmatchedReceivers.length;
  })[0];
}

function headerCandidates(
  rows: TextItem[][],
  normalizedTarget: string,
  normalizedBasis: string,
  includeAlternateValueColumns: boolean,
): Array<{ headerRowIndex: number; columnIndex: number; preferred: boolean }> {
  const candidates: Array<{ headerRowIndex: number; columnIndex: number; preferred: boolean }> = [];
  const seen = new Set<string>();
  const add = (headerRowIndex: number, columnIndex: number, preferred: boolean) => {
    const key = `${headerRowIndex}:${columnIndex}`;
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push({ headerRowIndex, columnIndex, preferred });
    }
  };

  for (let r = 0; r < rows.length; r += 1) {
    for (let c = 0; c < rows[r].length; c += 1) {
      const cell = rows[r][c];
      const normalizedCell = normalizeHeaderText(cell.text);
      const matchesTarget = headerTextMatches(normalizedCell, normalizedTarget);
      const matchesBasis = normalizedBasis
        ? headerTextMatches(normalizedCell, normalizedBasis)
        : false;
      if (!matchesTarget && !matchesBasis) continue;

      // A cell whose own text is already the bare generic word "Value" has
      // nothing to descend into — searching for a "nested Value subheader
      // below a Value header" is meaningless, and on multi-page scans it
      // can wrongly latch onto a completely unrelated basis's Value column
      // several rows down just because the two happen to share an X
      // position. Only descend when the matched cell is a basis-name-like
      // parent label (i.e. not itself the generic target word).
      const isBareGenericMatch = normalizedTarget === "value" && normalizedCell === "value";
      const valueColumn = isBareGenericMatch ? null : findValueSubheaderColumn(rows, r, cell);
      if (valueColumn) {
        add(valueColumn.rowIndex, valueColumn.columnIndex, true);
        if (includeAlternateValueColumns) {
          for (const alternate of valueColumnsInRow(rows[valueColumn.rowIndex])) {
            add(valueColumn.rowIndex, alternate, false);
          }
        }
        continue;
      }
      // A bare match on the generic word "Value" itself is ambiguous on
      // its own — multiple unrelated basis schedules across the scanned
      // page window can each print their own "Value" column header.
      // Accepting every such occurrence here as `preferred` let an
      // unrelated, later-page Value column silently outrank (or get
      // merged with, by column index) the correct one. When a basis name
      // is available, the dedicated basis-confirmed scan below resolves
      // this case properly; without one, there's no way to disambiguate,
      // so skip rather than guess.
      if (isBareGenericMatch) continue;
      // This fallback treats the matched cell's own column as the Value
      // column (no nested "Value" subheader was found below it) — only
      // sound when the cell text basically *is* the basis name/header,
      // not when it merely shares a substring with it. `headerTextMatches`
      // allows loose containment (needed for truncations like "AP Inv."
      // matching "AP Invoices"), but that same looseness lets a short,
      // generic accounting word — e.g. a dollar-column header literally
      // named "Expense" — falsely satisfy `"...operatingexpenses".includes
      // ("expense")` against an unrelated basis name like "Modified
      // Operating Expenses". CAP exhibits also print narrative "Summary of
      // Allocation Decisions" tables where each basis *name* appears as a
      // plain data cell once per cost center, so a real header should also
      // be the only occurrence of that text in its column. Require both:
      // near-full-length overlap (not a short fragment) and uniqueness in
      // the column, before trusting this fallback.
      const isCloseTextMatch = matchesTarget
        ? closeHeaderMatch(normalizedCell, normalizedTarget)
        : closeHeaderMatch(normalizedCell, normalizedBasis);
      if (!isCloseTextMatch) continue;
      if (columnTextOccurrences(rows, c, normalizedCell) > 1) continue;
      add(r, c, true);
    }
  }

  if (normalizedBasis && normalizedTarget === "value") {
    for (let r = 1; r < rows.length; r += 1) {
      for (let c = 0; c < rows[r].length; c += 1) {
        if (normalizeHeaderText(rows[r][c].text) !== "value") continue;
        const parent = nearestParentHeaderItem(rows, r, rows[r][c]);
        if (parent && headerTextMatches(normalizeHeaderText(parent.text), normalizedBasis)) {
          add(r, c, true);
        }
      }
    }
  }

  return candidates;
}

function columnTextOccurrences(rows: TextItem[][], columnIndex: number, normalizedText: string): number {
  let count = 0;
  for (const row of rows) {
    const cell = row[columnIndex];
    if (cell && normalizeHeaderText(cell.text) === normalizedText) count += 1;
  }
  return count;
}

function valueColumnsInRow(row: TextItem[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < row.length; i += 1) {
    if (normalizeHeaderText(row[i].text) === "value") out.push(i);
  }
  return out;
}

function candidateGroups(
  candidates: Array<{ headerRowIndex: number; columnIndex: number; preferred: boolean }>,
): Array<Array<{ headerRowIndex: number; columnIndex: number; preferred: boolean }>> {
  const byColumn = new Map<number, Array<{ headerRowIndex: number; columnIndex: number; preferred: boolean }>>();
  for (const candidate of candidates) {
    const group = byColumn.get(candidate.columnIndex) ?? [];
    group.push(candidate);
    byColumn.set(candidate.columnIndex, group);
  }
  return [...byColumn.values()];
}

function evaluateCandidateGroup(
  rows: TextItem[][],
  candidates: Array<{ headerRowIndex: number; columnIndex: number; preferred: boolean }>,
  receivers: ReceiverIdentity[],
): DeterministicScheduleResult & { preferred: boolean } {
  const tables = candidates.map((candidate) => ({
    candidate,
    table: tableFromScopedRows(rows, candidate.headerRowIndex),
  }));
  const resolved: ResolvedReceiver[] = [];
  const blankReceivers: ReceiverIdentity[] = [];
  const unmatchedReceivers: ReceiverIdentity[] = [];

  for (const receiver of receivers) {
    let found = false;
    let foundBlank = false;
    for (const { candidate, table } of tables) {
      if (candidate.columnIndex < 0 || candidate.columnIndex >= table.headers.length) continue;
      const tableRowIndex = findReceiverRow(table.rows, receiver, firstValueColumnIndex(table.headers));
      if (tableRowIndex < 0) continue;
      found = true;
      const cell = table.rows[tableRowIndex][candidate.columnIndex] ?? "";
      const units = parseUnitsCell(cell);
      if (units == null || units <= 0) {
        foundBlank = true;
        continue;
      }
      resolved.push({ ...receiver, units });
      foundBlank = false;
      break;
    }
    if (!found) {
      unmatchedReceivers.push(receiver);
      continue;
    }
    if (foundBlank) blankReceivers.push(receiver);
  }

  return {
    receivers: resolved,
    blankReceivers,
    unmatchedReceivers,
    preferred: candidates.some((candidate) => candidate.preferred),
  };
}

function evaluatePdfReceiverGroup(
  rows: TextItem[][],
  candidates: Array<{ headerRowIndex: number; columnIndex: number; preferred: boolean }>,
): DeterministicScheduleResult & { preferred: boolean } {
  const resolvedByCode = new Map<string, ResolvedReceiver>();

  for (const candidate of candidates) {
    const table = tableFromScopedRows(rows, candidate.headerRowIndex);
    if (candidate.columnIndex < 0 || candidate.columnIndex >= table.headers.length) continue;
    const identityColumnEnd = firstValueColumnIndex(table.headers);
    for (const row of table.rows) {
      const receiver = receiverIdentityFromTableRow(row.slice(0, identityColumnEnd));
      if (!receiver) continue;
      const units = parseUnitsCell(row[candidate.columnIndex] ?? "");
      if (units == null || units <= 0) continue;
      resolvedByCode.set(receiver.glCode, { ...receiver, units });
    }
  }

  return {
    receivers: [...resolvedByCode.values()],
    blankReceivers: [],
    unmatchedReceivers: [],
    preferred: candidates.some((candidate) => candidate.preferred),
  };
}

function receiverIdentityFromTableRow(identityCells: string[]): ReceiverIdentity | null {
  const cells = identityCells.map((cell) => cell.trim()).filter(Boolean);
  if (cells.length === 0) return null;
  const identityText = cells.join(" ");
  if (/^(fund|no\.?|title|data source|notes?)\b/i.test(identityText)) return null;
  if (/\bgrand total\b|\bsubtotal\b/i.test(identityText)) return null;

  const first = cells[0];
  const firstTrailing = trailingNumber(first);
  if (firstTrailing && !isPlainNumber(first)) {
    const dept = stripTrailingNumber(first);
    const codeParts = [firstTrailing, ...cells.slice(1).flatMap((cell) => numericTokens(cell))];
    return receiverFromParts(dept, codeParts);
  }

  const fund = isPlainNumber(cells[0]) ? cells[0] : undefined;
  if (!fund) return null;
  const fundTitle = cells[1] && !isPlainNumber(cells[1]) ? stripTrailingNumber(cells[1]) : "";

  const rest = cells.slice(2);
  let dept = "";
  let org: string | undefined;
  let division: string | undefined;

  for (let i = 0; i < rest.length; i += 1) {
    const cell = rest[i];
    if (isPlainNumber(cell) && !org) {
      org = cell;
      dept = rest[i + 1] && !isPlainNumber(rest[i + 1])
        ? stripTrailingNumber(rest[i + 1])
        : dept;
      continue;
    }
    const trailing = trailingNumber(cell);
    if (trailing && !org) {
      org = trailing;
      dept = stripTrailingNumber(cell);
      continue;
    }
    if (/total\s+(organization|fund)/i.test(cell)) {
      const nums = numericTokens(cell);
      if (nums.length > 0) division = nums.at(-1);
      continue;
    }
    // "Ex. 4" style division/cost-pool references: on inventory exhibits,
    // some depts print two parallel value columns sharing the same fund/org
    // (e.g. a "Direct Services" sub-pool alongside the dept's main "Central
    // Services" pool). Without this, both rows resolve to the same glCode
    // and one silently overwrites the other in the receiver map.
    const exhibitRef = !division ? cell.match(/\bex\.?\s*(\d+)\b/i) : null;
    if (exhibitRef) {
      division = `ex${exhibitRef[1]}`;
    }
  }

  if (!org || !dept) return null;
  if (org === "0" && /^total\s+fund$/i.test(dept) && fundTitle) {
    dept = fundTitle;
  }
  const codeParts = [fund, org, ...(division ? [division] : [])];
  return receiverFromParts(dept, codeParts);
}

function receiverFromParts(dept: string, codeParts: string[]): ReceiverIdentity | null {
  const cleanDept = dept.trim();
  const parts = codeParts.filter(Boolean);
  if (!cleanDept || parts.length < 2) return null;
  return { dept: cleanDept, glCode: parts.join("-") };
}

function isPlainNumber(text: string): boolean {
  return /^\d+$/.test(text.trim());
}

function trailingNumber(text: string): string | undefined {
  return text.trim().match(/\b(\d+)\s*$/)?.[1];
}

function stripTrailingNumber(text: string): string {
  return text.trim().replace(/\s+\d+\s*$/, "").trim();
}

function numericTokens(text: string): string[] {
  return text.match(/\b\d+\b/g) ?? [];
}

function resultTotal(result: DeterministicScheduleResult): number {
  return result.receivers.reduce((sum, receiver) => sum + receiver.units, 0);
}

function tableFromScopedRows(
  rows: TextItem[][],
  headerRowIndex: number,
): ReturnType<typeof tableFromRows> {
  const anchorRow = rows[headerRowIndex] ?? [];
  if (anchorRow.length === 0) return { page: 0, headers: [], rows: [] };
  const anchorY = median(anchorRow.map((item) => item.y));
  const scopedRows = rows.filter((row, index) => {
    if (index === headerRowIndex) return true;
    const rowY = median(row.map((item) => item.y));
    return rowY > anchorY + 1 && rowY < anchorY + 5000;
  });
  return tableFromRows(scopedRows, 0);
}

function firstValueColumnIndex(headers: string[]): number {
  const index = headers.findIndex((header) => normalizeHeaderText(header) === "value");
  return index >= 0 ? index : headers.length;
}

function headerTextMatches(normalizedCell: string, normalizedTarget: string): boolean {
  return !!normalizedCell && !!normalizedTarget
    && (normalizedCell === normalizedTarget
      || normalizedCell.includes(normalizedTarget)
      || normalizedTarget.includes(normalizedCell));
}

/** Stricter than `headerTextMatches`: rejects short-fragment containment
 *  (e.g. "Expense" inside "ModifiedOperatingExpenses") while still
 *  allowing genuine truncations (e.g. "AP Inv." inside "AP Invoices"). */
function closeHeaderMatch(normalizedCell: string, normalizedTarget: string): boolean {
  if (!normalizedCell || !normalizedTarget) return false;
  if (normalizedCell === normalizedTarget) return true;
  const shorter = normalizedCell.length <= normalizedTarget.length ? normalizedCell : normalizedTarget;
  const longer = normalizedCell.length <= normalizedTarget.length ? normalizedTarget : normalizedCell;
  if (!longer.includes(shorter)) return false;
  return shorter.length >= 6 && shorter.length / longer.length >= 0.6;
}

function findValueSubheaderColumn(
  rows: TextItem[][],
  parentRowIndex: number,
  parent: TextItem,
): { rowIndex: number; columnIndex: number } | null {
  const parentCenter = parent.x + parent.width / 2;
  let best: { rowIndex: number; columnIndex: number } | null = null;
  let bestDistance = Infinity;
  for (let r = parentRowIndex + 1; r <= Math.min(rows.length - 1, parentRowIndex + 5); r += 1) {
    for (let i = 0; i < rows[r].length; i += 1) {
      if (normalizeHeaderText(rows[r][i].text) !== "value") continue;
      const center = rows[r][i].x + rows[r][i].width / 2;
      const distance = Math.abs(center - parentCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { rowIndex: r, columnIndex: i };
      }
    }
  }
  return bestDistance <= 160 ? best : null;
}

function nearestParentHeaderItem(rows: TextItem[][], childRowIndex: number, child: TextItem): TextItem | null {
  const childCenter = child.x + child.width / 2;
  let best: TextItem | null = null;
  let bestDistance = Infinity;
  for (let r = Math.max(0, childRowIndex - 5); r < childRowIndex; r += 1) {
    for (const item of rows[r]) {
      const center = item.x + item.width / 2;
      const distance = Math.abs(center - childCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = item;
      }
    }
  }
  return bestDistance <= 160 ? best : null;
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Find a table row whose cells match a receiver's identity. The match
 *  cascade goes from strictest to loosest, returning at the first hit:
 *
 *   1. glCode substring (unambiguous when present in the PDF)
 *   2. Strict normalized substring (lowercase + non-alphanumeric stripped)
 *   3. Suffix-stripped substring — handles "Recreation Administration"
 *      (AI) vs "Recreation Admin." (PDF) by removing common admin / dept /
 *      services / office words from both sides before normalizing.
 *   4. All-tokens-with-uniqueness — every significant token of the target
 *      (≥3 chars, after suffix strip) must appear in the row text, AND
 *      exactly one row must satisfy that. If multiple rows match the loose
 *      criterion, we refuse — return -1 so the caller falls back to AI
 *      rather than guess.
 *
 *  Returns -1 when no row matches uniquely. */
function findReceiverRow(
  tableRows: string[][],
  receiver: ReceiverIdentity,
  identityColumnEnd = Number.POSITIVE_INFINITY,
): number {
  const glCode = receiver.glCode.trim();
  if (glCode) {
    for (let r = 0; r < tableRows.length; r += 1) {
      const identityCells = tableRows[r].slice(0, identityColumnEnd);
      if (identityCells.some((cell) => cell.includes(glCode))) return r;
    }
    const glParts = glCode.split(/[^a-z0-9]+/i).filter(Boolean);
    if (glParts.length >= 2) {
      const splitMatches: number[] = [];
      for (let r = 0; r < tableRows.length; r += 1) {
        const identityCells = tableRows[r].slice(0, identityColumnEnd);
        const rowTokens = identityCells.join(" ").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        if (containsGlCodeTokens(rowTokens, glParts.map((part) => part.toLowerCase()))) {
          splitMatches.push(r);
        }
      }
      if (splitMatches.length === 1) return splitMatches[0];
      if (splitMatches.length > 1) {
        const nonExhibitRows = splitMatches.filter((r) => {
          const identityText = tableRows[r].slice(0, identityColumnEnd).join(" ");
          return !/\bex\.\s*\d+\b/i.test(identityText);
        });
        if (nonExhibitRows.length === 1) return nonExhibitRows[0];
      }
      if (splitMatches.length > 1) return -1;
    }
  }
  // Each tier below is uniqueness-checked: 1 match → accept; >1 matches
  // → refuse (don't fall through to broader tiers, which only get looser);
  // 0 matches → try the next tier.
  const targetStrict = normalizeDeptText(receiver.dept);
  if (!targetStrict) return -1;
  const rowsNorm = tableRows.map((row) => normalizeDeptText(row.slice(0, identityColumnEnd).join(" ")));
  const strictMatches: number[] = [];
  for (let r = 0; r < rowsNorm.length; r += 1) {
    if (rowsNorm[r].includes(targetStrict)) strictMatches.push(r);
  }
  if (strictMatches.length === 1) return strictMatches[0];
  if (strictMatches.length > 1) return -1;

  const targetStripped = normalizeDeptTextStripped(receiver.dept);
  if (targetStripped.length >= 3) {
    const rowsStripped = tableRows.map((row) => normalizeDeptTextStripped(row.slice(0, identityColumnEnd).join(" ")));
    const strippedMatches: number[] = [];
    for (let r = 0; r < rowsStripped.length; r += 1) {
      if (rowsStripped[r].includes(targetStripped)) strippedMatches.push(r);
    }
    if (strippedMatches.length === 1) return strippedMatches[0];
    if (strippedMatches.length > 1) return -1;
  }

  const targetTokens = deptTokens(receiver.dept);
  if (targetTokens.length === 0) return -1;
  const tokenMatches: number[] = [];
  for (let r = 0; r < tableRows.length; r += 1) {
    const rowTokens = deptTokens(tableRows[r].slice(0, identityColumnEnd).join(" "));
    if (targetTokens.every((token) => rowTokens.includes(token))) {
      tokenMatches.push(r);
    }
  }
  return tokenMatches.length === 1 ? tokenMatches[0] : -1;
}

function containsOrderedTokens(rowTokens: string[], targetTokens: string[]): boolean {
  let at = 0;
  for (const token of rowTokens) {
    if (token === targetTokens[at]) at += 1;
    if (at === targetTokens.length) return true;
  }
  return false;
}

function containsGlCodeTokens(rowTokens: string[], targetTokens: string[]): boolean {
  if (containsOrderedTokens(rowTokens, targetTokens)) return true;
  if (rowTokens.includes("0")) return false;

  const withoutTrailingZeros = [...targetTokens];
  while (withoutTrailingZeros.at(-1) === "0") {
    withoutTrailingZeros.pop();
  }
  return withoutTrailingZeros.length < targetTokens.length
    && withoutTrailingZeros.length >= 2
    && containsOrderedTokens(rowTokens, withoutTrailingZeros);
}

/** Parse a Value cell to a number. Returns null on blank, dash, or
 *  non-numeric content. Strips currency / thousands separators. */
function parseUnitsCell(cell: string): number | null {
  const trimmed = cell.trim();
  if (!trimmed) return null;
  if (trimmed === "-" || trimmed === "—" || trimmed === "–") return null;
  const cleaned = trimmed.replace(/[\s,$]/g, "");
  if (!cleaned) return null;
  // Parenthesized negative ("(123)") — engineers occasionally render in
  // accounting style. We treat negatives as "not a valid unit count" and
  // return null; the caller will omit such receivers (consistent with
  // the existing import behavior).
  if (/^\(.*\)$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}

/** Normalize a header text for matching: lowercase, collapse whitespace,
 *  strip non-alphanumeric. "Budgeted FTE" and "BUDGETED  FTE" both
 *  become "budgetedfte". */
function normalizeHeaderText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Normalize dept text similarly but preserves enough structure for
 *  substring matching. "Housing & Neighborhood Svcs" → "housingneighborhoodsvcs". */
function normalizeDeptText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Common admin / dept / services suffix words AND short conjunctions
 *  / prepositions that PDFs and AI parses inconsistently abbreviate or
 *  swap. Stripping them before normalization lets:
 *
 *    "Recreation Administration" match "Recreation Admin." or "Recreation"
 *    "Housing and Neighborhood Svcs" match "Housing & Neighborhood Svcs"
 *      (the AI's "and" survives normalization while the PDF's "&" is
 *      stripped to nothing — without filtering "and" they don't match)
 *
 *  Stopwords (and / the / for / of) are intentionally included because
 *  punctuation-driven conjunction differences ("&" vs "and") are the
 *  single biggest source of false negatives on real CAP exhibits. */
const DEPT_SUFFIX_PATTERN =
  /\b(?:administration|admin|department|dept|services|svcs|service|svc|office|division|div|bureau|section|and|the|for|of)\.?\b/gi;

/** Same as normalizeDeptText, but also strips common admin / dept suffix
 *  words and stopwords before alphanumeric normalization. */
function normalizeDeptTextStripped(text: string): string {
  return text.replace(DEPT_SUFFIX_PATTERN, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Tokenize dept text into significant words (≥3 chars, after suffix /
 *  stopword strip). Used by the loosest match tier — every target token
 *  must appear in the row's token set. */
function deptTokens(text: string): string[] {
  return text.replace(DEPT_SUFFIX_PATTERN, " ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

/** Convenience wrapper for end-to-end use: pdfBuffer → text items →
 *  per-basis resolution. The orchestrator in aiParseCap.ts uses this
 *  after the AI semantic pass identifies (page, basisColumnHeader) per
 *  basis. Items from all pages are loaded once; per-basis filtering is
 *  done by passing only the relevant page's items to extractReceiverUnitsFromPdf. */
export async function loadPdfItemsByPage(
  pdfBuffer: Uint8Array,
): Promise<Map<number, TextItem[]>> {
  const items = await extractTextItems(pdfBuffer);
  const byPage = new Map<number, TextItem[]>();
  for (const item of items) {
    const bucket = byPage.get(item.page) ?? [];
    bucket.push(item);
    byPage.set(item.page, bucket);
  }
  return byPage;
}

// ─── AI semantic pass ──────────────────────────────────────────────────
//
// One small Anthropic call that asks ONLY for the page number and column
// header text for each basis. Keeps the giant primary CAP prompt
// untouched and minimizes the risk surface for regressions on documents
// the existing flow already handles.

export interface BasisColumnSemantic {
  basis: string;
  /** 1-indexed page where the basis's Value column header is printed. */
  page: number;
  /** Exact column header text the basis's Value column uses in the PDF. */
  basisColumnHeader: string;
}

interface AnthropicMessageParams {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{
    role: "user";
    content: Array<{
      type: "document";
      source: {
        type: "base64";
        media_type: "application/pdf";
        data: string;
      };
    }>;
  }>;
}

interface AnthropicMessageResponse {
  content: Array<{ type: string; text?: string }>;
  usage: { input_tokens: number; output_tokens: number };
  stop_reason: string | null;
}

interface AnthropicLike {
  messages: {
    create(
      params: AnthropicMessageParams,
      options?: { signal?: AbortSignal },
    ): Promise<AnthropicMessageResponse>;
  };
}

export function buildBasisSemanticSystem(basisNames: string[]): string {
  return `You are identifying which page and column header carries each named basis's Value column in a Cost Allocation Plan PDF.

For every basis below, report the 1-indexed page number where its unit schedule's header row appears, and the EXACT column header text used over its Value column. Do not report the basis name itself unless that is also the column header text — column headers often use slightly different wording (e.g. basis "Budgeted FTE" might be printed as "FTE" or "F.T.E." in the column header).

Return ONLY this JSON:
{
  "schedules": [
    { "basis": "Exact basis name as given", "page": 5, "basisColumnHeader": "FTE" }
  ]
}

Basis names:
${basisNames.map((name) => `- ${name}`).join("\n")}

Rules:
- Identify the column header by matching the basis's name to the header row text on the relevant page.
- Use the EXACT text as printed (preserve capitalization and punctuation).
- If a basis has no printed schedule, omit it from the array.
- Do not invent header text. If unsure, omit.
- Return JSON only, no prose.`;
}

export function parseBasisSemanticResponse(text: string): BasisColumnSemantic[] {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as { schedules?: unknown };
    if (!Array.isArray(parsed.schedules)) return [];
    return parsed.schedules.flatMap((row): BasisColumnSemantic[] => {
      if (typeof row !== "object" || row == null) return [];
      const r = row as { basis?: unknown; page?: unknown; basisColumnHeader?: unknown };
      const basis = typeof r.basis === "string" ? r.basis.trim() : "";
      const page = Number(r.page);
      const basisColumnHeader = typeof r.basisColumnHeader === "string" ? r.basisColumnHeader.trim() : "";
      if (!basis || !basisColumnHeader || !Number.isInteger(page) || page < 1) return [];
      return [{ basis, page, basisColumnHeader }];
    });
  } catch {
    return [];
  }
}

/** Ask Anthropic for { page, basisColumnHeader } per basis name. Returns
 *  an empty array on AI failure — the caller falls back to AI-extracted
 *  schedules in that case. */
export async function aiBasisColumnSemantics(
  client: AnthropicLike,
  model: string,
  pdfBase64: string,
  basisNames: string[],
  signal?: AbortSignal,
): Promise<BasisColumnSemantic[]> {
  if (basisNames.length === 0) return [];
  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    system: buildBasisSemanticSystem(basisNames),
    messages: [{
      role: "user",
      content: [{
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
      }],
    }],
  }, signal ? { signal } : undefined);
  const text = response.content.find((c) => c.type === "text")?.text ?? "";
  return parseBasisSemanticResponse(text);
}
