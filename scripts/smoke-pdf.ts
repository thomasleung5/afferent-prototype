/* Smoke test for PDF parsing.
 *
 *   npx tsx scripts/smoke-pdf.ts
 *
 * Constructs a minimal valid PDF in memory and runs it through pdfjs-dist v5
 * to verify text extraction works. In Node we use the `legacy` build which
 * runs without an external worker file. The browser path uses a worker file
 * served from /pdf.worker.min.mjs (see lib/parse/pdf.ts). */

import { Buffer } from "node:buffer";

/** Build a minimal one-page PDF containing the given lines of text. Computes
 *  xref offsets correctly so pdfjs's strict parser accepts it. */
function buildMinimalPdf(lines: string[]): Uint8Array {
  // Content stream: BT … ET. `Td` accumulates translation, so we set the
  // first line's absolute position once and then advance by `0 -14 Td`
  // per subsequent line.
  const contentParts: string[] = ["BT", "/F1 11 Tf", "72 720 Td"];
  lines.forEach((line, i) => {
    const escaped = line.replace(/[\\()]/g, (c) => `\\${c}`);
    if (i > 0) contentParts.push("0 -14 Td");
    contentParts.push(`(${escaped}) Tj`);
  });
  contentParts.push("ET");
  const content = contentParts.join("\n");

  const objects: string[] = [];
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`;
  objects[3] =
    `<< /Type /Page /Parent 2 0 R ` +
    `/MediaBox [0 0 612 792] ` +
    `/Resources << /Font << /F1 4 0 R >> >> ` +
    `/Contents 5 0 R >>`;
  objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  objects[5] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;

  // Assemble body + record byte offsets.
  let body = "%PDF-1.4\n%âãÏÓ\n";
  const offsets: number[] = [0]; // index 0 is the free object
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = Buffer.byteLength(body, "binary");
    body += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefStart = Buffer.byteLength(body, "binary");
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += xref;
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n`;
  body += `startxref\n${xrefStart}\n%%EOF\n`;

  return Uint8Array.from(Buffer.from(body, "binary"));
}

async function main() {
  // Build a tiny PDF that resembles a budget line item — a realistic input
  // for the operating extractor's PDF regex path.
  const pdfBytes = buildMinimalPdf([
    "FY 26-27 Budget · Planning Division",
    "011-2410-5210 Software subscriptions 18400",
    "011-2410-5310 On-call consultants 42000",
    "011-2410-5410 Training and travel 6800",
  ]);

  console.log("[built]", pdfBytes.length, "bytes");

  // Use the legacy build in Node — it doesn't require an external worker
  // file. The browser path (lib/parse/pdf.ts) uses /pdf.worker.min.mjs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs" as any) as {
    getDocument: (src: { data: Uint8Array }) => { promise: Promise<{
      numPages: number;
      getPage: (i: number) => Promise<{
        getTextContent: () => Promise<{ items: { str?: string; transform?: number[] }[] }>;
      }>;
    }> };
    GlobalWorkerOptions: { workerSrc: string };
  };

  const doc = await pdfjs.getDocument({ data: pdfBytes }).promise;
  console.log("[parsed]", doc.numPages, "page(s)");

  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const text = content.items.map((i) => i.str ?? "").join(" ");
  console.log("[extracted]", text.slice(0, 200));

  const required = ["011-2410-5210", "Software", "18400", "Planning"];
  for (const needle of required) {
    if (!text.includes(needle)) {
      throw new Error(`Expected text to contain "${needle}" but got: ${text}`);
    }
  }

  // Also confirm the operating extractor's regex matches at least one line.
  const operatingLineRe = /([A-Z0-9-]{6,})\s+(.+?)\s+\$?([\d,]+(?:\.\d+)?)/;
  if (!operatingLineRe.test(text)) {
    throw new Error("Operating extractor regex didn't match parsed text.");
  }

  console.log("✓ smoke pdf test passed");
}

main().catch((err) => {
  console.error("✗", err);
  process.exit(1);
});
