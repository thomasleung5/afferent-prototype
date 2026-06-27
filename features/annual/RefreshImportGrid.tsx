import { useState, type ReactNode } from "react";
import { useBuildState } from "@/lib/store";
import type { BuildImportLog, Domain } from "@/lib/store";
import {
  deriveRefreshSections, type RefreshSectionCard,
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

/** Every source on the page — Fee Study (a composite, non-domain
 *  accelerant) and CAP first since one upload each can auto-populate
 *  several of the other cards, then the 5 required domains in their
 *  established order. All 7 render through the identical
 *  SourceCardShell — see that component's doc comment. */
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
  const capCard = cards.find((c) => c.domain === "cap")!;
  const otherCards = cards.filter((c) => c.domain !== "cap");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
      <FeeStudyCard/>
      <DomainCard card={capCard} imports={state.imports}/>
      {otherCards.map((c) => <DomainCard key={c.domain} card={c} imports={state.imports}/>)}
    </div>
  );
}

/** Dispatch to the right per-domain card. Each card calls its own
 *  handler hook — keeping the call sites flat so React's hook order
 *  stays stable across renders. */
function DomainCard({ card, imports }: { card: RefreshSectionCard; imports: BuildImportLog[] }) {
  switch (card.domain) {
    case "positions": return <PositionsCard card={card} imports={imports}/>;
    case "operating": return <OperatingCard card={card} imports={imports}/>;
    case "services":  return <ServicesCard card={card} imports={imports}/>;
    case "volume":    return <VolumeCard card={card} imports={imports}/>;
    case "fees":      return <FeesCard card={card} imports={imports}/>;
    case "cap":       return <CapCard card={card} imports={imports}/>;
  }
}

interface DomainCardProps {
  card: RefreshSectionCard;
  imports: BuildImportLog[];
}

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

interface DomainCardInfo {
  hasImports: boolean;
  loadedCount: number;
  loadedNoun: { singular: string; plural: string };
  reviewTotal: number;
  isExtraction: boolean;
  recentEntries: RecentImportEntry[];
}

/** Derives every SourceCardShell status input from a domain's
 *  RefreshSectionCard + the global imports log — the one place that
 *  filters `imports` by `card.domain`, so every *Card component below
 *  stays domain-agnostic past this point. `reviewExtra` folds in
 *  domain-specific pending review (Volume's unmapped rows, CAP's
 *  unbound bases) that doesn't show up in card.review itself. */
function domainCardInfo(
  card: RefreshSectionCard, imports: BuildImportLog[], reviewExtra: number,
): DomainCardInfo {
  const matching = imports.filter((e) => e.domain === card.domain);
  const latest = matching.length > 0
    ? matching.reduce((a, b) => (b.id > a.id ? b : a))
    : undefined;
  return {
    hasImports: card.hasImports,
    loadedCount: card.seedCount,
    loadedNoun: LOADED_NOUN[card.domain],
    reviewTotal: card.review + reviewExtra,
    isExtraction: Boolean(latest?.batchId),
    recentEntries: matching
      .sort((a, b) => (b.at > a.at ? 1 : -1))
      .slice(0, 4)
      .map((entry) => ({
        id: entry.id, fileName: entry.result.fileName, rows: entry.result.rows, at: entry.at,
        via: provenanceLabel(entry.batchId) ?? undefined,
      })),
  };
}

function PositionsCard({ card, imports }: DomainCardProps) {
  const importer = useLaborImportHandlers();
  const excel = useExcelLaborImport();
  return (
    <SourceCardShell
      id={card.domain} name={card.name} description={card.description}
      {...domainCardInfo(card, imports, 0)}
      importer={importer}
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
      id={card.domain} name={card.name} description={card.description}
      {...domainCardInfo(card, imports, 0)}
      importer={importer}
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
      id={card.domain} name={card.name} description={card.description}
      {...domainCardInfo(card, imports, 0)}
      importer={importer}
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
      id={card.domain} name={card.name} description={card.description}
      {...domainCardInfo(card, imports, 0)}
      importer={importer}
      aiPdfAccessory={<ExcelFeeUploadButton state={excel}/>}
      aiPdfBelow={<ExcelFeeMappingPanel state={excel}/>}
    />
  );
}

