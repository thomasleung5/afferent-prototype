
import { useMemo, useState, type CSSProperties } from "react";
import { SectionLabel } from "@/components/ui";
import { fmt } from "@/lib/format";
import { ALLOCATION_BASES } from "@/lib/data/allocationBases";
import type { GlNode, GlDriverMatrix } from "@/lib/data/capStepDownGl";
import type { BasisKey } from "@/lib/types";
import { useBuildState } from "@/lib/store";
import {
  TracePanel, TraceSection, SummaryStrip, TraceStat,
  BigFormula, CollapsibleMetadata, MetadataRow,
} from "./TracePanel";

interface OpenCell {
  basisKey: BasisKey;
  rowCode: string;
}

interface BasisColumn {
  key: BasisKey;
  label: string;
  longName: string;
  unit: string;
  unitLong: string;
  fmt: string;
  note: string;
}

/** Renderable row — one per engine node (indirect cost center or direct
 *  fee-dept receiver). */
interface EffectiveRow {
  code: string;
  name: string;
  group: "indirect" | "direct";
  values: Partial<Record<BasisKey, number>>;
  /** glCode caption next to the dept name (omitted for synth seed nodes). */
  glCode?: string;
}

const SEED_COLUMNS = ALLOCATION_BASES.map((b) => ({ ...b, key: b.key as BasisKey }));

const DRIVER_COLUMN_FALLBACKS: Partial<Record<BasisKey, Omit<BasisColumn, "key">>> = {
  RECORDS: {
    label: "RECORDS",
    longName: "Records / Document Volume",
    unit: "records",
    unitLong: "Records or documents",
    fmt: "int",
    note: "Imported CAP document records or Laserfiche volume schedule",
  },
  EQUAL: {
    label: "EQUAL",
    longName: "Equal Allocation",
    unit: "units",
    unitLong: "Equal-weight units",
    fmt: "decimal",
    note: "Imported CAP equal-allocation schedule",
  },
  MEETING_HOURS: {
    label: "MTG HRS",
    longName: "Meeting Hours Supported",
    unit: "hrs",
    unitLong: "Meeting hours supported",
    fmt: "decimal",
    note: "Imported CAP meeting-hour schedule",
  },
  MEETINGS: {
    label: "MEETINGS",
    longName: "Meetings Supported",
    unit: "mtgs",
    unitLong: "Meetings supported",
    fmt: "int",
    note: "Imported CAP meeting-count schedule",
  },
  APPLICATIONS: {
    label: "APPS",
    longName: "Applications / Permits",
    unit: "count",
    unitLong: "Applications, permits, or cases",
    fmt: "int",
    note: "Imported CAP application-volume schedule",
  },
  RECRUITMENTS: {
    label: "RECRUIT",
    longName: "Recruitments",
    unit: "count",
    unitLong: "Recruitment counts",
    fmt: "int",
    note: "Imported CAP recruitment-count schedule",
  },
  CLAIMS: {
    label: "CLAIMS",
    longName: "Claim History",
    unit: "claims",
    unitLong: "Claims or claim-history units",
    fmt: "int",
    note: "Imported CAP claims-history schedule",
  },
  RENTAL_HOURS: {
    label: "RENT HRS",
    longName: "Rental Hours",
    unit: "hrs",
    unitLong: "Rental or facility-use hours",
    fmt: "decimal",
    note: "Imported CAP rental-hour schedule",
  },
};

function fallbackColumn(key: BasisKey, basisNames: string[]): BasisColumn {
  const fallback = DRIVER_COLUMN_FALLBACKS[key];
  const longName = basisNames.length > 0 ? basisNames.join(" / ") : key;
  return {
    key,
    label: fallback?.label ?? key,
    longName: fallback?.longName ?? longName,
    unit: fallback?.unit ?? "units",
    unitLong: fallback?.unitLong ?? "Allocation units",
    fmt: fallback?.fmt ?? "decimal",
    note: fallback?.note ?? (basisNames.length > 0 ? `Imported basis: ${basisNames.join(", ")}` : "Imported CAP basis"),
  };
}

