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
import { CellSelect } from "@/components/ui";
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

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        {cards.map((c) => <DomainCard key={c.domain} card={c} imports={state.imports}/>)}
      </div>
      <div style={{ marginTop: 12 }}>
        <FeeStudyCard/>
      </div>
    </>
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

function CapCard({ card, imports }: DomainCardProps) {
  const importer = useCapImportHandlers();
  const reviewExtra = importer.unmappedBases.length;
  return (
    <SourceCardShell
      card={card} imports={imports} importer={importer} reviewExtra={reviewExtra}
      compactAiStatus
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

/** Optional composite upload surface — not a Domain. Lets the user select
 *  one fee-study PDF; extracted sections flow through the EXISTING
 *  services/volume/fees/positions converters and merge actions (see
 *  useFeeStudyImportHandlers), never a parallel calc/merge path. No new
 *  Domain, no new store slice — each domain's own "Recent imports" list
 *  shows the resulting entries. */
function FeeStudyCard() {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const importer = useFeeStudyImportHandlers();

  const toggle = () => setExpanded((v) => !v);
  const handleHeaderKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };

  const borderColor = expanded || hovered ? "var(--rule-strong)" : "var(--rule)";
  const headerBg = hovered && !expanded ? "var(--paper-2)" : "transparent";

  return (
    <div style={{
      background: "var(--paper)",
      border: `1px solid ${borderColor}`,
      transition: "border-color 80ms",
    }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`Fee Study — ${expanded ? "collapse" : "expand"} details`}
        onClick={toggle}
        onKeyDown={handleHeaderKeyDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          padding: 20,
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
          cursor: "pointer",
          background: headerBg,
          transition: "background 80ms",
          userSelect: "none",
        }}
      >
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="display" style={{ fontSize: 16, fontWeight: 600 }}>Fee Study</span>
            <span className="mono" style={{
              fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.1em",
              color: "var(--ink-3)", textTransform: "uppercase",
              padding: "2px 6px", border: "1px solid var(--rule)",
              background: "var(--paper-2)",
            }}>Optional</span>
          </div>
          <div style={{ fontSize: "var(--fs-ui)", color: "var(--ink-2)" }}>
            {importer.summaries.length > 0
              ? <span style={{ color: "var(--ink)", fontWeight: 500 }}>Imported</span>
              : <span style={{ color: "var(--ink-3)", fontWeight: 500 }}>Not Imported</span>}
          </div>
          <div style={{ fontSize: "var(--t-l7)", color: "var(--ink-3)", lineHeight: 1.45 }}>
            Extract services, hours, volumes, and fee schedules from one study.
          </div>
        </div>
      </div>

      {expanded && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            borderTop: "1px solid var(--rule)",
            padding: "14px 20px 18px",
            display: "flex", flexDirection: "column", gap: 12,
          }}
        >
          <InlineImportCard
            aiPdfLabel="Upload PDF"
            aiPdfAccept=".pdf"
            onAiPdfImport={importer.aiPdf}
            compactAiStatus
          />

          {importer.unmapped.length > 0 && (
            <VolumeUnmappedPanel
              unmapped={importer.unmapped}
              setUnmapped={importer.setUnmapped}
              services={importer.services}
              onCreate={importer.createServiceForUnmapped}
              onMap={importer.mapUnmappedToService}
            />
          )}

          {importer.summaries.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <SubsectionEyebrow>Applied</SubsectionEyebrow>
              {importer.summaries.map((s) => (
                <div key={s.domain} style={{ fontSize: "var(--t-l7)", color: "var(--ink-2)" }}>
                  <span className="mono" style={{ textTransform: "capitalize" }}>{s.domain}</span>
                  {": "}
                  <span className="num">{s.applied.mapped}</span> new,{" "}
                  <span className="num">{s.applied.duplicates}</span> updated,{" "}
                  <span className="num">{s.applied.lowConfidence}</span> for review
                </div>
              ))}
              <div style={{ fontSize: "var(--t-l7)", color: "var(--ink-3)" }}>
                See each source card above for full history and review.
              </div>
            </div>
          )}

          <RecentImportsSection entries={importer.history}/>
        </div>
      )}
    </div>
  );
}

