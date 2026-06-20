// Coordinate-based PDF table extraction. The CAP basis-schedule importer
// uses this to read cell values from parallel-column exhibits without
// going through the AI text-zip path that causes row-shift bugs (e.g.
// Recreation's FTE landing on Housing because Housing's cell is blank).
//
// The module is intentionally CAP-agnostic: it exposes three primitives —
//   1. extractTextItems  — pdfjs-dist plumbing, returns positioned text
//   2. clusterRows       — pure Y-clustering, groups items into visual rows
//   3. tableFromRows     — pure X-assignment, maps row items to columns
// The CAP-specific consumer (PR 2) composes these with AI-supplied
// column-header semantics.

interface PdfjsTextItem {
  str: string;
  /** 6-element affine matrix [a, b, c, d, e, f]. (e, f) is translation. */
  transform: number[];
  width: number;
  height: number;
}

interface PdfjsTextContent {
  items: (PdfjsTextItem | { str?: undefined })[];
}

interface PdfjsViewport {
  width: number;
  height: number;
}

interface PdfjsPage {
  getTextContent(): Promise<PdfjsTextContent>;
  getViewport(opts: { scale: number }): PdfjsViewport;
}

interface PdfjsDocument {
  numPages: number;
  getPage(index: number): Promise<PdfjsPage>;
}

interface PdfjsModule {
  getDocument(opts: { data: Uint8Array }): { promise: Promise<PdfjsDocument> };
}

export interface TextItem {
  text: string;
  /** Left edge in PDF user units (top-down Y origin). */
  x: number;
  /** Top edge in PDF user units (top-down — flipped from PDF's bottom-up). */
  y: number;
  width: number;
  /** Item height ≈ font size in user units. */
  height: number;
  /** 1-indexed page number. */
  page: number;
}

export interface Table {
  page: number;
  /** Anchor row's cell text, in column order. */
  headers: string[];
  /** rows[r][c] — string cells aligned to headers. Blank cells are "". */
  rows: string[][];
}

let pdfjsModulePromise: Promise<PdfjsModule> | null = null;

async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsModulePromise) {
    // pdfjs-dist v6 ESM build. The legacy path works in Node without a DOM
    // shim because we never touch the canvas/render path — only text
    // extraction, which is pure.
    pdfjsModulePromise = import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<PdfjsModule>;
  }
  return pdfjsModulePromise;
}

/** Extract all text items from a PDF buffer, normalized to top-down Y
 *  coordinates. Items with empty / whitespace-only text are dropped — they
 *  carry no signal and inflate cluster noise. */
async function extractTextItemsInternal(
  pdfBuffer: Uint8Array,
  opts?: { maxPages?: number },
): Promise<TextItem[]> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: pdfBuffer }).promise;
  const out: TextItem[] = [];
  const pageLimit = opts?.maxPages
    ? Math.min(doc.numPages, Math.max(1, Math.floor(opts.maxPages)))
    : doc.numPages;
  for (let p = 1; p <= pageLimit; p += 1) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;
    const content = await page.getTextContent();
    for (const raw of content.items) {
      if (!("str" in raw) || typeof raw.str !== "string") continue;
      const text = raw.str.trim();
      if (!text) continue;
      const [, , , , e, f] = raw.transform;
      const [a, b, c, d] = raw.transform;
      if (Math.abs(b) > Math.abs(a) && Math.abs(c) > Math.abs(d)) {
        out.push({
          text,
          x: viewport.width - f - raw.width,
          y: pageHeight - e - raw.height,
          width: raw.width,
          height: raw.height,
          page: p,
        });
      } else {
        out.push({
          text,
          x: e,
          // pdfjs reports Y from page bottom; flip so y=0 is page top and y
          // increases downward. The text item's baseline is f; the top edge
          // is `f + height`, so the top-down origin offset is `pageHeight -
          // (f + height)`.
          y: pageHeight - f - raw.height,
          width: raw.width,
          height: raw.height,
          page: p,
        });
      }
    }
  }
  return out;
}

export async function extractTextItems(pdfBuffer: Uint8Array): Promise<TextItem[]> {
  return extractTextItemsInternal(pdfBuffer);
}

export async function extractPdfTextPreview(
  pdfBuffer: Uint8Array,
  maxPages = 12,
): Promise<string> {
  const items = await extractTextItemsInternal(pdfBuffer, { maxPages });
  return items.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim();
}

export async function extractPdfTextPages(
  pdfBuffer: Uint8Array,
): Promise<Array<{ page: number; text: string }>> {
  const items = await extractTextItemsInternal(pdfBuffer);
  const pageNums = [...new Set(items.map((item) => item.page))].sort((a, b) => a - b);
  return pageNums.map((page) => {
    const pageItems = items.filter((item) => item.page === page);
    const text = clusterRows(pageItems)
      .map((row) => row.map((item) => item.text).join(" "))
      .join("\n")
      .replace(/[ \t]+/g, " ")
      .trim();
    return { page, text };
  });
}

