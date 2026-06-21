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
  /** Printed total read directly from the schedule's own "Grand Total:
   *  All Services" row, when found. More trustworthy than the primary AI
   *  parse's `printedTotal` field for reconciliation, since it comes from
   *  the same column read as the receivers rather than a separate,
   *  fallible AI extraction. */
  printedTotalFromPdf?: number;
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

  // NBS-template gridded schedules (identified by a GL-code-style anchor
  // row, e.g. "011 - 1100") print each column's header word-wrapped across
  // many physical lines, with different columns wrapping to different
  // numbers of lines — no single PDF text item ever contains the full
  // header phrase. On this layout, prefer reconstructing each column's
  // full header text (by clustering data-row X positions, then
  // concatenating the wrapped header-band rows projected onto those
  // columns) and matching against the *whole* phrase. Whole-phrase
  // matching is far less prone to false positives than single-fragment
  // matching below — e.g. a lone wrapped line reading "FY 24/25 Budgeted"
  // can accidentally satisfy a loose substring match against a different
  // basis's full header "FY 24/25 Budgeted FTE" even though it's actually
  // a fragment of an unrelated column's header.
  const isGriddedSchedule = rows.some((row) => GL_CODE_ROW_PATTERN.test(row[0]?.text.trim() ?? ""));
  if (isGriddedSchedule) {
    const wrappedGroups = findWrappedHeaderGroups(rows, normalizedTarget, normalizedBasis);
    if (wrappedGroups.length > 0) {
      const wrappedResults = wrappedGroups.map((group) => deriveReceiversFromPdf
        ? evaluateWrappedPdfReceiverGroup(group)
        : evaluateWrappedCandidateGroup(group, receivers));
      return pickBestResult(wrappedResults, hasExpectedTotal, Number(expectedTotal));
    }
  }

  const candidates = headerCandidates(rows, normalizedTarget, normalizedBasis, hasExpectedTotal);

  if (candidates.length > 0) {
    const groups = candidateGroups(candidates);
    const results = groups.map((group) => deriveReceiversFromPdf
      ? evaluatePdfReceiverGroup(rows, group)
      : evaluateCandidateGroup(rows, group, receivers));
    return pickBestResult(results, hasExpectedTotal, Number(expectedTotal));
  }

  // Fallback for non-gridded layouts: reconstruct wrapped headers the same
  // way, in case a schedule wraps its header without a GL-code anchor row.
  const wrappedGroups = findWrappedHeaderGroups(rows, normalizedTarget, normalizedBasis);
  if (wrappedGroups.length === 0) return null;
  const wrappedResults = wrappedGroups.map((group) => deriveReceiversFromPdf
    ? evaluateWrappedPdfReceiverGroup(group)
    : evaluateWrappedCandidateGroup(group, receivers));
  return pickBestResult(wrappedResults, hasExpectedTotal, Number(expectedTotal));
}

function pickBestResult(
  results: Array<DeterministicScheduleResult & { preferred: boolean }>,
  hasExpectedTotal: boolean,
  printedTotal: number,
): DeterministicScheduleResult | null {
  if (results.length === 0) return null;

  if (hasExpectedTotal) {
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

// ─── Wrapped multi-line header fallback ───────────────────────────────────
//
// Gridded CAP exhibits (e.g. the NBS template) print a single logical
// column header word-wrapped across 3-9 physical lines, and different
// columns wrap to different numbers of lines — so no single PDF text item
// ever equals (or contains) the full header phrase the AI semantic pass
// reports. The fix: derive column positions from X-clustering across the
// whole page (robust to any one row being sparse), reassemble each
// column's full header text by concatenating every header-band item whose
// X-center falls in that column's band, and match against that instead.

/** Identity-code rows in these exhibits look like "011 - 1100" or
 *  "048-6900" — a fund/org code pair, optionally hyphenated without
 *  spaces. Used to find the first real data row on a page (the boundary
 *  between the wrapped header band above it and the data below). */
const GL_CODE_ROW_PATTERN = /^\d{2,4}\s*-\s*\d{2,5}$/;

/** Repeated page boilerplate (title / subtitle / "Prepared by" footer)
 *  that would otherwise pollute header-band text reconstruction if it
 *  happens to land near a column's X position. */
const BOILERPLATE_LINE = /^(town of|cost allocation plan|source cost data|prepared by|fiscal year)/i;

interface WrappedHeaderGroup {
  /** All clustered rows on the schedule's page, in top-to-bottom order. */
  pageRows: TextItem[][];
  /** Index into pageRows of the first real data row (GL-code-pattern row). */
  anchorLocal: number;
  /** Column band X-centers, left to right. */
  centers: number[];
  xTolerance: number;
  columnIndex: number;
  preferred: boolean;
}

/** Group text items into X-position bands (columns), analogous to
 *  clusterRows' Y-clustering but along the horizontal axis. */
function clusterColumns(items: TextItem[], xTolerance = 25): TextItem[][] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => (a.x + a.width / 2) - (b.x + b.width / 2));
  const cols: TextItem[][] = [];
  let current: TextItem[] = [];
  let currentXMid = -Infinity;
  for (const item of sorted) {
    const xMid = item.x + item.width / 2;
    if (current.length === 0 || Math.abs(xMid - currentXMid) <= xTolerance) {
      current.push(item);
      currentXMid = median(current.map((it) => it.x + it.width / 2));
    } else {
      cols.push(current);
      current = [item];
      currentXMid = xMid;
    }
  }
  if (current.length > 0) cols.push(current);
  return cols;
}