interface SourceCardShellProps {
  card: RefreshSectionCard;
  imports: BuildImportLog[];
  importer: ImportHandlerBundle;
  /** Extra review-pending count surfaced by domain-specific state
   *  (Volume's unmapped rows, CAP's unbound bases). Added to the
   *  card-level low-confidence count for the collapsed badge. */
  reviewExtra?: number;
  /** Slot rendered to the right of the Upload PDF button inside the
   *  expanded InlineImportCard. Used by the Fees card to put the
   *  Upload Excel button beside Upload PDF. */
  aiPdfAccessory?: ReactNode;
  /** Slot rendered between the PDF action panel and the Advanced
   *  disclosure inside InlineImportCard. Used by the Fees card to
   *  render the Excel mapping panel directly below the upload buttons,
   *  above the paste-JSON fallback. */
  aiPdfBelow?: ReactNode;
  /** Minimal PDF-upload status presentation for InlineImportCard — see
   *  its `compactAiStatus` doc. Defaults on for source cards so Upload
   *  PDF behaves consistently with the CAP card. */
  compactAiStatus?: boolean;
  children?: ReactNode;
}

/** Source-Data card. Collapsed view shows source name, import status,
 *  items requiring review (if any), last-refresh date, and the Import
 *  action. The whole card header is the expand affordance — clicking
 *  anywhere outside the Import button toggles. Expand to surface
 *  import controls, contextual document-type guidance, paste-JSON
 *  shape, recent import history, and domain-specific review panels
 *  (children). */
