
import { useMemo, useState, type CSSProperties } from "react";
import { SectionLabel } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { GlNode } from "@/lib/data/capStepDownEngine";
import type { AllocationBasis, BasisKey, BasisUnitRow } from "@/lib/types";
import { useBuildState } from "@/lib/store";
import { allocationBasesUsedByPools } from "@/lib/data/capBasisRouting";
import {
  TracePanel, TraceSection, SummaryStrip, TraceStat,
  BigFormula,
} from "./TracePanel";

interface OpenCell {
  basisId: string;
  rowCode: string;
}

interface BasisColumn {
  id: string;
  driverKey: BasisKey;
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
  values: Record<string, number>;
  /** glCode caption next to the dept name (omitted for synth seed nodes). */
  glCode?: string;
}

const BASIS_LABELS: Record<string, string> = {
  "Modified Operating Expenses": "MOD OPEX",
  "Gross Expense Net of Distortions": "GROSS",
  "Net Operating Expenses": "NET OPEX",
  "Compensated Labor Hours (Approx. FTEE)": "LABOR HRS",
  "Personnel Count": "PERSONNEL",
  "Utility Accounts": "UTIL ACCT",
  "Capital Asset Value (Infrastructure)": "ASSET",
  "Public Works Modified Operating Expense": "PW OPEX",
  "Public Works Personnel Count": "PW PERS",
  "Revenues Receipted": "REVENUE",
  "Services & Supplies Expense": "S&S",
};

// Imported basis names are often long, boilerplate-prefixed schedule
// titles (e.g. "FY 24/25 Budgeted Expenditures per Fund, Department,
// and/or Division"). Taking the literal first two words there yields an
// uninformative "FY 24/2" column header — strip the fiscal-year/connector
// filler first so the abbreviation is built from the name's actual subject
// (e.g. "BUDGT EXPND").
const BASIS_LABEL_STOPWORDS = new Set(["fy", "per", "and/or", "the", "a", "an", "for", "of", "to"]);

function basisLabel(name: string): string {
  if (BASIS_LABELS[name]) return BASIS_LABELS[name];
  const allWords = name
    .replace(/\([^)]*\)/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const meaningfulWords = allWords.filter((word) =>
    !BASIS_LABEL_STOPWORDS.has(word.toLowerCase()) && !/^\d{1,4}([/-]\d{1,4})*$/.test(word));
  const words = meaningfulWords.length > 0 ? meaningfulWords : allWords;
  return words
    .slice(0, 2)
    .map((word) => word.slice(0, 5).toUpperCase())
    .join(" ");
}

function basisUnit(basis: AllocationBasis): Pick<BasisColumn, "unit" | "unitLong" | "fmt"> {
  const name = basis.name.toLowerCase();
  if (name.includes("expense") || name.includes("asset") || name.includes("revenue")) {
    return { unit: "$", unitLong: "Dollars", fmt: "int" };
  }
  if (name.includes("labor hour")) {
    return { unit: "hrs", unitLong: "Hours", fmt: "int" };
  }
  if (name.includes("personnel") || name.includes("ftee") || basis.driverKey === "FTE") {
    return { unit: "FTE", unitLong: "Full-time equivalent employees", fmt: "decimal" };
  }
  if (name.includes("account")) {
    return { unit: "acct", unitLong: "Accounts", fmt: "int" };
  }
  if (basis.driverKey === "DIRECT") {
    return { unit: "%", unitLong: "Percent", fmt: "decimal" };
  }
  return { unit: "units", unitLong: "Allocation units", fmt: "decimal" };
}

function buildColumns(
  allocationBases: AllocationBasis[],
): BasisColumn[] {
  return allocationBases
    .map((b) => ({
      id: b.id,
      driverKey: b.driverKey,
      label: basisLabel(b.name),
      longName: b.name,
      note: b.methodologyNote ?? b.source,
      ...basisUnit(b),
    }));
}

/** Build display rows from the engine's nodes + basis-unit schedules. One row
 *  per node; values are keyed by the actual allocation basis id. */
function buildRowsFromNodes(
  nodes: GlNode[],
  basisUnits: BasisUnitRow[],
  columns: BasisColumn[],
): EffectiveRow[] {
  const columnIds = new Set(columns.map((b) => b.id));
  const valuesByGlCode = new Map<string, Record<string, number>>();
  for (const bu of basisUnits) {
    if (!columnIds.has(bu.basisId)) continue;
    for (const receiver of bu.receivers) {
      const values = valuesByGlCode.get(receiver.glCode) ?? {};
      values[bu.basisId] = (values[bu.basisId] ?? 0) + receiver.units;
      valuesByGlCode.set(receiver.glCode, values);
    }
  }
  return nodes.map((n) => {
    return {
      code: n.key,
      name: n.name,
      group: n.role,
      values: valuesByGlCode.get(n.glCode) ?? valuesByGlCode.get(n.key) ?? {},
      glCode: n.glCode.startsWith("seed:") ? undefined : n.glCode,
    };
  });
}

