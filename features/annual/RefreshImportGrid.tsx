import { useState, type ReactNode } from "react";
import { Btn, Icon, SectionLabel } from "@/components/ui";
import { useBuildState } from "@/lib/store";
import type { BuildImportLog, Domain } from "@/lib/store";
import {
  deriveRefreshSections, deriveRefreshSummary, type RefreshSectionCard,
} from "@/lib/data/annual";
import { InlineImportCard } from "@/features/imports/InlineImportCard";
import {
  ImportReviewAction, ImportReviewPanel, ImportReviewRow,
} from "@/features/imports/ImportReviewPanel";
import {
  useDirectLaborImportHandlers, useOperatingImportHandlers,
  useServicesImportHandlers, useVolumeImportHandlers,
  useFeesImportHandlers, useCapImportHandlers,
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

/** Plain-English description of the kinds of source documents the
 *  domain's parser knows how to read. Surfaced in the expanded card so
 *  users see what they can upload before they're asked to pick a file. */
const SUPPORTED_DOCS: Record<Domain, string[]> = {
  positions: ["Personnel budget", "Salary & benefits report", "Position roster"],
  operating: ["Budget book", "Expenditure detail report", "Operating budget extract"],
  volume:    ["Annual report", "Permit-volume table", "Activity / volume appendix"],
  services:  ["Prior fee study", "Cost-of-service report", "Services catalog export"],
  fees:      ["Adopted fee schedule", "Master fee resolution"],
  cap:       ["Cost Allocation Plan", "Indirect cost rate proposal"],
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
  const summary = deriveRefreshSummary(input);
  const importedDomains = summary.inputsRefreshed;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Drop zone */}
      <div style={{
        background: "var(--paper)", border: "2px dashed var(--rule-strong)",
        padding: "14px 20px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
          <div className="mono" style={{
            fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.12em",
            color: "var(--ink-3)", textTransform: "uppercase",
          }}>
            Refresh source files
          </div>
          <div className="mono" style={{ fontSize: "var(--t-l4)", color: "var(--ink-3)", whiteSpace: "nowrap" }}>
            Last refresh: <span style={{ color: "var(--ink-2)" }}>{summary.lastRefresh}</span>
            {summary.hasImports
              ? <>
                  {" · "}{importedDomains} of {summary.totalInputs} input{summary.totalInputs === 1 ? "" : "s"}
                  {summary.totalReview > 0 && <span style={{ color: "var(--warn)" }}> · {summary.totalReview} need review</span>}
                </>
              : <> {" · "}Seed baseline · upload sources to refresh</>}
          </div>
        </div>
        <div style={{ fontSize: "var(--t-l7)", color: "var(--ink-2)", marginTop: 6, lineHeight: 1.5 }}>
          Upload current-year exports for staffing, operating, volume of activity, fee schedules, and CAP inputs.
        </div>
      </div>

      {/* Per-source cards */}
      <div>
        <SectionLabel right={`${cards.length} sources · ${importedDomains} refreshed`}>
          Source documents
        </SectionLabel>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {cards.map((c) => <DomainCard key={c.domain} card={c} imports={state.imports}/>)}
        </div>
      </div>
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

function PositionsCard({ card, imports }: DomainCardProps) {
  const importer = useDirectLaborImportHandlers();
  return <SourceCardShell card={card} imports={imports} importer={importer}/>;
}

function OperatingCard({ card, imports }: DomainCardProps) {
  const importer = useOperatingImportHandlers();
  return <SourceCardShell card={card} imports={imports} importer={importer}/>;
}

function ServicesCard({ card, imports }: DomainCardProps) {
  const importer = useServicesImportHandlers();
  return <SourceCardShell card={card} imports={imports} importer={importer}/>;
}

function FeesCard({ card, imports }: DomainCardProps) {
  const importer = useFeesImportHandlers();
  return <SourceCardShell card={card} imports={imports} importer={importer}/>;
}

function VolumeCard({ card, imports }: DomainCardProps) {
  const importer = useVolumeImportHandlers();
  const reviewExtra = importer.unmapped.length;
  return (
    <SourceCardShell card={card} imports={imports} importer={importer} reviewExtra={reviewExtra}>
      {importer.unmapped.length > 0 && (
        <VolumeUnmappedPanel
          unmapped={importer.unmapped}
          setUnmapped={importer.setUnmapped}
        />
      )}
    </SourceCardShell>
  );
}

function CapCard({ card, imports }: DomainCardProps) {
  const importer = useCapImportHandlers();
  const reviewExtra = importer.unmappedBases.length;
  return (
    <SourceCardShell card={card} imports={imports} importer={importer} reviewExtra={reviewExtra}>
      {importer.unmappedBases.length > 0 && (
        <CapUnmappedPanel
          unmappedBases={importer.unmappedBases}
          setUnmappedBases={importer.setUnmappedBases}
        />
      )}
    </SourceCardShell>
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
  children?: ReactNode;
}

/** Source-Data card. Collapsed view shows only source name, loaded
 *  status, items requiring review (if any), last-refresh date, and
 *  Review / Re-import actions. Expand to surface import controls,
 *  contextual document-type guidance, paste-JSON shape, recent import
 *  history, and domain-specific review panels (children). */
function SourceCardShell({ card, imports, importer, reviewExtra = 0, children }: SourceCardShellProps) {
  const [expanded, setExpanded] = useState(false);
  const noun = LOADED_NOUN[card.domain];
  const loaded = card.seedCount;
  const reviewTotal = card.review + reviewExtra;
  const hasReview = reviewTotal > 0;

  const open = () => setExpanded(true);
  const toggle = () => setExpanded((v) => !v);

  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule)",
      padding: 20,
      display: "flex", flexDirection: "column", gap: 14,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="display" style={{ fontSize: 16, fontWeight: 600 }}>{card.name}</div>
          <div style={{ fontSize: "var(--fs-ui)", color: "var(--ink-2)" }}>
            <span className="num" style={{ fontWeight: 500, color: "var(--ink)" }}>
              {loaded.toLocaleString()}
            </span>{" "}{loaded === 1 ? noun.singular : noun.plural} loaded
            {hasReview && (
              <>
                {" · "}
                <span className="num" style={{ color: "var(--warn)", fontWeight: 500 }}>
                  {reviewTotal}
                </span>{" "}item{reviewTotal === 1 ? "" : "s"} need review
              </>
            )}
          </div>
          <div className="mono" style={{ fontSize: "var(--t-l4)", color: "var(--ink-4)" }}>
            {card.hasImports
              ? `Last refreshed ${formatStamp(card.lastImport!)}`
              : "Never refreshed · using seed baseline"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {hasReview && (
            <Btn kind="ghost" onClick={open}>Review</Btn>
          )}
          <Btn kind="ghost" onClick={open}>
            <Icon name="arrow-up-to-line" size={13}/> Re-import
          </Btn>
          <button
            onClick={toggle}
            aria-label={expanded ? "Collapse" : "Expand"}
            style={{
              border: "1px solid var(--rule)", background: "var(--paper)",
              padding: "4px 8px", cursor: "pointer",
              fontSize: "var(--t-l9)", color: "var(--ink-3)",
              fontFamily: "var(--ff-mono)", letterSpacing: "0.05em",
            }}
          >
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {expanded && (
        <ExpandedDetail
          card={card}
          imports={imports}
          importer={importer}
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
  children?: ReactNode;
}

function ExpandedDetail({ card, imports, importer, children }: ExpandedDetailProps) {
  const supported = SUPPORTED_DOCS[card.domain];
  const history = imports
    .filter((e) => e.domain === card.domain)
    .sort((a, b) => (b.at > a.at ? 1 : -1))
    .slice(0, 4);

  return (
    <div style={{
      borderTop: "1px solid var(--rule)",
      paddingTop: 14,
      display: "flex", flexDirection: "column", gap: 14,
    }}>
      {/* Contextual guidance */}
      <div>
        <SubsectionEyebrow>What to upload</SubsectionEyebrow>
        <div style={{ fontSize: "var(--fs-ui)", color: "var(--ink-2)", lineHeight: 1.55 }}>
          {importer.aiPdfHelper}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {supported.map((label) => (
            <span key={label} className="mono" style={{
              fontSize: "var(--t-l4)", color: "var(--ink-2)",
              padding: "2px 8px",
              border: "1px solid var(--rule)",
              background: "var(--paper-2)",
              letterSpacing: "0.04em",
            }}>{label}</span>
          ))}
        </div>
      </div>

      {/* Import actions */}
      <InlineImportCard
        aiPdfHelper={importer.aiPdfHelper}
        onAiPdfImport={importer.aiPdf}
        pasteExample={importer.pasteExample}
        pasteHelper={importer.pasteHelper}
        pasteSchema={importer.pasteSchema}
        onPasteJson={importer.pasteJson}
      />

      {/* Domain-specific review (volume unmapped, cap unbound bases) */}
      {children}

      {/* Recent import history */}
      {history.length > 0 && (
        <div>
          <SubsectionEyebrow>Recent imports</SubsectionEyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {history.map((entry) => (
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
                }} title={entry.result.fileName}>{entry.result.fileName}</span>
                <span className="num" style={{ color: "var(--ink-3)" }}>
                  {entry.result.rows.toLocaleString()} rows
                  {entry.result.lowConfidence > 0 && (
                    <span style={{ color: "var(--warn)" }}>
                      {" · "}{entry.result.lowConfidence} review
                    </span>
                  )}
                </span>
                <span className="mono" style={{ color: "var(--ink-4)", fontSize: "var(--t-l4)" }}>
                  {formatStamp(entry.at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
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

function VolumeUnmappedPanel({ unmapped, setUnmapped }: {
  unmapped: UnmappedRow[];
  setUnmapped: (next: UnmappedRow[] | ((prev: UnmappedRow[]) => UnmappedRow[])) => void;
}) {
  return (
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
        const d = unmappedRowDetails(u);
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
  );
}

// ── CAP unmapped bases review ──────────────────────────────────────────

function CapUnmappedPanel({ unmappedBases, setUnmappedBases }: {
  unmappedBases: UnmappedRow[];
  setUnmappedBases: (next: UnmappedRow[] | ((prev: UnmappedRow[]) => UnmappedRow[])) => void;
}) {
  return (
    <ImportReviewPanel
      label="Bases for review"
      summary={`${unmappedBases.length} unbound — pick a driverKey or skip.`}
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
            columns="minmax(220px, 2fr) 120px minmax(140px, 1.4fr) minmax(140px, 1fr) 60px"
            isLast={i === unmappedBases.length - 1}
          >
            <span style={{ color: "var(--ink)" }}>{d.name}</span>
            <span className="mono" style={{
              fontSize: "var(--t-l4)", color: "var(--ink-3)",
              letterSpacing: "0.06em",
            }}>{d.driverKey}</span>
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
