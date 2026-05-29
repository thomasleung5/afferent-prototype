import { type ReactNode } from "react";
import { SectionLabel } from "@/components/ui";
import { useBuildState } from "@/lib/store";
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
                  {" · "}{summary.totalRows.toLocaleString()} rows
                  {" · "}<span style={{ color: "var(--pos)" }}>{summary.autoPct}% auto-mapped</span>
                  {summary.totalReview > 0 && <span style={{ color: "var(--warn)" }}> · {summary.totalReview} need review</span>}
                </>
              : <> {" · "}Seed baseline · upload sources to refresh</>}
          </div>
        </div>
        <div style={{ fontSize: "var(--t-l7)", color: "var(--ink-2)", marginTop: 6, lineHeight: 1.5 }}>
          Upload current-year exports for staffing, operating, volume of activity, fee schedules, benchmark fees, and CAP inputs.
        </div>
      </div>

      {/* Per-section cards */}
      <div>
        <SectionLabel right={`${cards.length} sections · ${importedDomains} refreshed`}>
          Imports by model section
        </SectionLabel>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {cards.map((c) => <DomainCard key={c.domain} card={c}/>)}
        </div>
      </div>
    </div>
  );
}

/** Dispatch to the right per-domain card. Each card calls its own
 *  handler hook — keeping the call sites flat so React's hook order
 *  stays stable across renders. */
function DomainCard({ card }: { card: RefreshSectionCard }) {
  switch (card.domain) {
    case "positions": return <PositionsCard card={card}/>;
    case "operating": return <OperatingCard card={card}/>;
    case "services":  return <ServicesCard card={card}/>;
    case "volume":    return <VolumeCard card={card}/>;
    case "fees":      return <FeesCard card={card}/>;
    case "cap":       return <CapCard card={card}/>;
  }
}

function PositionsCard({ card }: { card: RefreshSectionCard }) {
  const importer = useDirectLaborImportHandlers();
  return <ImportSectionShell card={card} importer={importer}/>;
}

function OperatingCard({ card }: { card: RefreshSectionCard }) {
  const importer = useOperatingImportHandlers();
  return <ImportSectionShell card={card} importer={importer}/>;
}

function ServicesCard({ card }: { card: RefreshSectionCard }) {
  const importer = useServicesImportHandlers();
  return <ImportSectionShell card={card} importer={importer}/>;
}

function FeesCard({ card }: { card: RefreshSectionCard }) {
  const importer = useFeesImportHandlers();
  return <ImportSectionShell card={card} importer={importer}/>;
}

function VolumeCard({ card }: { card: RefreshSectionCard }) {
  const importer = useVolumeImportHandlers();
  return (
    <ImportSectionShell card={card} importer={importer}>
      {importer.unmapped.length > 0 && (
        <VolumeUnmappedPanel
          unmapped={importer.unmapped}
          setUnmapped={importer.setUnmapped}
        />
      )}
    </ImportSectionShell>
  );
}

function CapCard({ card }: { card: RefreshSectionCard }) {
  const importer = useCapImportHandlers();
  return (
    <ImportSectionShell card={card} importer={importer}>
      {importer.unmappedBases.length > 0 && (
        <CapUnmappedPanel
          unmappedBases={importer.unmappedBases}
          setUnmappedBases={importer.setUnmappedBases}
        />
      )}
    </ImportSectionShell>
  );
}

interface ImportSectionShellProps {
  card: RefreshSectionCard;
  importer: ImportHandlerBundle;
  children?: ReactNode;
}

/** Shared visual shell: section eyebrow + name + conf badge, progress
 *  bar, 3-stat grid, last-refresh line, then the InlineImportCard
 *  affordances. Optional children render below the import actions —
 *  used for per-domain review panels (Volume / CAP unmapped rows). */
function ImportSectionShell({ card, importer, children }: ImportSectionShellProps) {
  const pct = card.rows > 0 ? Math.round((card.mapped / card.rows) * 100) : 0;
  const showSeed = !card.hasImports;
  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule)", padding: 22,
      display: "flex", flexDirection: "column", gap: 14,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="mono" style={{
            fontSize: "var(--t-l9)", fontWeight: 700, letterSpacing: "0.12em",
            color: "var(--ink-3)", textTransform: "uppercase",
          }}>{card.section}</div>
          <div className="display" style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{card.name}</div>
        </div>
        <span className="mono" style={{
          fontSize: "var(--t-l9)", fontWeight: 700, letterSpacing: "0.04em",
          padding: "2px 7px", border: "1px solid var(--rule)",
          background: "var(--paper-2)", color: "var(--ink-2)",
        }}>{showSeed ? "Seed" : card.conf}</span>
      </div>

      <div style={{ height: 6, background: "var(--rule)", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: showSeed ? "100%" : `${pct}%`,
          background: showSeed
            ? "var(--ink-4)"
            : (card.review > 10 ? "var(--warn)" : "var(--pos)"),
        }}/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {showSeed
          ? [
              { label: "In model",   value: card.seedCount.toLocaleString(), color: "var(--ink)" },
              { label: "Imported",   value: "—",                              color: "var(--ink-4)" },
              { label: "Need review", value: "—",                             color: "var(--ink-4)" },
            ].map((stat) => <Stat key={stat.label} {...stat}/>)
          : [
              { label: "Imported",    value: card.rows.toLocaleString(),   color: "var(--ink)" },
              { label: "Auto-mapped", value: card.mapped.toLocaleString(), color: "var(--pos)" },
              { label: "Need review", value: String(card.review),          color: card.review > 10 ? "var(--warn)" : "var(--ink)" },
            ].map((stat) => <Stat key={stat.label} {...stat}/>)}
      </div>

      <div style={{
        paddingTop: 10, borderTop: "1px solid var(--rule)",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
      }}>
        <span className="mono" style={{ fontSize: "var(--t-l4)", color: "var(--ink-4)" }}>
          {showSeed
            ? "Never refreshed · using seed baseline"
            : `Last refreshed ${formatStamp(card.lastImport!)} · ${card.importCount} import${card.importCount === 1 ? "" : "s"}`}
        </span>
      </div>

      <InlineImportCard
        aiPdfHelper={importer.aiPdfHelper}
        onAiPdfImport={importer.aiPdf}
        pasteExample={importer.pasteExample}
        pasteHelper={importer.pasteHelper}
        pasteSchema={importer.pasteSchema}
        onPasteJson={importer.pasteJson}
      />

      {children}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className="mono" style={{
        fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.1em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>{label}</div>
      <div className="num" style={{ fontSize: 14, fontWeight: 500, marginTop: 4, color }}>
        {value}
      </div>
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