/** Step 3 of the CAP flow. The node × basis denominator matrix — one row
 *  per engine node (cost center or direct fee-dept receiver). */
export function AllocationBases() {
  const { allocationBases, capBasisUnits, capPools, derived } = useBuildState();
  const usedAllocationBases = useMemo(
    () => allocationBasesUsedByPools(capPools, allocationBases),
    [capPools, allocationBases],
  );
  const columns = useMemo(
    () => buildColumns(usedAllocationBases),
    [usedAllocationBases],
  );
  const rows = useMemo(
    () => buildRowsFromNodes(derived.capStepDown.nodes, capBasisUnits, columns),
    [derived.capStepDown.nodes, capBasisUnits, columns],
  );
  const [openCell, setOpenCell] = useState<OpenCell | null>(null);
  if (rows.length === 0) {
    return (
      <div style={{
        background: "var(--paper)", border: "1px solid var(--rule)",
        padding: 22, fontSize: "var(--fs-ui)", color: "var(--ink-3)",
      }}>
        No allocation basis data imported. Import a basis schedule or
        direct-allocation receivers to see the basis matrix.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Matrix columns={columns} rows={rows} openCell={openCell} setOpenCell={setOpenCell}/>
      {openCell ? (
        <CellTrace
          columns={columns}
          rows={rows}
          basisId={openCell.basisId}
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

function colTotal(key: string, rows: EffectiveRow[]): number {
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

  const GLCODE_W = 90;
  const NAME_W = 220;
  const COL_W = 104;
  const tableWidth = GLCODE_W + NAME_W + columns.length * COL_W;

  const cellPad = "9px 12px";
  const stickyEllipsis = {
    overflow: "hidden" as const,
    whiteSpace: "nowrap" as const,
    textOverflow: "ellipsis" as const,
    boxSizing: "border-box" as const,
  };
  // Two sticky-left columns: glCode pinned at left:0, name pinned at
  // left:GLCODE_W. Shadow only on the rightmost sticky cell so the
  // border between sticky columns stays clean.
  const stickyGlBody = {
    ...stickyEllipsis,
    position: "sticky" as const, left: 0, zIndex: 2,
    background: "var(--paper)",
    padding: cellPad,
    textAlign: "left" as const,
  };
  const stickyNameBody = {
    ...stickyEllipsis,
    position: "sticky" as const, left: GLCODE_W, zIndex: 2,
    background: "var(--paper)",
    padding: cellPad,
    boxShadow: "1px 0 0 var(--rule)",
    textAlign: "left" as const,
  };
  const stickyGlBand = {
    ...stickyEllipsis,
    position: "sticky" as const, left: 0, zIndex: 4,
    background: "var(--paper-2)",
    padding: cellPad,
    textAlign: "left" as const,
  };
  const stickyNameBand = {
    ...stickyEllipsis,
    position: "sticky" as const, left: GLCODE_W, zIndex: 4,
    background: "var(--paper-2)",
    padding: cellPad,
    boxShadow: "1px 0 0 var(--rule)",
    textAlign: "left" as const,
  };

  const groupRow = (label: string, withTopBorder: boolean) => (
    <tr>
      <td colSpan={2 + columns.length} style={{
        padding: 0,
        background: "var(--paper-2)",
        borderTop: withTopBorder ? "1px solid var(--rule)" : undefined,
        borderBottom: "1px solid var(--rule)",
      }}>
        <div style={{
          position: "sticky", left: 0, zIndex: 3,
          display: "inline-block",
          padding: "8px 16px",
          fontFamily: "var(--ff-mono)", fontSize: "var(--t-l9)", fontWeight: 700,
          letterSpacing: "0.12em", color: "var(--ink-3)", textTransform: "uppercase",
        }}>{label}</div>
      </td>
    </tr>
  );

  return (
    <div>
      <SectionLabel right={`${rows.length} nodes · ${columns.length} bases`}>
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
            <col style={{ width: GLCODE_W }}/>
            <col style={{ width: NAME_W }}/>
            {columns.map((b) => <col key={b.id} style={{ width: COL_W }}/>)}
          </colgroup>
          <thead>
            <tr>
              <th style={{
                ...stickyGlBand,
                borderBottom: "1px solid var(--rule-strong)",
                fontFamily: "var(--ff-mono)", fontSize: "var(--t-l4)", fontWeight: 600,
                letterSpacing: "0.08em", color: "var(--ink-3)", textTransform: "uppercase",
              }}>Code</th>
              <th style={{
                ...stickyNameBand,
                borderBottom: "1px solid var(--rule-strong)",
                fontFamily: "var(--ff-mono)", fontSize: "var(--t-l4)", fontWeight: 600,
                letterSpacing: "0.08em", color: "var(--ink-3)", textTransform: "uppercase",
              }}>Cost Center</th>
              {columns.map((b) => (
                <th key={b.id} title={b.note ? `${b.longName}\n${b.note}` : b.longName} style={{
                  padding: cellPad,
                  background: "var(--paper-2)",
                  borderBottom: "1px solid var(--rule-strong)",
                  textAlign: "right",
                  fontFamily: "var(--ff-mono)", fontSize: "var(--t-l4)", fontWeight: 600,
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
                stickyGlBody={stickyGlBody} stickyNameBody={stickyNameBody}/>
            ))}

            {groupRow("Direct receivers", true)}
            {direct.map((r) => (
              <MatrixRow key={r.code} row={r} columns={columns}
                openCell={openCell} setOpenCell={setOpenCell}
                stickyGlBody={stickyGlBody} stickyNameBody={stickyNameBody}/>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={{
                ...stickyGlBand,
                borderTop: "2px solid var(--ink)",
              }}/>
              <td className="mono" style={{
                ...stickyNameBand,
                borderTop: "2px solid var(--ink)",
                fontSize: "var(--t-l4)", fontWeight: 600, letterSpacing: "0.1em",
                textTransform: "uppercase", color: "var(--ink-2)",
              }}>Total</td>
              {columns.map((b) => {
                const t = colTotal(b.id, rows);
                return (
                  <td key={b.id} className="num" style={{
                    padding: cellPad,
                    background: "var(--paper-2)",
                    borderTop: "2px solid var(--ink)",
                    textAlign: "right", fontSize: "var(--t-l7)", fontWeight: 600,
                    fontFamily: "var(--ff-mono)",
                  }}>{formatCell(t, b.fmt)}</td>
                );
              })}
            </tr>
            <tr>
              <td style={{
                ...stickyGlBand,
                borderTop: "1px solid var(--rule)",
              }}/>
              <td style={{
                ...stickyNameBand,
                borderTop: "1px solid var(--rule)",
                fontFamily: "var(--ff-mono)", fontSize: "var(--t-l9)",
                letterSpacing: "0.1em", color: "var(--ink-3)",
                textTransform: "uppercase",
              }}>Unit</td>
              {columns.map((b) => (
                <td key={b.id} style={{
                  padding: cellPad,
                  background: "var(--paper-2)",
                  borderTop: "1px solid var(--rule)",
                  textAlign: "right",
                  fontFamily: "var(--ff-mono)", fontSize: "var(--t-l9)", color: "var(--ink-3)",
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
  row, columns, openCell, setOpenCell, stickyGlBody, stickyNameBody,
}: {
  row: EffectiveRow; columns: BasisColumn[];
  openCell: OpenCell | null;
  setOpenCell: (c: OpenCell | null) => void;
  stickyGlBody: CSSProperties;
  stickyNameBody: CSSProperties;
}) {
  const caption = row.glCode ?? "";
  return (
    <tr className="tbl-row-hover">
      <td className="mono" style={{
        ...stickyGlBody,
        borderBottom: "1px solid var(--rule)",
        fontSize: "var(--t-l4)", color: caption ? "var(--ink-3)" : "var(--ink-4)",
        letterSpacing: "0.02em", fontWeight: 400,
      }}>{caption || ""}</td>
      <td style={{
        ...stickyNameBody,
        borderBottom: "1px solid var(--rule)",
        fontFamily: "var(--ff-ui)", fontSize: "var(--fs-ui)", color: "var(--ink)",
        fontWeight: 500,
      }}>{row.name}</td>
      {columns.map((b) => {
        const v = row.values[b.id];
        const empty = v == null || v === 0;
        const isOpen = openCell?.basisId === b.id && openCell?.rowCode === row.code;
        return (
          <td key={b.id} style={{
            padding: 0,
            borderBottom: "1px solid var(--rule)",
            background: isOpen ? "var(--accent-tint)" : "transparent",
            textAlign: "right",
          }}>
            <button
              type="button"
              onClick={() => !empty && setOpenCell(isOpen ? null : { basisId: b.id, rowCode: row.code })}
              title={empty ? "—" : `${formatCell(v, b.fmt)} ${b.unit} — click for trace`}
              style={{
                display: "block", width: "100%",
                textAlign: "right", padding: "7px 10px",
                fontSize: "var(--t-l7)",
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
      display: "flex", alignItems: "center", gap: 12,
      padding: "12px 16px",
      background: "var(--paper-2)", border: "1px solid var(--rule)",
      fontSize: 12, color: "var(--ink-3)",
    }}>
      <span className="mono" style={{
        fontSize: "var(--t-l9)", fontWeight: 700, letterSpacing: "0.12em",
        color: "var(--ink-2)", textTransform: "uppercase",
      }}>Trace</span>
      <span>Click any non-empty cell to see how it's calculated.</span>
    </div>
  );
}

function CellTrace({
  columns, rows, basisId, rowCode, onClose,
}: {
  columns: BasisColumn[];
  rows: EffectiveRow[];
  basisId: string;
  rowCode: string;
  onClose: () => void;
}) {
  const basis = columns.find((b) => b.id === basisId);
  const row = rows.find((r) => r.code === rowCode);
  if (!basis || !row) return null;

  const raw = row.values[basisId] ?? 0;
  const total = colTotal(basisId, rows);
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
      </TraceSection>

    </TracePanel>
  );
}
