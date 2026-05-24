
import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { VolumeTable } from "@/features/build/VolumeTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import {
  ImportReviewAction,
  ImportReviewPanel,
  ImportReviewRow,
} from "@/features/imports/ImportReviewPanel";
import {
  createJsonImportHandler, createPdfImportHandler,
} from "@/features/imports/importRunners";
import { useBuildState } from "@/lib/store";
import { aiParseVolumePdf, volumeToExtractionResult } from "@/lib/ai/parseVolume";
import type { UnmappedRow } from "@/lib/parse/types";

type VolumeRows = Parameters<typeof volumeToExtractionResult>[0];

/** Pull human-readable display fields out of an UnmappedRow's lineage so the
 *  surfaced list can show "name (dept) — prior / current". The shape mirrors
 *  what volumeToExtractionResult writes into `rawCells`. */
function unmappedDetails(u: UnmappedRow): {
  name: string; dept: string; prior: string; current: string; reason: string;
} {
  const cells = u.lineage.rawCells ?? {};
  const fmt = (v: unknown): string => {
    if (v == null || v === "") return "—";
    return String(v);
  };
  return {
    name: fmt(cells.name),
    dept: fmt(cells.dept),
    prior: fmt(cells.prior),
    current: fmt(cells.current),
    reason:
      u.reason === "ambiguous-dept" ? "dept mismatch with catalog"
      : u.reason === "missing-required-field" ? "missing volume"
      : u.reason === "blank" ? "blank row"
      : "no catalog match",
  };
}

const VOLUME_SCHEMA = `{
  items: [
    { name, dept, prior, current, unit, confidence }
  ]
}`;

export default function VolumePage() {
  const { mergeVolume, services, volume } = useBuildState();
  const [importerOpen, setImporterOpen] = useState(false);
  // Unmatched rows are volume-specific (mergeVolume writes them to
  // pendingReview, but the page surfaces them inline so users see what
  // didn't bind). Populated as a side effect inside the drawer hooks.
  const [unmapped, setUnmapped] = useState<UnmappedRow[]>([]);

  // Apply extraction + populate the page's "unmatched" review state as
  // a side effect. The shared handler factories handle the try/catch
  // and `setUnmapped([])` reset via `onStart`.
  const apply = (rows: VolumeRows, source: string) => {
    const extraction = volumeToExtractionResult(rows, services, source, volume);
    const applied = mergeVolume(extraction, source);
    setUnmapped(extraction.unmapped);
    const imported = applied.mapped + applied.lowConfidence + applied.duplicates;
    const parts: string[] = [`${applied.mapped} accepted`];
    if (applied.duplicates > 0)    parts.push(`${applied.duplicates} updated`);
    parts.push(`${applied.lowConfidence} for review`);
    if (applied.unmapped > 0)      parts.push(`${applied.unmapped} unmatched`);
    return `${imported} row${imported === 1 ? "" : "s"} imported (${parts.join(", ")}).`;
  };

  const resetUnmapped = () => setUnmapped([]);

  const uploadPdfToClaude = createPdfImportHandler({
    parsePdf: aiParseVolumePdf,
    apply: (parsed, fileName) => apply(parsed.items, fileName),
    onStart: resetUnmapped,
  });

  const pasteJson = createJsonImportHandler({
    rootKey: "items",
    apply: (rows, source) => apply(rows as VolumeRows, source),
    onStart: resetUnmapped,
  });

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="volume"/>}
        title="Volume of Activity"
        subtitle="Annual volume per service."
        actions={
          <Btn kind="ghost" onClick={() => setImporterOpen(true)}>
            <Icon name="arrow-up-to-line" size={13}/> Import
          </Btn>
        }
      />

      {unmapped.length > 0 && (
        <ImportReviewPanel
          label="Unmatched"
          summary={(
            <>
              {unmapped.length} row{unmapped.length === 1 ? "" : "s"} could not be matched to the catalog. Add the service to
              {" "}<code style={{ fontFamily: "var(--ff-mono)", fontSize: "var(--t-l8)" }}>lib/data/services.ts</code>{" "}
              and re-import, or skip.
            </>
          )}
          actions={(
            <ImportReviewAction onClick={() => setUnmapped([])}>
              Dismiss all
            </ImportReviewAction>
          )}
        >
          {unmapped.map((u, i) => {
            const d = unmappedDetails(u);
            return (
              <ImportReviewRow
                key={i}
                columns="minmax(220px, 2fr) 64px 80px 80px minmax(140px, 1fr) 60px"
                isLast={i === unmapped.length - 1}
              >
                <span style={{ color: "var(--ink)" }}>{d.name}</span>
                <span className="mono" style={{
                  fontSize: "var(--t-l4)", color: "var(--ink-3)",
                  letterSpacing: "0.06em",
                }}>{d.dept}</span>
                <span className="num" style={{
                  textAlign: "right", color: "var(--ink-3)",
                  fontVariantNumeric: "tabular-nums",
                }}>{d.prior}</span>
                <span className="num" style={{
                  textAlign: "right", color: "var(--ink-2)",
                  fontVariantNumeric: "tabular-nums",
                }}>{d.current}</span>
                <span style={{ fontSize: "var(--t-l8)", color: "var(--ink-3)" }}>{d.reason}</span>
                <ImportReviewAction
                  align="right"
                  onClick={() => setUnmapped((prev) => prev.filter((_, j) => j !== i))}
                >
                  Skip
                </ImportReviewAction>
              </ImportReviewRow>
            );
          })}
        </ImportReviewPanel>
      )}

      <VolumeTable/>

      <PageImportDrawer
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        title="Import Volume of Activity"
        helper="Upload a source PDF, or paste structured JSON as a fallback. Service names fuzzy-match to the existing catalog."
        aiPdfHelper="Send an annual report, permit-volume table, or volume-of-activity appendix. We'll extract service-level volume counts and match them to the existing catalog."
        onAiPdfImport={uploadPdfToClaude}
        pasteExample="{ items: [...] }"
        pasteHelper="Paste structured output shaped like { items: [...] }."
        pasteSchema={VOLUME_SCHEMA}
        onPasteJson={pasteJson}
      />
    </Page>
  );
}
