import { aiApiPost } from "./aiApi";

interface ServiceRow {
  name: string;
  dept: string;
  hours: number;
  volume?: number;
  fee?: number;
  target?: number;
  confidence: "high" | "low";
}

interface PositionRow {
  title: string;
  dept: string;
  fte: number;
  hours: number;
  confidence: "high" | "low";
}

interface VolumeItem {
  name: string;
  dept: string;
  prior?: number | null;
  current?: number | null;
  unit?: string;
  confidence: "high" | "low";
}

interface FeeRow {
  name: string;
  dept: string;
  unit?: string;
  fee: number;
  confidence: "high" | "low";
}

interface AiParseFeeStudyResult {
  ok: boolean;
  services: ServiceRow[];
  positions: PositionRow[];
  items: VolumeItem[];
  fees: FeeRow[];
  message?: string;
}

/** Composite Fee Study PDF parse — one upload, up to four sections back.
 *  The HTTP boundary only; conversion into store entities is delegated
 *  entirely to the existing per-domain converters (servicesToExtractionResult,
 *  laborToExtractionResult, volumeToExtractionResult, feesToExtractionResult)
 *  by the caller, never duplicated here. */
export async function aiParseFeeStudyPdf(
  file: File,
  catalog: { name: string; dept: string }[],
): Promise<AiParseFeeStudyResult> {
  const form = new FormData();
  form.append("file", file);
  if (catalog.length > 0) {
    form.append("catalog", JSON.stringify(catalog));
  }
  const body = await aiApiPost<AiParseFeeStudyResult>("/api/ai/parse-fee-study", form);
  if (!body.ok) {
    return {
      ok: false, services: [], positions: [], items: [], fees: [], message: body.message,
    };
  }
  return body;
}
