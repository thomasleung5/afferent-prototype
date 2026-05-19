
import { useMemo, useState } from "react";
import { SectionLabel } from "@/components/ui";
import { fmt } from "@/lib/format";
import {
  ALLOCATION_BASES,
  type AllocationBasisKey, type BasisRow,
} from "@/lib/data/allocationBases";
import type { MissingReceiverEntry } from "@/lib/data/capReceiverRegistry";
import type { GlNode, GlDriverMatrix } from "@/lib/data/capStepDownGl";
import { useBuildState } from "@/lib/store";
import {
  TracePanel, TraceSection, SummaryStrip, TraceStat,
  BigFormula, CollapsibleMetadata, MetadataRow,
} from "./TracePanel";

interface OpenCell {
  basisKey: AllocationBasisKey;
  rowCode: string;
}

/** Renderable row — one per engine node (indirect cost center or direct
 *  fee-dept receiver). Extends BasisRow with the node's glCode caption. */
interface EffectiveRow extends BasisRow {
  /** glCode caption next to the dept name (omitted for synth seed nodes). */
  glCode?: string;
}

const BASIS_COLUMN_KEYS: ReadonlySet<string> =
  new Set(ALLOCATION_BASES.map((b) => b.key));

/** Build display rows from the engine's nodes + driver matrix. One row per
 *  node; values pulled from drivers[node.key]. */
function buildRowsFromNodes(nodes: GlNode[], drivers: GlDriverMatrix): EffectiveRow[] {
  return nodes.map((n) => {
    const values: Partial<Record<AllocationBasisKey, number>> = {};
    for (const [k, v] of Object.entries(drivers[n.key] ?? {})) {
      if (!BASIS_COLUMN_KEYS.has(k)) continue;
      if (typeof v === "number" && v !== 0) values[k as AllocationBasisKey] = v;
    }
    return {
      code: n.key,
      name: n.name,
      group: n.role,
      values,
      glCode: n.glCode.startsWith("seed:") ? undefined : n.glCode,
    };
  });
}

/** Step 3 of the CAP flow. The node × basis denominator matrix — one row
 *  per engine node (cost center or direct fee-dept receiver). */
export function AllocationBases() {
  const { derived } = useBuildState();
  const rows = useMemo(
    () => buildRowsFromNodes(derived.capStepDown.nodes, derived.capDrivers),
    [derived.capStepDown.nodes, derived.capDrivers],
  );
  const [openCell, setOpenCell] = useState<OpenCell | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {derived.capReceiversForReview.length > 0 && (
        <ReceiversForReviewBanner missing={derived.capReceiversForReview}/>
      )}
      <Matrix rows={rows} openCell={openCell} setOpenCell={setOpenCell}/>
      {openCell ? (
        <CellTrace
          rows={rows}
          basisKey={openCell.basisKey}
          rowCode={openCell.rowCode}
          onClose={() => setOpenCell(null)}
        />
      ) : (
        <TraceHint/>
      )}
    </div>
  );
}

