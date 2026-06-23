import { useState, type ReactNode } from "react";
import { useBuildState } from "@/lib/store";
import type { BuildImportLog, Domain } from "@/lib/store";
import {
  deriveRefreshSections, OPTIONAL_DOMAINS, type RefreshSectionCard,
} from "@/lib/data/annual";
import { InlineImportCard } from "@/features/imports/InlineImportCard";
import {
  ExcelFeeMappingPanel, ExcelFeeUploadButton, useExcelFeeImport,
} from "@/features/imports/ExcelFeeImportCard";
import { ExcelUploadButton } from "@/features/imports/ExcelImportCard";
import {
  ExcelLaborMappingPanel,    useExcelLaborImport,
  ExcelOperatingMappingPanel, useExcelOperatingImport,
  ExcelServicesMappingPanel,  useExcelServicesImport,
  ExcelVolumeMappingPanel,    useExcelVolumeImport,
} from "@/features/imports/excelDomainHooks";
import {
  ImportReviewAction, ImportReviewPanel, ImportReviewRow,
} from "@/features/imports/ImportReviewPanel";
import { CellSelect, ExpandIndicator } from "@/components/ui";
import { displayFileName } from "@/lib/format";
import {
  useLaborImportHandlers, useOperatingImportHandlers,
  useServicesImportHandlers, useVolumeImportHandlers,
  useFeesImportHandlers, useCapImportHandlers,
  useFeeStudyImportHandlers,
  type ImportHandlerBundle,
} from "@/features/imports/sourceImportHandlers";
import type { ImportResult } from "@/features/imports/importRunners";
import { unmappedBasisDetails } from "@/lib/ai/parseCap";
import type { UnmappedRow } from "@/lib/parse/types";

/** Noun used in the "X positions loaded" status line. Distinct from the
 *  card title because the title is the source-document name, while the
 *  noun describes the rows the user will edit downstream. */
const LOADED_NOUN: Record<Domain, { singular: string; plural: string }> = {
  positions: { singular: "position",   plural: "positions" },
  operating: { singular: "line item",  plural: "line items" },
  volume:    { singular: "row",        plural: "rows" },
  services:  { singular: "service",    plural: "services" },
  fees:      { singular: "fee",        plural: "fees" },
  cap:       { singular: "pool",       plural: "pools" },
};

export function RefreshImportGrid() {
  const state = useBuildState();
  const input = {
    imports: state.imports,
    productiveHours: state.productiveHours,
    operating: state.operating,
    volume: state.volume,
    services: state.services,
    capPools: state.capPools,
    comparisons: state.derived.comparisons,
    impact: state.derived.impact,
  };
  const cards = deriveRefreshSections(input);
  const requiredCards = cards.filter((c) => !OPTIONAL_DOMAINS.has(c.domain));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
      {requiredCards.map((c) => <DomainCard key={c.domain} card={c} imports={state.imports}/>)}
    </div>
  );
}

/** Dispatch to the right per-domain card. Each card calls its own
 *  handler hook — keeping the call sites flat so React's hook order
 *  stays stable across renders. CAP never reaches this — it's filtered
 *  out of RefreshImportGrid's requiredCards and lives only in
 *  QuickImportBanner now — but the switch stays exhaustive over Domain. */
function DomainCard({ card, imports }: { card: RefreshSectionCard; imports: BuildImportLog[] }) {
  switch (card.domain) {
    case "positions": return <PositionsCard card={card} imports={imports}/>;
    case "operating": return <OperatingCard card={card} imports={imports}/>;
    case "services":  return <ServicesCard card={card} imports={imports}/>;
    case "volume":    return <VolumeCard card={card} imports={imports}/>;
    case "fees":      return <FeesCard card={card} imports={imports}/>;
    case "cap":       return null;
  }
}

interface DomainCardProps {
  card: RefreshSectionCard;
  imports: BuildImportLog[];
}

function PositionsCard({ card, imports }: DomainCardProps) {
  const importer = useLaborImportHandlers();
  const excel = useExcelLaborImport();
  return (
    <SourceCardShell
      card={card} imports={imports} importer={importer}
      aiPdfAccessory={<ExcelUploadButton state={excel}/>}
      aiPdfBelow={<ExcelLaborMappingPanel state={excel}/>}
    />
  );
}

function OperatingCard({ card, imports }: DomainCardProps) {
  const importer = useOperatingImportHandlers();
  const excel = useExcelOperatingImport();
  return (
    <SourceCardShell
      card={card} imports={imports} importer={importer}
      aiPdfAccessory={<ExcelUploadButton state={excel}/>}
      aiPdfBelow={<ExcelOperatingMappingPanel state={excel}/>}
    />
  );
}

