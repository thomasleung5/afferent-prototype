import type { ParsedDoc } from "./types";
import { parseCsv } from "./csv";
import { parseXlsx } from "./xlsx";
import { parsePdf } from "./pdf";

/** Detect format from filename + size. Throws if unknown. */
export function detectFormat(file: File): "csv" | "xlsx" | "pdf" {
  const n = file.name.toLowerCase();
  if (n.endsWith(".csv")) return "csv";
  if (n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".xlsm")) return "xlsx";
  if (n.endsWith(".pdf")) return "pdf";
  // Fallback by MIME type for clipboard pastes / browser-mangled names.
  if (file.type === "text/csv") return "csv";
  if (file.type === "application/pdf") return "pdf";
  if (file.type.includes("sheet") || file.type.includes("excel")) return "xlsx";
  throw new Error(`Unsupported file type: ${file.name}`);
}

/** Parse a file to a normalized ParsedDoc. The format-specific parser is
 *  loaded dynamically so neither xlsx nor pdf.js loads until needed. */
export async function parseFile(file: File): Promise<ParsedDoc> {
  const fmt = detectFormat(file);
  if (fmt === "csv")  return parseCsv(file);
  if (fmt === "xlsx") return parseXlsx(file);
  return parsePdf(file);
}

export * from "./types";
