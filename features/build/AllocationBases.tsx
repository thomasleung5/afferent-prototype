
import { useState } from "react";
import { Icon, SectionLabel } from "@/components/ui";
import { fmt } from "@/lib/format";
import {
  ALLOCATION_BASES, ALLOCATION_BASIS_ROWS,
  type AllocationBasisKey, type BasisRow,
} from "@/lib/data/allocationBases";

interface OpenCell {
  basisKey: AllocationBasisKey;
  rowCode: string;
}

/** Step 3 of the CAP flow. The department × basis denominator matrix — the
 *  table the city's CAP workbook is actually built around. */
export function AllocationBases() {
  const [openCell, setOpenCell] = useState<OpenCell | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Matrix openCell={openCell} setOpenCell={setOpenCell}/>
      {openCell ? (
        <CellTrace
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
  if (fmtKind === "k")        return fmt.dollarsK(value * 1000);
  if (fmtKind === "decimal")  return value.toFixed(2);
  return fmt.int(value);
}

function colTotal(key: AllocationBasisKey, rows: BasisRow[]): number {
  return rows.reduce((a, r) => a + (r.values[key] ?? 0), 0);
}

function Matrix({
  openCell, setOpenCell,
}: {
  openCell: OpenCell | null;
  setOpenCell: (c: OpenCell | null) => void;
}) {
  const indirect = ALLOCATION_BASIS_ROWS.filter((r) => r.group === "indirect");
  const direct   = ALLOCATION_BASIS_ROWS.filter((r) => r.group === "direct");

  const labelCol = "minmax(220px, 1.8fr)";
  const grid = `40px ${labelCol} ${ALLOCATION_BASES.map(() => "minmax(76px, 1fr)").join(" ")}`;

  return (
    <div>
      <SectionLabel right={`${ALLOCATION_BASIS_ROWS.length} departments · ${ALLOCATION_BASES.length} bases`}>
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
            <div>Department</div>
            {ALLOCATION_BASES.map((b) => (
              <div key={b.key} title={b.note} style={{ textAlign: "right" }}>{b.label}</div>
            ))}
          </div>

          {/* Indirect section label */}
          <GroupLabel cols={2 + ALLOCATION_BASES.length}>Indirect cost centers</GroupLabel>
          {indirect.map((r, i) => (
            <MatrixRow key={r.code} idx={i + 1} row={r} grid={grid}
              openCell={openCell} setOpenCell={setOpenCell}/>
          ))}

          {/* Direct section label */}
          <GroupLabel cols={2 + ALLOCATION_BASES.length}>Direct departments</GroupLabel>
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
            }}>Citywide total</div>
            {ALLOCATION_BASES.map((b) => {
              const t = colTotal(b.key, ALLOCATION_BASIS_ROWS);
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
  idx: number; row: BasisRow; grid: string;
  openCell: OpenCell | null;
  setOpenCell: (c: OpenCell | null) => void;
}) {
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
          {row.code}
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
      <span>Click any non-empty cell to see its basis, raw denominator, citywide total, and allocation share.</span>
    </div>
  );
}

function CellTrace({
  basisKey, rowCode, onClose,
}: {
  basisKey: AllocationBasisKey;
  rowCode: string;
  onClose: () => void;
}) {
  const basis = ALLOCATION_BASES.find((b) => b.key === basisKey);
  const row = ALLOCATION_BASIS_ROWS.find((r) => r.code === rowCode);
  if (!basis || !row) return null;

  const raw = row.values[basisKey] ?? 0;
  const total = colTotal(basisKey, ALLOCATION_BASIS_ROWS);
  const share = total > 0 ? (raw / total) * 100 : 0;

  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--accent)" }}>
      <div style={{
        display: "flex", alignItems: "center",
        padding: "12px 16px", borderBottom: "1px solid var(--rule)",
        background: "var(--accent-tint)",
      }}>
        <div className="mono" style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
          color: "var(--accent)", textTransform: "uppercase",
        }}>{basis.label} basis</div>
        <div style={{ marginLeft: 12, fontSize: 13, fontWeight: 600 }}>
          {row.name}
        </div>
        <button onClick={onClose} style={{
          marginLeft: "auto", color: "var(--ink-3)",
          background: "transparent", border: "none", cursor: "pointer",
        }} aria-label="Close trace">
          <Icon name="close" size={13}/>
        </button>
      </div>

      <div style={{
        padding: "14px 16px",
        display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 24px",
        fontSize: 12, maxWidth: 520,
      }}>
        <div style={{ color: "var(--ink-3)" }}>{row.name}</div>
        <div className="num">
          {formatCell(raw, basis.fmt)} <span style={{ color: "var(--ink-3)" }}>{basis.unit}</span>
        </div>

        <div style={{ color: "var(--ink-3)" }}>Citywide total</div>
        <div className="num">
          {formatCell(total, basis.fmt)} <span style={{ color: "var(--ink-3)" }}>{basis.unit}</span>
        </div>

        <div style={{ color: "var(--ink-3)", paddingTop: 4, borderTop: "1px solid var(--rule)" }}>
          Allocation share
        </div>
        <div className="num" style={{
          paddingTop: 4, borderTop: "1px solid var(--rule)", fontWeight: 600,
        }}>{share.toFixed(1)}%</div>
      </div>
    </div>
  );
}