function ServicesCard({ card, imports }: DomainCardProps) {
  const importer = useServicesImportHandlers();
  const excel = useExcelServicesImport();
  return (
    <SourceCardShell
      card={card} imports={imports} importer={importer}
      aiPdfAccessory={<ExcelUploadButton state={excel}/>}
      aiPdfBelow={<ExcelServicesMappingPanel state={excel}/>}
    />
  );
}

function FeesCard({ card, imports }: DomainCardProps) {
  const importer = useFeesImportHandlers();
  const excel = useExcelFeeImport();
  return (
    <SourceCardShell
      card={card}
      imports={imports}
      importer={importer}
      aiPdfAccessory={<ExcelFeeUploadButton state={excel}/>}
      aiPdfBelow={<ExcelFeeMappingPanel state={excel}/>}
    />
  );
}

function VolumeCard({ card, imports }: DomainCardProps) {
  const importer = useVolumeImportHandlers();
  const excel = useExcelVolumeImport();
  const reviewExtra = importer.unmapped.length;
  return (
    <SourceCardShell
      card={card} imports={imports} importer={importer} reviewExtra={reviewExtra}
      aiPdfAccessory={<ExcelUploadButton state={excel}/>}
      aiPdfBelow={<ExcelVolumeMappingPanel state={excel}/>}
    >
      {importer.unmapped.length > 0 && (
        <VolumeUnmappedPanel
          unmapped={importer.unmapped}
          setUnmapped={importer.setUnmapped}
          services={importer.services}
          onCreate={importer.createServiceForUnmapped}
          onMap={importer.mapUnmappedToService}
        />
      )}
    </SourceCardShell>
  );
}

// ── Quick Import banner ─────────────────────────────────────────────────
//
// Fee Study and CAP are high-leverage optional inputs — one upload each
// can auto-populate several of the required cards below (Fee Study →
// Services/Volume/Fees/Positions; CAP → its own indirect-cost
// methodology). They live here as an accelerated onboarding path, not as
// cards: no expand/collapse, no Advanced/paste-JSON fallback, no
// Recent Imports list of their own. The required cards below are the
// single source of truth for "what's imported" — each one's own status
// color + Recent Imports entry shows whether a given row came from here.

const PROVENANCE_PREFIXES: { prefix: string; label: string }[] = [
  { prefix: "fee-study-", label: "Fee Study extraction" },
];

/** Maps a BuildImportLog.batchId back to a human label for the Recent
 *  Imports provenance tag. Returns null for ordinary direct imports
 *  (no batchId) or an unrecognized prefix. */
function provenanceLabel(batchId: string | undefined): string | null {
  if (!batchId) return null;
  return PROVENANCE_PREFIXES.find((p) => batchId.startsWith(p.prefix))?.label ?? null;
}

/** Quick Import banner — Fee Study and CAP upload rows, always visible
 *  and re-uploadable. Rendered above the summary bar on the Source Data
 *  page (see src/pages/source-data.tsx), distinct from RefreshImportGrid's
 *  required-card grid below it. */