/** Group text items into visual rows by their Y position. Items whose Y
 *  midpoints fall within `yTolerance` of an existing row's median Y are
 *  merged into that row.
 *
 *  Returned rows are sorted top-to-bottom (ascending Y). Items within each
 *  row are sorted left-to-right (ascending X).
 *
 *  Default tolerance is 60% of the median item height — generous enough to
 *  absorb baseline drift but tight enough that adjacent rows don't merge. */
export function clusterRows(
  items: TextItem[],
  opts?: { yTolerance?: number },
): TextItem[][] {
  if (items.length === 0) return [];
  const heights = items.map((it) => it.height).filter((h) => h > 0);
  const medianHeight = heights.length > 0 ? median(heights) : 10;
  const yTolerance = opts?.yTolerance ?? medianHeight * 0.6;

  const sorted = [...items].sort((a, b) => a.y - b.y);
  const rows: TextItem[][] = [];
  let current: TextItem[] = [];
  let currentYMid = -Infinity;

  for (const item of sorted) {
    const itemYMid = item.y + item.height / 2;
    if (current.length === 0 || Math.abs(itemYMid - currentYMid) <= yTolerance) {
      current.push(item);
      // Re-compute row Y midpoint as the running median of accumulated
      // items so a single outlier doesn't drift the anchor.
      currentYMid = median(current.map((it) => it.y + it.height / 2));
    } else {
      rows.push(current.sort((a, b) => a.x - b.x));
      current = [item];
      currentYMid = itemYMid;
    }
  }
  if (current.length > 0) rows.push(current.sort((a, b) => a.x - b.x));
  return rows;
}

/** Build a column-aligned Table from a flat list of rows. The anchor row
 *  defines column positions — each anchor item's X midpoint becomes a
 *  column center. Data rows assign each text item to the nearest anchor
 *  column whose center is within `xTolerance`; cells with no assigned item
 *  are returned as "".
 *
 *  Items that fall outside `xTolerance` of every anchor column are dropped
 *  — they're typically prose between table rows, page numbers, or noise
 *  from rotated/overlapping content.
 *
 *  When two items in one row map to the same column, their text is joined
 *  with a single space in left-to-right order (multi-segment cells like
 *  "$1,234" that pdfjs emits as separate items).
 *
 *  `page` is the page of the anchor row's first item; rows from other
 *  pages are accepted but tagged with the same `page` on the resulting
 *  Table. (PR 2 will call this per-page so cross-page mixing is moot.) */
export function tableFromRows(
  rows: TextItem[][],
  anchorRowIndex: number,
  opts?: { xTolerance?: number },
): Table {
  if (rows.length === 0) {
    return { page: 0, headers: [], rows: [] };
  }
  if (anchorRowIndex < 0 || anchorRowIndex >= rows.length) {
    throw new RangeError(`anchorRowIndex ${anchorRowIndex} out of bounds (rows.length=${rows.length})`);
  }
  const anchorRow = rows[anchorRowIndex];
  if (anchorRow.length === 0) {
    return { page: rows[0][0]?.page ?? 0, headers: [], rows: [] };
  }

  // Tolerance default: half the median gap between anchor column centers,
  // capped at 60pt to avoid runaway widths on sparse 2-column tables.
  const anchorCenters = anchorRow.map((it) => it.x + it.width / 2);
  const anchorGaps: number[] = [];
  for (let i = 1; i < anchorCenters.length; i += 1) {
    anchorGaps.push(anchorCenters[i] - anchorCenters[i - 1]);
  }
  const defaultTolerance = anchorGaps.length > 0
    ? Math.min(60, median(anchorGaps) / 2)
    : 60;
  const xTolerance = opts?.xTolerance ?? defaultTolerance;

  const headers = anchorRow.map((it) => it.text);
  const dataRows = rows.filter((_, i) => i !== anchorRowIndex);
  const tableRows: string[][] = dataRows.map((row) => {
    const cells: string[][] = Array.from({ length: anchorCenters.length }, () => []);
    for (const item of row) {
      const itemCenter = item.x + item.width / 2;
      let nearestCol = -1;
      let nearestDistance = Infinity;
      for (let c = 0; c < anchorCenters.length; c += 1) {
        const d = Math.abs(itemCenter - anchorCenters[c]);
        if (d < nearestDistance) {
          nearestDistance = d;
          nearestCol = c;
        }
      }
      if (nearestCol >= 0 && nearestDistance <= xTolerance) {
        cells[nearestCol].push(item.text);
      }
      // else: item is too far from any anchor — drop it.
    }
    return cells.map((parts) => parts.join(" "));
  });

  return {
    page: anchorRow[0].page,
    headers,
    rows: tableRows,
  };
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