function SourceCardShell({
  card, imports, importer, reviewExtra = 0,
  aiPdfAccessory, aiPdfBelow, compactAiStatus, children,
}: SourceCardShellProps) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const noun = LOADED_NOUN[card.domain];
  const loaded = card.seedCount;
  const reviewTotal = card.review + reviewExtra;
  const hasReview = reviewTotal > 0;

  const toggle = () => setExpanded((v) => !v);
  const handleHeaderKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };

  // Hover treatment mirrors .tbl-row-hover-grid in src/index.css: 80ms
  // background tint to paper-2. The border darkens to rule-strong for
  // the same affordance the clickable rows on DataTable use.
  const borderColor = expanded || hovered ? "var(--rule-strong)" : "var(--rule)";
  const headerBg = hovered && !expanded ? "var(--paper-2)" : "transparent";

  return (
    <div id={card.domain} style={{
      background: "var(--paper)",
      border: `1px solid ${borderColor}`,
      transition: "border-color 80ms",
      scrollMarginTop: 110,
    }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${card.name} — ${expanded ? "collapse" : "expand"} details`}
        onClick={toggle}
        onKeyDown={handleHeaderKeyDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          padding: 20,
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
          cursor: "pointer",
          background: headerBg,
          transition: "background 80ms",
          userSelect: "none",
        }}
      >
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="display" style={{ fontSize: 16, fontWeight: 600 }}>{card.name}</span>
            {OPTIONAL_DOMAINS.has(card.domain) && (
              <span className="mono" style={{
                fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.1em",
                color: "var(--ink-3)", textTransform: "uppercase",
                padding: "2px 6px", border: "1px solid var(--rule)",
                background: "var(--paper-2)",
              }}>Optional</span>
            )}
          </div>
          <div style={{ fontSize: "var(--fs-ui)", color: "var(--ink-2)" }}>
            {card.hasImports
              ? (
                <>
                  <span style={{ color: "var(--ink)", fontWeight: 500 }}>Imported</span>
                  {" · "}
                  <span className="num">{loaded.toLocaleString()}</span>
                  {" "}{loaded === 1 ? noun.singular : noun.plural}
                </>
              )
              : <span style={{ color: "var(--ink-3)", fontWeight: 500 }}>Not Imported</span>}
            {hasReview && (
              <>
                {" · "}
                <span className="num" style={{ color: "var(--warn)", fontWeight: 500 }}>
                  {reviewTotal}
                </span>{" "}item{reviewTotal === 1 ? "" : "s"} need review
              </>
            )}
          </div>
          <div style={{ fontSize: "var(--t-l7)", color: "var(--ink-3)", lineHeight: 1.45 }}>
            {importer.tagline}
          </div>
        </div>
      </div>

      {expanded && (
        <ExpandedDetail
          card={card}
          imports={imports}
          importer={importer}
          aiPdfAccessory={aiPdfAccessory}
          aiPdfBelow={aiPdfBelow}
          compactAiStatus={compactAiStatus}
        >
          {children}
        </ExpandedDetail>
      )}
    </div>
  );
}

interface ExpandedDetailProps {
  card: RefreshSectionCard;
  imports: BuildImportLog[];
  importer: ImportHandlerBundle;
  aiPdfAccessory?: ReactNode;
  aiPdfBelow?: ReactNode;
  compactAiStatus?: boolean;
  children?: ReactNode;
}

function ExpandedDetail({
  card, imports, importer, aiPdfAccessory, aiPdfBelow, compactAiStatus, children,
}: ExpandedDetailProps) {
  const history = imports
    .filter((e) => e.domain === card.domain)
    .sort((a, b) => (b.at > a.at ? 1 : -1))
    .slice(0, 4);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        borderTop: "1px solid var(--rule)",
        padding: "14px 20px 18px",
        display: "flex", flexDirection: "column", gap: 12,
      }}
    >
      {/* Import actions — PDF primary, paste hidden behind Advanced */}
      <InlineImportCard
        onAiPdfImport={importer.aiPdf}
        pasteExample={importer.pasteExample}
        pasteHelper={importer.pasteHelper}
        pasteSchema={importer.pasteSchema}
        onPasteJson={importer.pasteJson}
        pasteAdvanced
        aiPdfAccessory={aiPdfAccessory}
        aiPdfBelow={aiPdfBelow}
        compactAiStatus={compactAiStatus ?? true}
      />

      {/* Domain-specific review (volume unmapped, cap unbound bases) */}
      {children}

      {/* Recent import history */}
      <RecentImportsSection entries={history.map((entry) => ({
        id: entry.id, fileName: entry.result.fileName, rows: entry.result.rows, at: entry.at,
      }))}/>
    </div>
  );
}

interface RecentImportEntry {
  id: number | string;
  fileName: string;
  rows: number;
  at: string;
}

/** "Recent imports" list shared by each domain card (ExpandedDetail) and
 *  the Fee Study composite card — same filename/rows/date row shape, just
 *  sourced differently (per-domain BuildImportLog vs. FeeStudyHistoryEntry). */
function RecentImportsSection({ entries }: { entries: RecentImportEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div>
      <SubsectionEyebrow>Recent imports</SubsectionEyebrow>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {entries.map((entry) => (
          <div key={entry.id} style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto auto",
            gap: 12,
            fontSize: "var(--t-l7)", color: "var(--ink-2)",
            padding: "4px 0",
            borderBottom: "1px dashed var(--rule)",
            alignItems: "baseline",
          }}>
            <span style={{
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }} title={entry.fileName}>{displayFileName(entry.fileName)}</span>
            <span className="num" style={{ color: "var(--ink-3)" }}>
              {entry.rows.toLocaleString()} rows
            </span>
            <span className="mono" style={{ color: "var(--ink-4)", fontSize: "var(--t-l4)" }}>
              {formatStamp(entry.at)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SubsectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mono" style={{
      fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.12em",
      color: "var(--ink-3)", textTransform: "uppercase",
      marginBottom: 6,
    }}>{children}</div>
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
            <span style={{ color: "var(--ink-2)", fontSize: 12 }}>{d.source}</span>
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
