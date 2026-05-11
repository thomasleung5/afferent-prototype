import type { ParsedDoc, ParsedPage } from "./types";

/** PDF text extraction via pdf.js v5. Tables in PDFs are inherently unstructured —
 *  this returns text lines per page, grouped by approximate Y position. The
 *  extractors then run regex/heuristic passes to pull out budget line items,
 *  account codes, dollar amounts, etc.
 *
 *  Worker setup: pdf.js v5 requires a real worker. `pdf.worker.min.mjs` is
 *  copied into `public/` so Next.js serves it at `/pdf.worker.min.mjs`. */

interface ParseOpts {
  /** Override the workerSrc URL — used by Node-based smoke tests where the
   *  worker isn't served at `/pdf.worker.min.mjs`. */
  workerSrc?: string;
}

const DEFAULT_BROWSER_WORKER = "/pdf.worker.min.mjs";

export async function parsePdf(file: File, opts: ParseOpts = {}): Promise<ParsedDoc> {
  const warnings: string[] = [];
  const pages: ParsedPage[] = [];

  let pdfjs: typeof import("pdfjs-dist");
  try {
    pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = opts.workerSrc ?? DEFAULT_BROWSER_WORKER;
  } catch (err) {
    warnings.push(`pdf.js failed to load: ${(err as Error).message ?? "unknown error"}`);
    return {
      format: "pdf",
      fileName: file.name,
      rowCount: 0,
      pages: [],
      warnings,
    };
  }

  try {
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buf),
    }).promise;

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      // Group items by Y to recover line structure. pdf.js gives us each text
      // span with a transform matrix; transform[5] is the y-position.
      const buckets = new Map<number, { x: number; str: string }[]>();
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const t = item as { transform: number[]; str: string };
        const yKey = Math.round(t.transform[5]);
        const x = t.transform[4] as number;
        const arr = buckets.get(yKey) ?? [];
        arr.push({ x, str: t.str });
        buckets.set(yKey, arr);
      }
      const lines: string[] = [];
      const orderedKeys = [...buckets.keys()].sort((a, b) => b - a);
      for (const k of orderedKeys) {
        const items = buckets.get(k)!.sort((a, b) => a.x - b.x);
        const line = items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
        if (line) lines.push(line);
      }
      pages.push({ page: p, text: lines.join("\n"), lines });
    }
  } catch (err) {
    warnings.push(`PDF parse failed: ${(err as Error).message ?? "unknown error"}`);
  }

  const rowCount = pages.reduce((a, p) => a + p.lines.length, 0);
  return {
    format: "pdf",
    fileName: file.name,
    rowCount,
    pages,
    warnings,
  };
}