function VolumeCard({ card, imports }: DomainCardProps) {
  const importer = useVolumeImportHandlers();
  const excel = useExcelVolumeImport();
  return (
    <SourceCardShell
      id={card.domain} name={card.name} description={card.description}
      {...domainCardInfo(card, imports, importer.unmapped.length)}
      importer={importer}
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

function CapCard({ card, imports }: DomainCardProps) {
  const importer = useCapImportHandlers();
  return (
    <SourceCardShell
      id={card.domain} name={card.name} description={card.description}
      optional
      {...domainCardInfo(card, imports, importer.unmappedBases.length)}
      importer={importer}
    >
      {importer.unmappedBases.length > 0 && (
        <CapUnmappedPanel
          unmappedBases={importer.unmappedBases}
          setUnmappedBases={importer.setUnmappedBases}
        />
      )}
    </SourceCardShell>
  );
}

const FEE_STUDY_NOUN = { singular: "row", plural: "rows" };
const FEE_STUDY_DESCRIPTION =
  "Populates Services Catalog, Volume of Activity, Fee Schedule, and Staffing & Positions from one PDF.";

/** Fee Study has no domain of its own — one upload spans up to 4 other
 *  domains, each tagged with a shared batchId rather than written under
 *  a "fee-study" domain. Its status/history are derived from that
 *  batch grouping (feeStudyHistoryFromImports) instead of
 *  domainCardInfo's per-domain filtering, but it renders through the
 *  exact same SourceCardShell as every other source. */
function FeeStudyCard() {
  const feeStudy = useFeeStudyImportHandlers();
  const latest = feeStudy.history[0];
  return (
    <SourceCardShell
      id="fee-study" name="Fee Study" description={FEE_STUDY_DESCRIPTION}
      optional
      hasImports={feeStudy.history.length > 0}
      loadedCount={latest?.rows ?? 0}
      loadedNoun={FEE_STUDY_NOUN}
      reviewTotal={feeStudy.unmapped.length}
      isExtraction={false}
      recentEntries={feeStudy.history.map((h) => (
        { id: h.id, fileName: h.fileName, rows: h.rows, at: h.at }
      ))}
      importer={feeStudy}
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
    </SourceCardShell>
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
  hasImports: boolean, reviewTotal: number, isExtraction: boolean,
): CardStatus {
  if (reviewTotal > 0) return "review";
  if (!hasImports) return "not-imported";
  return isExtraction ? "extraction" : "ok";
}

interface SourceCardShellProps {
  id: string;
  name: string;
  description: string;
  /** Renders the "Optional" badge beside the title. True for CAP and
   *  Fee Study — neither counts toward the "X of 5 required" stat. */
  optional?: boolean;
  hasImports: boolean;
  loadedCount: number;
  loadedNoun: { singular: string; plural: string };
  /** Total items needing review, already folded in from any
   *  domain-specific source (Volume's unmapped rows, CAP's unbound
   *  bases, Fee Study's unmapped rows). */
  reviewTotal: number;
  /** True when the most recent import for this card was auto-populated
   *  via Fee Study (a shared batchId) rather than uploaded directly. */
  isExtraction: boolean;
  recentEntries: RecentImportEntry[];
  importer: ImportHandlerBundle;
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
   *  PDF behaves consistently across every card. */
  compactAiStatus?: boolean;
  children?: ReactNode;
}

/** The single source-card pattern used by every source on this page —
 *  CAP and Fee Study alike with the 5 required domains. Always shows
 *  title, description, import status, items requiring review (if
 *  any), the upload action, and — once something is imported — the
 *  Recent Imports disclosure, in that fixed order regardless of
 *  whether a given source supports PDF-only (CAP, Fee Study) or
 *  PDF+Excel (the rest), or has its own review panel (children). No
 *  expand/collapse: every card surfaces its full detail up front. */
function SourceCardShell({
  id, name, description, optional, hasImports, loadedCount, loadedNoun,
  reviewTotal, isExtraction, recentEntries, importer,
  aiPdfAccessory, aiPdfBelow, compactAiStatus, children,
}: SourceCardShellProps) {
  const hasReview = reviewTotal > 0;
  const status = cardStatus(hasImports, reviewTotal, isExtraction);
  const statusColor = STATUS_COLOR[status];

  return (
    <div id={id} style={{
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
            <span className="display" style={{ fontSize: 16, fontWeight: 600 }}>{name}</span>
            {optional && (
              <span className="mono" style={{
                fontSize: "var(--t-l4)", fontWeight: 600, letterSpacing: "0.06em",
                color: "var(--ink-2)", textTransform: "uppercase",
                padding: "2px 6px", border: "1px solid var(--rule)",
                background: "var(--paper-2)",
              }}>Optional</span>
            )}
          </div>
          <div style={{ fontSize: "var(--t-l7)", color: "var(--ink-3)" }}>
            {description}
          </div>
          <div style={{ fontSize: "var(--fs-ui)", color: statusColor.text, fontWeight: 500 }}>
            {hasImports
              ? (
                <>
                  Imported{" · "}
                  <span className="num">{loadedCount.toLocaleString()}</span>
                  {" "}{loadedCount === 1 ? loadedNoun.singular : loadedNoun.plural}
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
          importer={importer}
          aiPdfAccessory={aiPdfAccessory}
          aiPdfBelow={aiPdfBelow}
          compactAiStatus={compactAiStatus}
          recentEntries={recentEntries}
        >
          {children}
        </CardBody>
      </div>
    </div>
  );
}

interface CardBodyProps {
  importer: ImportHandlerBundle;
  aiPdfAccessory?: ReactNode;
  aiPdfBelow?: ReactNode;
  compactAiStatus?: boolean;
  recentEntries: RecentImportEntry[];
  children?: ReactNode;
}

function CardBody({
  importer, aiPdfAccessory, aiPdfBelow, compactAiStatus, recentEntries, children,
}: CardBodyProps) {
  const [showHistory, setShowHistory] = useState(false);

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
       *  not-imported cards (recentEntries is empty there). */}
      {recentEntries.length > 0 && (
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
              <RecentImportsSection entries={recentEntries}/>
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