/** Project a set of rows onto fixed column centers (nearest-center
 *  assignment, multi-item cells space-joined) — the same scheme
 *  `tableFromRows` uses for a single anchor row, generalized to centers
 *  derived from whole-page clustering instead. */
function projectRowsToColumns(rows: TextItem[][], centers: number[], xTolerance: number): string[][] {
  return rows.map((row) => {
    const cells: string[][] = Array.from({ length: centers.length }, () => []);
    for (const item of row) {
      const itemCenter = item.x + item.width / 2;
      let nearestCol = -1;
      let nearestDistance = Infinity;
      for (let c = 0; c < centers.length; c += 1) {
        const d = Math.abs(itemCenter - centers[c]);
        if (d < nearestDistance) {
          nearestDistance = d;
          nearestCol = c;
        }
      }
      if (nearestCol >= 0 && nearestDistance <= xTolerance) cells[nearestCol].push(item.text);
    }
    return cells.map((parts) => parts.join(" "));
  });
}

function findWrappedHeaderGroups(
  rows: TextItem[][],
  normalizedTarget: string,
  normalizedBasis: string,
): WrappedHeaderGroup[] {
  const groups: WrappedHeaderGroup[] = [];
  const seenPages = new Set<number>();

  for (let r = 0; r < rows.length; r += 1) {
    const first = rows[r][0];
    if (!first || seenPages.has(first.page)) continue;
    if (!GL_CODE_ROW_PATTERN.test(first.text.trim())) continue;
    seenPages.add(first.page);

    const pageRowIndices: number[] = [];
    for (let i = 0; i < rows.length; i += 1) {
      if (rows[i][0]?.page === first.page) pageRowIndices.push(i);
    }
    const anchorLocal = pageRowIndices.indexOf(r);
    if (anchorLocal < 0) continue;
    // Drop stray "$" glyphs — many CAP PDFs emit the currency symbol as a
    // separate text run a few points left of its number, which otherwise
    // clusters into its own bogus column between two real ones.
    const pageRows = pageRowIndices.map((i) => rows[i].filter((it) => it.text.trim() !== "$"));

    // Derive column positions from the DATA rows only, not the header
    // band: wrapped header phrases are visually wide (often spanning the
    // width of 2-3 real data columns), so clustering header text together
    // with data would drag column centers off the data's true positions.
    // Data values are narrow and consistently placed, giving a clean grid.
    const columnBands = clusterColumns(pageRows.slice(anchorLocal).flat(), 30);
    if (columnBands.length === 0) continue;
    columnBands.sort(
      (a, b) => median(a.map((it) => it.x + it.width / 2)) - median(b.map((it) => it.x + it.width / 2)),
    );
    const centers = columnBands.map((band) => median(band.map((it) => it.x + it.width / 2)));
    const xTolerance = 30;

    // Wrapped header phrases can drift further from their data column's
    // center than the data values themselves (e.g. a second header line
    // like "Building, & Engineering" sitting past the midpoint to its
    // column's right neighbor) — `xTolerance` is tuned for compact data
    // cells and drops such drifted text instead of assigning it to the
    // nearest column. Header text has no risk of being confused with an
    // adjacent table's data (boilerplate lines are already filtered out
    // below), so project it onto the nearest column unconditionally
    // rather than capping by the data tolerance.
    const headerBandRows = pageRows
      .slice(0, anchorLocal)
      .filter((row) => !BOILERPLATE_LINE.test(row.map((it) => it.text).join(" ")));
    const headerTextsByColumn = projectRowsToColumns(headerBandRows, centers, Infinity)
      .reduce<string[]>((acc, projectedRow) => {
        projectedRow.forEach((cell, c) => {
          if (cell) acc[c] = acc[c] ? `${acc[c]} ${cell}` : cell;
        });
        return acc;
      }, Array.from({ length: centers.length }, () => ""));

    // Sibling basis columns on these grids routinely differ only by a
    // trailing qualifier — e.g. "...excl. debt, capital outlay,
    // transfers" vs. the same text plus "- Excluding Planning, Building,
    // & Engineering" — so the shorter sibling's header is a strict prefix
    // of the longer one's. `headerTextMatches`' containment check alone
    // would bind both basis names to whichever column it sees first.
    // Exact-normalized-text matches are unambiguous and must win outright;
    // only fall back to containment when no column matches exactly.
    const exactColumns: number[] = [];
    const looseColumns: number[] = [];
    for (let c = 0; c < headerTextsByColumn.length; c += 1) {
      const normalizedCell = normalizeHeaderText(headerTextsByColumn[c]);
      if (!normalizedCell) continue;
      if (normalizedCell === normalizedTarget || (normalizedBasis && normalizedCell === normalizedBasis)) {
        exactColumns.push(c);
        continue;
      }
      const matchesTarget = headerTextMatches(normalizedCell, normalizedTarget);
      const matchesBasis = normalizedBasis ? headerTextMatches(normalizedCell, normalizedBasis) : false;
      if (matchesTarget || matchesBasis) looseColumns.push(c);
    }
    for (const c of exactColumns.length > 0 ? exactColumns : looseColumns) {
      groups.push({ pageRows, anchorLocal, centers, xTolerance, columnIndex: c, preferred: true });
    }
  }

  return groups;
}