function ReceiversForReviewBanner({ missing }: { missing: MissingReceiverEntry[] }) {
  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule)",
    }}>
      <div style={{
        padding: "10px 16px",
        background: "var(--paper-2)",
        borderBottom: "1px solid var(--rule)",
        display: "flex", alignItems: "baseline", gap: 10,
      }}>
        <span className="mono" style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>Receivers for review</span>
        <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          {missing.length} receiver{missing.length === 1 ? "" : "s"} imported without a glCode.
          Assign one (or accept exclusion from the matrix) so they aren't collapsed onto a sibling row.
        </span>
      </div>
      {missing.slice(0, 8).map((m, i) => (
        <div key={m.key} style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 2fr) 100px 1fr",
          gap: 12, alignItems: "baseline",
          padding: "8px 16px",
          fontSize: 12,
          borderBottom: i < Math.min(missing.length, 8) - 1 ? "1px solid var(--rule)" : "none",
        }}>
          <span style={{ color: "var(--ink)" }}>{m.dept}</span>
          <span className="num" style={{
            textAlign: "right", color: "var(--ink-2)",
            fontVariantNumeric: "tabular-nums",
          }}>{fmt.dollars(m.amount)}</span>
          <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
            from {m.poolId} · basis {m.basis}
          </span>
        </div>
      ))}
      {missing.length > 8 && (
        <div style={{
          padding: "8px 16px",
          fontSize: 11.5, color: "var(--ink-3)",
        }}>+ {missing.length - 8} more</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matrix (primary view)
// ---------------------------------------------------------------------------

function formatCell(value: number | undefined, fmtKind: string): string {
  if (value == null || value === 0) return "—";
  if (fmtKind === "k")        return fmt.dollarsK(value);
  if (fmtKind === "decimal")  return value.toFixed(2);
  return fmt.int(value);
}

function colTotal(key: AllocationBasisKey, rows: EffectiveRow[]): number {
  return rows.reduce((a, r) => a + (r.values[key] ?? 0), 0);
}

function Matrix({
  rows, openCell, setOpenCell,
}: {
  rows: EffectiveRow[];
  openCell: OpenCell | null;
  setOpenCell: (c: OpenCell | null) => void;
}) {
  const indirect = rows.filter((r) => r.group === "indirect");
  const direct   = rows.filter((r) => r.group === "direct");

  const labelCol = "minmax(220px, 1.8fr)";
  const grid = `40px ${labelCol} ${ALLOCATION_BASES.map(() => "minmax(76px, 1fr)").join(" ")}`;

  return (
    <div>
      <SectionLabel right={`${rows.length} nodes · ${ALLOCATION_BASES.length} bases`}>
        Allocation Bases
      </SectionLabel>
      <div style={{
        background: "var(--paper)", border: "1px solid var(--rule)",
        overflow: "hidden",
      }}>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 1280 }}>
          {/* Header */}
          <div style={{
            display: "grid", gridTemplateColumns: grid, gap: 10,
            padding: "10px 16px",
            background: "var(--paper-2)",
            borderBottom: "1px solid var(--rule-strong)",
            fontFamily: "var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
            letterSpacing: "0.08em", color: "var(--ink-3)", textTransform: "uppercase",
          }}>
            <div>#</div>
            <div>Node</div>
            {ALLOCATION_BASES.map((b) => (
              <div key={b.key} title={b.note} style={{ textAlign: "right" }}>{b.label}</div>
            ))}
          </div>

          <GroupLabel cols={2 + ALLOCATION_BASES.length}>Indirect cost centers</GroupLabel>
          {indirect.map((r, i) => (
            <MatrixRow key={r.code} idx={i + 1} row={r} grid={grid}
              openCell={openCell} setOpenCell={setOpenCell}/>
          ))}

          <GroupLabel cols={2 + ALLOCATION_BASES.length}>Direct receivers</GroupLabel>
          {direct.map((r, i) => (
            <MatrixRow key={r.code} idx={i + 1} row={r} grid={grid}
              openCell={openCell} setOpenCell={setOpenCell}/>
          ))}

          {/* Totals row */}
          <div style={{
            display: "grid", gridTemplateColumns: grid, gap: 10,
            padding: "11px 16px",
            background: "var(--paper-2)",
            borderTop: "2px solid var(--ink)",
            fontFamily: "var(--ff-mono)",
            fontVariantNumeric: "tabular-nums",
            fontSize: 12, fontWeight: 600,
          }}>
            <div/>
            <div className="mono" style={{
              fontSize: 10.5, letterSpacing: "0.1em",
              textTransform: "uppercase", color: "var(--ink-2)",
            }}>Total</div>
            {ALLOCATION_BASES.map((b) => {
              const t = colTotal(b.key, rows);
              return (
                <div key={b.key} className="num" style={{
                  textAlign: "right", fontSize: 12,
                }}>{formatCell(t, b.fmt)}</div>
              );
            })}
          </div>

          {/* Unit row */}
          <div style={{
            display: "grid", gridTemplateColumns: grid, gap: 10,
            padding: "7px 16px",
            background: "var(--paper-2)",
            borderTop: "1px solid var(--rule)",
            fontFamily: "var(--ff-mono)",
            fontSize: 10, color: "var(--ink-3)",
            letterSpacing: "0.04em",
          }}>
            <div/>
            <div style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>Unit</div>
            {ALLOCATION_BASES.map((b) => (
              <div key={b.key} style={{ textAlign: "right" }}>{b.unit}</div>
            ))}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function GroupLabel({ children }: { cols: number; children: string }) {
  return (
    <div style={{
      padding: "8px 16px",
      background: "var(--paper-2)",
      borderBottom: "1px solid var(--rule)",
      fontFamily: "var(--ff-mono)", fontSize: 10, fontWeight: 700,
      letterSpacing: "0.12em", color: "var(--ink-3)", textTransform: "uppercase",
    }}>
      {children}
    </div>
  );
}

function MatrixRow({
  idx, row, grid, openCell, setOpenCell,
}: {
  idx: number; row: EffectiveRow; grid: string;
  openCell: OpenCell | null;
  setOpenCell: (c: OpenCell | null) => void;
}) {
  const caption = row.glCode ?? "";
  return (
    <div style={{
      display: "grid", gridTemplateColumns: grid, gap: 10,
      padding: "9px 16px",
      borderBottom: "1px solid var(--rule)",
      alignItems: "baseline",
      fontFamily: "var(--ff-mono)",
      fontVariantNumeric: "tabular-nums",
      fontSize: 12,
    }}>
      <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
        {idx.toString().padStart(2, "0")}
      </span>
      <div style={{ fontFamily: "var(--ff-ui)", fontSize: 13, color: "var(--ink)" }}>
        <span style={{ fontWeight: 500 }}>{row.name}</span>{" "}
        <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>
          {caption}
        </span>
      </div>
      {ALLOCATION_BASES.map((b) => {
        const v = row.values[b.key];
        const empty = v == null || v === 0;
        const isOpen = openCell?.basisKey === b.key && openCell?.rowCode === row.code;
        return (
          <button
            key={b.key}
            onClick={() => !empty && setOpenCell(isOpen ? null : { basisKey: b.key, rowCode: row.code })}
            title={empty ? "—" : `${formatCell(v, b.fmt)} ${b.unit} — click for trace`}
            style={{
              textAlign: "right", padding: "2px 4px",
              fontSize: 12,
              fontFamily: "var(--ff-mono)",
              fontVariantNumeric: "tabular-nums",
              color: empty ? "var(--ink-4)" : "var(--ink)",
              background: isOpen ? "var(--accent-tint)" : "transparent",
              border: isOpen ? "1px solid var(--accent)" : "1px solid transparent",
              cursor: empty ? "default" : "pointer",
            }}
          >
            {formatCell(v, b.fmt)}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trace — hint + cell drill-down panel
// ---------------------------------------------------------------------------

function TraceHint() {
  return (
    <div style={{
      background: "var(--paper)", border: "1px dashed var(--rule-strong)",
      padding: "10px 14px",
      display: "flex", alignItems: "baseline", gap: 10,
      fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5,
    }}>
      <span className="mono" style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
        color: "var(--ink-2)", textTransform: "uppercase",
      }}>Trace</span>
      <span>Click any non-empty cell to see its basis, formula, share, and how every other node contributes to the same basis.</span>
    </div>
  );
}

function CellTrace({
  rows, basisKey, rowCode, onClose,
}: {
  rows: EffectiveRow[];
  basisKey: AllocationBasisKey;
  rowCode: string;
  onClose: () => void;
}) {
  const basis = ALLOCATION_BASES.find((b) => b.key === basisKey);
  const row = rows.find((r) => r.code === rowCode);
  if (!basis || !row) return null;

  const raw = row.values[basisKey] ?? 0;
  const total = colTotal(basisKey, rows);
  const share = total > 0 ? (raw / total) * 100 : 0;

  const valueWithUnit = `${formatCell(raw, basis.fmt)} ${basis.unit}`;
  const totalWithUnit = `${formatCell(total, basis.fmt)} ${basis.unit}`;

  return (
    <TracePanel
      eyebrow="Allocation basis trace"
      from={row.name}
      to={`${basis.label} basis`}
      onClose={onClose}
    >
      <TraceSection>
        <SummaryStrip cols={4}>
          <TraceStat
            label="Basis"
            value={basis.longName}
            sub={<span className="mono" style={{ letterSpacing: "0.1em" }}>{basis.label}</span>}
          />
          <TraceStat
            label="Node"
            value={row.name}
            sub={row.group === "indirect" ? "Indirect cost center" : "Direct receiver"}
          />
          <TraceStat
            label="Node units"
            value={valueWithUnit}
            sub={`of ${totalWithUnit} total`}
          />
          <TraceStat
            label="Allocation share"
            value={`${share.toFixed(1)}%`}
            emphasis
          />
        </SummaryStrip>
      </TraceSection>

      <TraceSection title="How this share is calculated">
        <BigFormula>
          {formatCell(raw, basis.fmt)} {basis.unit}
          {"  ÷  "}
          {formatCell(total, basis.fmt)} {basis.unit}
          {"  =  "}
          <span style={{ color: "var(--accent)" }}>{share.toFixed(1)}%</span>
        </BigFormula>
        <div style={{
          marginTop: 12, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.55,
        }}>
          {row.name} contributes {formatCell(raw, basis.fmt)} of the{" "}
          {formatCell(total, basis.fmt)} {basis.unitLong.toLowerCase()} that make
          up the <strong>{basis.longName}</strong> basis — a{" "}
          <strong>{share.toFixed(1)}%</strong> share of the citywide denominator.
        </div>
      </TraceSection>

      <CollapsibleMetadata title="Basis metadata">
        <MetadataRow label="Basis code">{basis.label}</MetadataRow>
        <MetadataRow label="Long name">{basis.longName}</MetadataRow>
        <MetadataRow label="Unit">{basis.unitLong} ({basis.unit})</MetadataRow>
        <MetadataRow label="Source">{basis.note}</MetadataRow>
        {row.glCode && <MetadataRow label="glCode">{row.glCode}</MetadataRow>}
        <MetadataRow label="Node group">{row.group === "indirect" ? "Indirect cost center" : "Direct receiver"}</MetadataRow>
      </CollapsibleMetadata>
    </TracePanel>
  );
}