function buildColumns(
  allocationBases: { name: string; driverKey: BasisKey }[],
  drivers: GlDriverMatrix,
): BasisColumn[] {
  const seedByKey = new Map<BasisKey, BasisColumn>(
    SEED_COLUMNS.map((b) => [b.key, b]),
  );
  const basisNamesByKey = new Map<BasisKey, string[]>();
  const keys = new Set<BasisKey>();

  for (const b of allocationBases) {
    if (b.driverKey === "DIRECT") continue;
    keys.add(b.driverKey);
    const names = basisNamesByKey.get(b.driverKey) ?? [];
    if (!names.includes(b.name)) names.push(b.name);
    basisNamesByKey.set(b.driverKey, names);
  }
  for (const driverRow of Object.values(drivers)) {
    for (const key of Object.keys(driverRow) as BasisKey[]) {
      if (key !== "DIRECT") keys.add(key);
    }
  }

  const ordered = [
    ...SEED_COLUMNS.map((b) => b.key).filter((key) => keys.has(key)),
    ...[...keys].filter((key) => !seedByKey.has(key)).sort(),
  ];
  return ordered.map((key) =>
    seedByKey.get(key) ?? fallbackColumn(key, basisNamesByKey.get(key) ?? []),
  );
}

/** Build display rows from the engine's nodes + driver matrix. One row per
 *  node; values pulled from drivers[node.key]. */