/** Identity columns precede the first value column. Neither "any row
 *  numeric" nor "majority of rows numeric" reliably separates the two:
 *  a single atypical identity row (e.g. a fund-only code with no org
 *  suffix, parsing as a bare number) can poison an "any" check, and a
 *  legitimately sparse value column — many CAP allocation factors apply
 *  to only a handful of receivers — can fail a "majority" check. The
 *  reliable signal is column *type purity*: an identity column always
 *  carries non-numeric text on at least one row (department names, GL
 *  codes with separators); a value column's non-blank cells are always
 *  numeric, no matter how sparse. Scan left to right and stop at the
 *  first column where no row's cell is non-blank-and-non-numeric. */
function identityColumnEndFromDataRows(dataRows: string[][]): number {
  if (dataRows.length === 0) return 1;
  const numCols = dataRows.reduce((max, row) => Math.max(max, row.length), 0);
  let end = 0;
  for (; end < numCols; end += 1) {
    const hasTextCell = dataRows.some((row) => {
      const cell = (row[end] ?? "").trim();
      return cell !== "" && parseUnitsCell(cell) == null;
    });
    if (!hasTextCell) break;
  }
  return Math.max(end, 1);
}

function evaluateWrappedCandidateGroup(
  group: WrappedHeaderGroup,
  receivers: ReceiverIdentity[],
): DeterministicScheduleResult & { preferred: boolean } {
  const { pageRows, anchorLocal, centers, xTolerance, columnIndex, preferred } = group;
  const projected = projectRowsToColumns(pageRows, centers, xTolerance);
  const dataRows = projected.slice(anchorLocal);
  const identityColumnEnd = identityColumnEndFromDataRows(dataRows);

  const resolved: ResolvedReceiver[] = [];
  const blankReceivers: ReceiverIdentity[] = [];
  const unmatchedReceivers: ReceiverIdentity[] = [];

  for (const receiver of receivers) {
    const tableRowIndex = findReceiverRow(dataRows, receiver, identityColumnEnd);
    if (tableRowIndex < 0) {
      unmatchedReceivers.push(receiver);
      continue;
    }
    const cell = dataRows[tableRowIndex][columnIndex] ?? "";
    const units = parseUnitsCell(cell);
    if (units == null || units <= 0) {
      blankReceivers.push(receiver);
      continue;
    }
    resolved.push({ ...receiver, units });
  }

  return { receivers: resolved, blankReceivers, unmatchedReceivers, preferred };
}