export function QuickImportBanner() {
  const { imports } = useBuildState();
  const feeStudy = useFeeStudyImportHandlers();
  const cap = useCapImportHandlers();

  const capLatest = [...imports]
    .filter((e) => e.domain === "cap")
    .sort((a, b) => (b.at > a.at ? 1 : -1))[0];
  const feeStudyLatest = feeStudy.history[0];

  return (
    <div style={{
      background: "var(--paper-2)",
      border: "1px solid var(--rule)",
      padding: "16px 20px",
    }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <QuickImportRow
          id="quick-import-fee-study"
          name="Fee Study"
          populates="Services Catalog, Fee Schedule, Volume of Activity"
          latestFileName={feeStudyLatest?.fileName}
          latestAt={feeStudyLatest?.at}
          onAiPdfImport={feeStudy.aiPdf}
        >
          {feeStudy.unmapped.length > 0 && (
            <VolumeUnmappedPanel
              unmapped={feeStudy.unmapped}
              setUnmapped={feeStudy.setUnmapped}
              services={feeStudy.services}
              onCreate={feeStudy.createServiceForUnmapped}
              onMap={feeStudy.mapUnmappedToService}
            />
          )}
        </QuickImportRow>
        <QuickImportRow
          id="quick-import-cap"
          name="Cost Allocation Plan"
          populates="indirect cost methodology across all services"
          latestFileName={capLatest?.result.fileName}
          latestAt={capLatest?.at}
          onAiPdfImport={cap.aiPdf}
          isLast
        >
          {cap.unmappedBases.length > 0 && (
            <CapUnmappedPanel
              unmappedBases={cap.unmappedBases}
              setUnmappedBases={cap.setUnmappedBases}
            />
          )}
        </QuickImportRow>
      </div>
    </div>
  );
}

function QuickImportRow({
  id, name, populates, latestFileName, latestAt, onAiPdfImport, isLast, children,
}: {
  id: string;
  name: string;
  populates: string;
  latestFileName?: string;
  latestAt?: string;
  onAiPdfImport: (file: File) => Promise<ImportResult>;
  isLast?: boolean;
  children?: ReactNode;
}) {
  const hasHistory = !!latestFileName;
  return (
    <div id={id} style={{
      display: "flex", flexDirection: "column", gap: 12,
      padding: "10px 0",
      borderBottom: isLast ? "none" : "1px solid var(--rule)",
    }}>
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        gap: 16, flexWrap: "wrap",
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span className="display" style={{ fontSize: 15, fontWeight: 600 }}>{name}</span>
            <span style={{ fontSize: "var(--t-l7)", color: "var(--ink-3)" }}>
              Populates: {populates}
            </span>
          </div>
          {hasHistory && (
            <div style={{ fontSize: "var(--t-l7)", color: "var(--ink-3)", marginTop: 4 }}>
              {displayFileName(latestFileName!)} · {formatStamp(latestAt!)}
            </div>
          )}
        </div>
        <InlineImportCard
          onAiPdfImport={onAiPdfImport}
          aiPdfLabel={hasHistory ? "Re-upload" : "Upload PDF"}
          aiPdfAccept=".pdf"
          compactAiStatus
        />
      </div>
      {children}
    </div>
  );
}

// ── Status color system ─────────────────────────────────────────────────
//
// "Not Imported" / "Imported, no issues" / "Imported, needs review" /
// "Imported via extraction" — review takes priority over a clean import,
// and "via extraction" reflects whether the most recent import for this
// domain was auto-populated by Fee Study (batchId present) rather than a
// direct upload through this card.

type CardStatus = "not-imported" | "ok" | "review" | "extraction";

const STATUS_COLOR: Record<CardStatus, { border: string; text: string }> = {
  "not-imported": { border: "var(--rule-strong)", text: "var(--ink-4)" },
  ok:             { border: "var(--pos)",         text: "var(--pos)" },
  review:         { border: "var(--warn)",        text: "var(--warn)" },
  extraction:     { border: "var(--ink-2)",       text: "var(--ink-3)" },
};

function cardStatus(
  card: RefreshSectionCard, imports: BuildImportLog[], reviewExtra: number,
): CardStatus {
  if (card.review + reviewExtra > 0) return "review";
  if (!card.hasImports) return "not-imported";
  const latest = imports
    .filter((e) => e.domain === card.domain)
    .reduce((a, b) => (b.id > a.id ? b : a));
  return latest.batchId ? "extraction" : "ok";
}

interface SourceCardShellProps {
  card: RefreshSectionCard;
  imports: BuildImportLog[];
  importer: ImportHandlerBundle;
  /** Extra review-pending count surfaced by domain-specific state
   *  (Volume's unmapped rows, CAP's unbound bases). Added to the
   *  card-level low-confidence count in the status line. */
  reviewExtra?: number;
  /** Slot rendered to the right of the Upload PDF button inside
   *  InlineImportCard. Used by the Fees card to put the Upload Excel
   *  button beside Upload PDF. */
  aiPdfAccessory?: ReactNode;
  /** Slot rendered below the PDF action panel inside InlineImportCard.
   *  Used by the Fees card to render the Excel mapping panel directly
   *  under the upload buttons. */
  aiPdfBelow?: ReactNode;
  /** Minimal PDF-upload status presentation for InlineImportCard — see
   *  its `compactAiStatus` doc. Defaults on for source cards so Upload
   *  PDF behaves consistently with the CAP card. */
  compactAiStatus?: boolean;
  children?: ReactNode;
}

/** Source-Data card. Always shows source name, import status, items
 *  requiring review (if any), and — unconditionally below — the import
 *  action, recent import history, and domain-specific review panels
 *  (children). No expand/collapse: every card surfaces its full
 *  detail up front. */
function SourceCardShell({
  card, imports, importer, reviewExtra = 0,
  aiPdfAccessory, aiPdfBelow, compactAiStatus, children,
}: SourceCardShellProps) {
  const noun = LOADED_NOUN[card.domain];
  const loaded = card.seedCount;
  const reviewTotal = card.review + reviewExtra;
  const hasReview = reviewTotal > 0;
  const status = cardStatus(card, imports, reviewExtra);
  const statusColor = STATUS_COLOR[status];

  return (
    <div id={card.domain} style={{
      background: "var(--paper)",
      borderTop: "1px solid var(--rule)",
      borderRight: "1px solid var(--rule)",
      borderBottom: "1px solid var(--rule)",
      borderLeft: `4px solid ${statusColor.border}`,
      scrollMarginTop: 110,
    }}>
      <div style={{
        padding: "16px 20px",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="display" style={{ fontSize: 16, fontWeight: 600 }}>{card.name}</span>
            {OPTIONAL_DOMAINS.has(card.domain) && (
              <span className="mono" style={{
                fontSize: "var(--t-l4)", fontWeight: 600, letterSpacing: "0.06em",
                color: "var(--ink-2)", textTransform: "uppercase",
                padding: "2px 6px", border: "1px solid var(--rule)",
                background: "var(--paper-2)",
              }}>Optional</span>
            )}
          </div>
          <div style={{ fontSize: "var(--fs-ui)", color: statusColor.text, fontWeight: 500 }}>
            {card.hasImports
              ? (
                <>
                  Imported{" · "}
                  <span className="num">{loaded.toLocaleString()}</span>
                  {" "}{loaded === 1 ? noun.singular : noun.plural}
                </>
              )
              : "Not Imported"}
            {hasReview && (
              <>
                {" · "}
                <span className="num">{reviewTotal}</span>{" "}item{reviewTotal === 1 ? "" : "s"} need review
              </>
            )}
          </div>
        </div>

        <CardBody
          card={card}
          imports={imports}
          importer={importer}
          aiPdfAccessory={aiPdfAccessory}
          aiPdfBelow={aiPdfBelow}
          compactAiStatus={compactAiStatus}
        >
          {children}
        </CardBody>
      </div>
    </div>
  );
}

interface CardBodyProps {
  card: RefreshSectionCard;
  imports: BuildImportLog[];
  importer: ImportHandlerBundle;
  aiPdfAccessory?: ReactNode;
  aiPdfBelow?: ReactNode;
  compactAiStatus?: boolean;
  children?: ReactNode;
}

function CardBody({
  card, imports, importer, aiPdfAccessory, aiPdfBelow, compactAiStatus, children,
}: CardBodyProps) {
  const [showHistory, setShowHistory] = useState(false);
  const history = imports
    .filter((e) => e.domain === card.domain)
    .sort((a, b) => (b.at > a.at ? 1 : -1))
    .slice(0, 4);
  const entries: RecentImportEntry[] = history.map((entry) => ({
    id: entry.id, fileName: entry.result.fileName, rows: entry.result.rows, at: entry.at,
    via: provenanceLabel(entry.batchId) ?? undefined,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Import action */}
      <InlineImportCard
        onAiPdfImport={importer.aiPdf}
        aiPdfAccessory={aiPdfAccessory}
        aiPdfBelow={aiPdfBelow}
        compactAiStatus={compactAiStatus ?? true}
      />

      {/* Domain-specific review (volume unmapped, cap unbound bases) */}
      {children}

      {/* Recent import history — collapsed by default, no link at all on
       *  not-imported cards (entries is empty there). */}
      {entries.length > 0 && (
        <div>
          <button
            type="button"
            className="mono"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "transparent", border: "none",
              padding: "2px 0",
              cursor: "pointer",
              fontSize: "var(--t-l4)", fontWeight: 600, letterSpacing: "0.1em",
              color: "var(--ink-2)", textTransform: "uppercase",
            }}
          >
            Recent imports <ExpandIndicator open={showHistory}/>
          </button>
          {showHistory && (
            <div style={{ marginTop: 8 }}>
              <RecentImportsSection entries={entries}/>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface RecentImportEntry {
  id: number | string;
  fileName: string;
  rows: number;
  at: string;
  /** Set when this entry was auto-populated by Fee Study or CAP rather
   *  than uploaded directly through this card — e.g. "Fee Study
   *  extraction". Rendered as " · via {via}" next to the filename. */
  via?: string;
}

/** "Recent imports" list shared by each domain card — one line per
 *  entry: filename, provenance (if any), row count, date. */
function RecentImportsSection({ entries }: { entries: RecentImportEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {entries.map((entry) => (
        <div key={entry.id} style={{
          fontSize: "var(--t-l7)", color: "var(--ink-2)",
          padding: "4px 0",
          borderBottom: "1px dashed var(--rule)",
        }}>
          <span style={{
            display: "inline-block", maxWidth: 220, verticalAlign: "bottom",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }} title={entry.fileName}>{displayFileName(entry.fileName)}</span>
          {entry.via && <span style={{ color: "var(--ink-3)" }}> · via {entry.via}</span>}
          {" · "}
          <span className="num">{entry.rows.toLocaleString()}</span> rows{" · "}
          <span className="mono" style={{ color: "var(--ink-4)", fontSize: "var(--t-l4)" }}>
            {formatStamp(entry.at)}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── Volume unmapped review ──────────────────────────────────────────────

function unmappedRowDetails(u: UnmappedRow): {
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

interface VolumeUnmappedPanelProps {
  unmapped: UnmappedRow[];
  setUnmapped: (next: UnmappedRow[] | ((prev: UnmappedRow[]) => UnmappedRow[])) => void;
  services: { id: string; name: string; dept: string }[];
  onCreate: (u: UnmappedRow, index: number) => string | null;
  onMap: (u: UnmappedRow, index: number, serviceId: string) => void;
}

function VolumeUnmappedPanel({
  unmapped, setUnmapped, services, onCreate, onMap,
}: VolumeUnmappedPanelProps) {
  return (
    <ImportReviewPanel
      label="Unmatched"
      summary={(
        <>
          {unmapped.length} row{unmapped.length === 1 ? "" : "s"} did not match an existing service.
          Map each to an existing service, create a new service from the row, or skip.
        </>
      )}
      actions={(
        <ImportReviewAction onClick={() => setUnmapped([])}>
          Dismiss all
        </ImportReviewAction>
      )}
    >
      {unmapped.map((u, i) => {
        const d = unmappedRowDetails(u);
        const candidates = services
          .filter((s) => s.dept === d.dept)
          .sort((a, b) => a.name.localeCompare(b.name));
        const placeholder = candidates.length > 0
          ? "Map to existing service…"
          : `No services in ${d.dept}`;
        return (
          <ImportReviewRow
            key={i}
            columns="minmax(220px, 1.8fr) 80px minmax(160px, 1.2fr) auto auto"
            isLast={i === unmapped.length - 1}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
              <span className="mono" style={{
                fontSize: "var(--t-l8)", color: "var(--ink-3)",
                letterSpacing: "0.04em",
              }}>{d.dept} · {d.reason}</span>
            </div>
            <span className="num" style={{
              textAlign: "right", color: "var(--ink-2)",
              fontVariantNumeric: "tabular-nums",
            }}>{d.current}</span>
            <CellSelect
              value=""
              options={[
                { value: "", label: placeholder },
                ...candidates.map((s) => ({ value: s.id, label: s.name })),
              ]}
              onChange={(v) => { if (v) onMap(u, i, v); }}
            />
            <ImportReviewAction onClick={() => onCreate(u, i)}>
              Create new
            </ImportReviewAction>
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
  );
}

// ── CAP unmapped bases review ──────────────────────────────────────────

function CapUnmappedPanel({ unmappedBases, setUnmappedBases }: {
  unmappedBases: UnmappedRow[];
  setUnmappedBases: (next: UnmappedRow[] | ((prev: UnmappedRow[]) => UnmappedRow[])) => void;
}) {
  return (
    <ImportReviewPanel
      label="CAP import review"
      summary={`${unmappedBases.length} issue${unmappedBases.length === 1 ? "" : "s"} — correct the source or skip.`}
      actions={(
        <ImportReviewAction onClick={() => setUnmappedBases([])}>
          Dismiss all
        </ImportReviewAction>
      )}
    >
      {unmappedBases.map((u, i) => {
        const d = unmappedBasisDetails(u);
        return (
          <ImportReviewRow
            key={i}
            columns="minmax(220px, 2fr) minmax(140px, 1.4fr) minmax(140px, 1fr) 60px"
            isLast={i === unmappedBases.length - 1}
          >
            <span style={{ color: "var(--ink)" }}>{d.name}</span>
            <span style={{ color: "var(--ink-2)", fontSize: "var(--t-l8)" }}>{d.source}</span>
            <span style={{ fontSize: "var(--t-l8)", color: "var(--ink-3)" }}>{d.reason}</span>
            <ImportReviewAction
              align="right"
              onClick={() => setUnmappedBases((prev) => prev.filter((_, j) => j !== i))}
            >
              Skip
            </ImportReviewAction>
          </ImportReviewRow>
        );
      })}
    </ImportReviewPanel>
  );
}