function buildRowsFromNodes(
  nodes: GlNode[],
  drivers: GlDriverMatrix,
  columns: BasisColumn[],
): EffectiveRow[] {
  const columnKeys = new Set(columns.map((b) => b.key));
  return nodes.map((n) => {
    const values: Partial<Record<BasisKey, number>> = {};
    for (const [k, v] of Object.entries(drivers[n.key] ?? {})) {
      if (!columnKeys.has(k as BasisKey)) continue;
      if (typeof v === "number" && v !== 0) values[k as BasisKey] = v;
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
  const { allocationBases, derived } = useBuildState();
  const columns = useMemo(
    () => buildColumns(allocationBases, derived.capDrivers),
    [allocationBases, derived.capDrivers],
  );
  const rows = useMemo(
    () => buildRowsFromNodes(derived.capStepDown.nodes, derived.capDrivers, columns),
    [derived.capStepDown.nodes, derived.capDrivers, columns],
  );
  const [openCell, setOpenCell] = useState<OpenCell | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Matrix columns={columns} rows={rows} openCell={openCell} setOpenCell={setOpenCell}/>
      {openCell ? (
        <CellTrace
          columns={columns}
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

// ---------------------------------------------------------------------------
// Matrix (primary view)
// ---------------------------------------------------------------------------

function formatCell(value: number | undefined, fmtKind: string): string {
  if (value == null || value === 0) return "—";
  if (fmtKind === "k")        return fmt.dollarsK(value);
  if (fmtKind === "decimal")  return value.toFixed(2);
  return fmt.int(value);
}

function colTotal(key: BasisKey, rows: EffectiveRow[]): number {
  return rows.reduce((a, r) => a + (r.values[key] ?? 0), 0);
}

function Matrix({
  columns, rows, openCell, setOpenCell,
}: {
  columns: BasisColumn[];
  rows: EffectiveRow[];
  openCell: OpenCell | null;
  setOpenCell: (c: OpenCell | null) => void;
}) {
  const indirect = rows.filter((r) => r.group === "indirect");
  const direct   = rows.filter((r) => r.group === "direct");

  const NODE_W = 280;
  const COL_W = 88;
  const tableWidth = NODE_W + columns.length * COL_W;

  const cellPad = "9px 12px";
  const stickyEllipsis = {
    overflow: "hidden" as const,
    whiteSpace: "nowrap" as const,
    textOverflow: "ellipsis" as const,
    boxSizing: "border-box" as const,
  };
  const stickyLeftBody = {
    ...stickyEllipsis,
    position: "sticky" as const, left: 0, zIndex: 2,
    background: "var(--paper)",
    padding: cellPad,
    boxShadow: "1px 0 0 var(--rule)",
    textAlign: "left" as const,
  };
  const stickyLeftBand = {
    ...stickyEllipsis,
    position: "sticky" as const, left: 0, zIndex: 4,
    background: "var(--paper-2)",
    padding: cellPad,
    boxShadow: "1px 0 0 var(--rule)",
    textAlign: "left" as const,
  };

  const groupRow = (label: string, withTopBorder: boolean) => (
    <tr>
      <td colSpan={1 + columns.length} style={{
        padding: 0,
        background: "var(--paper-2)",
        borderTop: withTopBorder ? "1px solid var(--rule)" : undefined,
        borderBottom: "1px solid var(--rule)",
      }}>
        <div style={{
          position: "sticky", left: 0, zIndex: 3,
          display: "inline-block",
          padding: "8px 16px",
          fontFamily: "var(--ff-mono)", fontSize: 10, fontWeight: 700,
          letterSpacing: "0.12em", color: "var(--ink-3)", textTransform: "uppercase",
        }}>{label}</div>
      </td>
    </tr>
  );

  return (
    <div>
      <SectionLabel right={`${rows.length} nodes · ${columns.length} drivers`}>
        Allocation Bases
      </SectionLabel>
      <div style={{
        background: "var(--paper)", border: "1px solid var(--rule)",
        overflowX: "auto",
        position: "relative",
      }}>
        <table style={{
          borderCollapse: "separate",
          borderSpacing: 0,
          tableLayout: "fixed",
          width: tableWidth,
          fontVariantNumeric: "tabular-nums",
        }}>
          <colgroup>
            <col style={{ width: NODE_W }}/>
            {columns.map((b) => <col key={b.key} style={{ width: COL_W }}/>)}
          </colgroup>
          <thead>
            <tr>
              <th style={{
                ...stickyLeftBand,
                borderBottom: "1px solid var(--rule-strong)",
                fontFamily: "var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
                letterSpacing: "0.08em", color: "var(--ink-3)", textTransform: "uppercase",
              }}>Cost Center</th>
              {columns.map((b) => (
                <th key={b.key} title={b.note} style={{
                  padding: cellPad,
                  background: "var(--paper-2)",
                  borderBottom: "1px solid var(--rule-strong)",
                  textAlign: "right",
                  fontFamily: "var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
                  letterSpacing: "0.08em", color: "var(--ink-3)", textTransform: "uppercase",
                }}>{b.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupRow("Indirect cost centers", false)}
            {indirect.map((r) => (
              <MatrixRow key={r.code} row={r} columns={columns}
                openCell={openCell} setOpenCell={setOpenCell}
                stickyLeftBody={stickyLeftBody}/>
            ))}

            {groupRow("Direct receivers", true)}
            {direct.map((r) => (
              <MatrixRow key={r.code} row={r} columns={columns}
                openCell={openCell} setOpenCell={setOpenCell}
                stickyLeftBody={stickyLeftBody}/>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="mono" style={{
                ...stickyLeftBand,
                borderTop: "2px solid var(--ink)",
                fontSize: 10.5, fontWeight: 600, letterSpacing: "0.1em",
                textTransform: "uppercase", color: "var(--ink-2)",
              }}>Total</td>
              {columns.map((b) => {
                const t = colTotal(b.key, rows);
                return (
                  <td key={b.key} className="num" style={{
                    padding: cellPad,
                    background: "var(--paper-2)",
                    borderTop: "2px solid var(--ink)",
                    textAlign: "right", fontSize: 12.5, fontWeight: 600,
                    fontFamily: "var(--ff-mono)",
                  }}>{formatCell(t, b.fmt)}</td>
                );
              })}
            </tr>
            <tr>
              <td style={{
                ...stickyLeftBand,
                borderTop: "1px solid var(--rule)",
                fontFamily: "var(--ff-mono)", fontSize: 10,
                letterSpacing: "0.1em", color: "var(--ink-3)",
                textTransform: "uppercase",
              }}>Unit</td>
              {columns.map((b) => (
                <td key={b.key} style={{
                  padding: cellPad,
                  background: "var(--paper-2)",
                  borderTop: "1px solid var(--rule)",
                  textAlign: "right",
                  fontFamily: "var(--ff-mono)", fontSize: 10, color: "var(--ink-3)",
                }}>{b.unit}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function MatrixRow({
  row, columns, openCell, setOpenCell, stickyLeftBody,
}: {
  row: EffectiveRow; columns: BasisColumn[];
  openCell: OpenCell | null;
  setOpenCell: (c: OpenCell | null) => void;
  stickyLeftBody: CSSProperties;
}) {
  const caption = row.glCode ?? "";
  return (
    <tr className="tbl-row-hover">
      <td style={{
        ...stickyLeftBody,
        borderBottom: "1px solid var(--rule)",
        fontFamily: "var(--ff-ui)", fontSize: 13, color: "var(--ink)",
      }}>
        {caption && (
          <span className="mono" style={{
            fontSize: 10.5, color: "var(--ink-3)", marginRight: 6,
            letterSpacing: "0.02em", fontWeight: 400,
          }}>{caption}</span>
        )}
        <span style={{ fontWeight: 500 }}>{row.name}</span>
      </td>
      {columns.map((b) => {
        const v = row.values[b.key];
        const empty = v == null || v === 0;
        const isOpen = openCell?.basisKey === b.key && openCell?.rowCode === row.code;
        return (
          <td key={b.key} style={{
            padding: 0,
            borderBottom: "1px solid var(--rule)",
            background: isOpen ? "var(--accent-tint)" : "transparent",
            textAlign: "right",
          }}>
            <button
              type="button"
              onClick={() => !empty && setOpenCell(isOpen ? null : { basisKey: b.key, rowCode: row.code })}
              title={empty ? "—" : `${formatCell(v, b.fmt)} ${b.unit} — click for trace`}
              style={{
                display: "block", width: "100%",
                textAlign: "right", padding: "7px 10px",
                fontSize: 12.5,
                fontFamily: "var(--ff-mono)",
                fontVariantNumeric: "tabular-nums",
                color: empty ? "var(--ink-4)" : "var(--ink)",
                background: "transparent",
                border: isOpen ? "1px solid var(--accent)" : "1px solid transparent",
                cursor: empty ? "default" : "pointer",
              }}
            >
              {formatCell(v, b.fmt)}
            </button>
          </td>
        );
      })}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Trace — hint + cell drill-down panel
// ---------------------------------------------------------------------------

function TraceHint() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "12px 16px",
      background: "var(--paper-2)", border: "1px solid var(--rule)",
      fontSize: 12, color: "var(--ink-3)",
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
  columns, rows, basisKey, rowCode, onClose,
}: {
  columns: BasisColumn[];
  rows: EffectiveRow[];
  basisKey: BasisKey;
  rowCode: string;
  onClose: () => void;
}) {
  const basis = columns.find((b) => b.key === basisKey);
  const row = rows.find((r) => r.code === rowCode);
  if (!basis || !row) return null;

  const raw = row.values[basisKey] ?? 0;
  const total = colTotal(basisKey, rows);
  const share = total > 0 ? (raw / total) * 100 : 0;

  // Dollar-formatted values ($720K, $5.81M) already convey their unit;
  // appending the "$000" basis.unit would render "$720K $000". Suppress
  // the unit suffix for the "k" format and keep it for everything else
  // (FTE, txns/yr, sq ft, count, etc.) where it's still informative.
  const unitSuffix = basis.fmt === "k" ? "" : ` ${basis.unit}`;
  const valueWithUnit = `${formatCell(raw, basis.fmt)}${unitSuffix}`;
  const totalWithUnit = `${formatCell(total, basis.fmt)}${unitSuffix}`;

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
          {valueWithUnit}
          {"  ÷  "}
          {totalWithUnit}
          {"  =  "}
          <span style={{ color: "var(--accent)" }}>{share.toFixed(1)}%</span>
        </BigFormula>
        <div style={{
          marginTop: 12, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.55,
        }}>
          {row.name} contributes {formatCell(raw, basis.fmt)} of the{" "}
          {formatCell(total, basis.fmt)}
          {basis.fmt === "k" ? "" : ` ${basis.unitLong.toLowerCase()}`} that make
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