function evaluateWrappedPdfReceiverGroup(
  group: WrappedHeaderGroup,
): DeterministicScheduleResult & { preferred: boolean } {
  const { pageRows, anchorLocal, centers, xTolerance, columnIndex, preferred } = group;
  const projected = projectRowsToColumns(pageRows, centers, xTolerance);
  const dataRows = projected.slice(anchorLocal);
  const identityColumnEnd = identityColumnEndFromDataRows(dataRows);

  const resolvedByCode = new Map<string, ResolvedReceiver>();
  let printedTotalFromPdf: number | undefined;

  for (const row of dataRows) {
    const receiver = receiverIdentityFromTableRow(row.slice(0, identityColumnEnd));
    if (receiver) {
      const units = parseUnitsCell(row[columnIndex] ?? "");
      if (units != null && units > 0) resolvedByCode.set(receiver.glCode, { ...receiver, units });
      continue;
    }
    if (printedTotalFromPdf == null && /grand\s*total\s*:?\s*all\s*services/i.test(row.join(" "))) {
      const total = parseUnitsCell(row[columnIndex] ?? "");
      if (total != null && total > 0) printedTotalFromPdf = total;
    }
  }

  return {
    receivers: [...resolvedByCode.values()],
    blankReceivers: [],
    unmatchedReceivers: [],
    preferred,
    ...(printedTotalFromPdf != null ? { printedTotalFromPdf } : {}),
  };
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
  let printedTotalFromPdf: number | undefined;

  for (const candidate of candidates) {
    const table = tableFromScopedRows(rows, candidate.headerRowIndex);
    if (candidate.columnIndex < 0 || candidate.columnIndex >= table.headers.length) continue;
    const identityColumnEnd = firstValueColumnIndex(table.headers);
    for (const row of table.rows) {
      const receiver = receiverIdentityFromTableRow(row.slice(0, identityColumnEnd));
      if (receiver) {
        const units = parseUnitsCell(row[candidate.columnIndex] ?? "");
        if (units != null && units > 0) resolvedByCode.set(receiver.glCode, { ...receiver, units });
        continue;
      }
      // The schedule's own "Grand Total: All Services" row is a far more
      // reliable reconciliation source than the primary AI parse's
      // printedTotal field — it's read straight off the same column we're
      // already extracting receiver units from, rather than guessed by an
      // earlier, separate AI call. Prefer it when present so a mis-read AI
      // printedTotal can't cause `evaluateDeterministicResult` to discard
      // an otherwise-correct deterministic extraction.
      if (printedTotalFromPdf == null && /grand\s*total\s*:?\s*all\s*services/i.test(row.join(" "))) {
        const total = parseUnitsCell(row[candidate.columnIndex] ?? "");
        if (total != null && total > 0) printedTotalFromPdf = total;
      }
    }
  }

  return {
    receivers: [...resolvedByCode.values()],
    blankReceivers: [],
    unmatchedReceivers: [],
    preferred: candidates.some((candidate) => candidate.preferred),
    ...(printedTotalFromPdf != null ? { printedTotalFromPdf } : {}),
  };
}

function receiverIdentityFromTableRow(identityCells: string[]): ReceiverIdentity | null {
  const cells = identityCells.map((cell) => cell.trim()).filter(Boolean);
  if (cells.length === 0) return null;
  const identityText = cells.join(" ");
  if (/^(fund|no\.?|title|data source|notes?)\b/i.test(identityText)) return null;
  if (/\bgrand total\b|\bsubtotal\b/i.test(identityText)) return null;

  const first = cells[0];

  // Gridded basis schedules (NBS-template, e.g. "011 - 1100") print the
  // full GL code as its own bare leading cell — fund and org/dept code
  // joined by a dash, no department text mixed in — with the department
  // name in a wholly separate following cell. The general dept-with-
  // trailing-number heuristic below assumes a single combined cell and
  // requires a second numeric token elsewhere to build a 2-part code,
  // which a plain-text dept name (e.g. "City Council") never has. Handle
  // this bare-code shape directly: split the code on its own digits, and
  // treat the remaining cells as the department name.
  const isBareGlCode = /^\d+(\s*-\s*\d+)+$/.test(first);
  if (isBareGlCode) {
    const dept = cells.slice(1).join(" ");
    const codeParts = numericTokens(first);
    const direct = receiverFromParts(dept, codeParts);
    if (direct) return direct;
  }

  const firstTrailing = trailingNumber(first);
  if (firstTrailing && !isPlainNumber(first)) {
    const dept = stripTrailingNumber(first);
    const codeParts = [firstTrailing, ...cells.slice(1).flatMap((cell) => numericTokens(cell))];
    return receiverFromParts(dept, codeParts);
  }

  // Single-segment fund-only admin rows (e.g. CIP fund "043 WESTWIND BARN
  // CIP ADMIN") print just a bare numeric fund code with no separate org
  // digits anywhere in the row — every other shape above requires a
  // second numeric token to build a 2-part code, which this row will
  // never have. Treat the bare leading number as the complete glCode
  // directly rather than discarding the row as unparseable.
  if (isPlainNumber(first) && cells.length === 2 && !isPlainNumber(cells[1])
    && numericTokens(cells[1]).length === 0) {
    const dept = stripTrailingNumber(cells[1]).trim();
    if (dept) return { dept, glCode: first };
  }

  // Bare alphabetic receiver codes (e.g. consolidated-grid "AO" / "All
  // Other") label catch-all receivers that carry no numeric GL code at
  // all — every branch above requires at least one digit to build a code,
  // so this row would otherwise fall through to the `!fund` rejection
  // below. Treat the bare short all-caps code as the glCode directly,
  // mirroring the bare-numeric-fund-code shape above but for non-numeric
  // codes.
  const isBareAlphaCode = /^[A-Z]{1,4}$/.test(first);
  if (isBareAlphaCode && cells.length === 2 && !isPlainNumber(cells[1])) {
    const dept = stripTrailingNumber(cells[1]).trim();
    if (dept) return { dept, glCode: first };
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

These documents typically mention a basis name in MULTIPLE places: once per-pool, next to that pool's individual allocation detail (a page with just one basis name and that pool's receivers), and ALSO once in a consolidated schedule appendix — usually near the end of the document — where MANY bases appear side-by-side as columns in a single wide grid, with GL-code/department rows running down the left and a unit value under each basis's column for every row.

You must report the page of the CONSOLIDATED GRID, not a per-pool mention. Identify it by this shape:
- The header band lists several different basis names as column headers across the same page (not just the one basis you're currently resolving).
- Each row begins with a GL code / department identity (e.g. "011 - 1100" / "City Council"), and the same rows repeat across all the basis columns on that page.
- A per-pool detail page, by contrast, shows only ONE basis name and is paired with "Allocation Units" / "Percent" / dollar-amount columns for a single pool — that is NOT the page to report, even though the basis name appears there too.

If a basis name appears on both an appendix grid page and one or more per-pool pages, you MUST report the appendix grid page.

For every basis below, report the 1-indexed page number where its column appears in the consolidated grid, and the EXACT column header text used over its Value column there. Do not report the basis name itself unless that is also the column header text — column headers often use slightly different wording (e.g. basis "Budgeted FTE" might be printed as "FTE" or "F.T.E." in the column header).

Return ONLY this JSON:
{
  "schedules": [
    { "basis": "Exact basis name as given", "page": 5, "basisColumnHeader": "FTE" }
  ]
}

Basis names:
${basisNames.map((name) => `- ${name}`).join("\n")}

Rules:
- Identify the column header by matching the basis's name to the header row text on the consolidated grid page, not a per-pool detail page.
- Use the EXACT text as printed (preserve capitalization and punctuation).
- If a basis has no consolidated-grid schedule, omit it from the array — do not fall back to a per-pool detail page.
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
