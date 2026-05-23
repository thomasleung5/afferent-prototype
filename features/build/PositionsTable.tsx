
import { useMemo, useState } from "react";
import {
  DataTable, deriveDeptFilter, applyFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import {
  CellInput, CellSelect, DrilldownColumn, DrilldownLabel, DrilldownShell,
  ExpandIndicator, SectionLabel, SourcePill,
} from "@/components/ui";
import type { DeptCode, Position, ProductiveHoursBreakdown } from "@/lib/types";
import { FEE_DEPTS } from "@/lib/data/departments";
import { useBuildState } from "@/lib/store";
import { fmt } from "@/lib/format";
import {
  calculateProductiveHours,
  type ProductiveHoursDeductionKey,
} from "@/lib/productiveHours";

const DEPT_OPTIONS: string[] = [...FEE_DEPTS];

interface Row extends Omit<Position, "flag"> {
  flag: boolean;
  warning?: Position["flag"];
  hourly: number;
}

export function PositionsTable() {
  const { positions, updatePosition, addPosition } = useBuildState();
  const [dept, setDept] = useState("ALL");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [openId, setOpenId] = useState<string | undefined>();

  const all: Row[] = useMemo(() => positions.map((p): Row => ({
    id: p.id,
    title: p.title,
    dept: p.dept,
    fte: p.fte,
    salary: p.salary,
    benefits: p.benefits,
    hours: p.hours,
    productiveHoursBreakdown: p.productiveHoursBreakdown,
    flag: !!p.flag,
    warning: p.flag,
    hourly: p.hours > 0 ? (p.salary + p.benefits) / p.hours : 0,
    source: p.source,
    sourceFile: p.sourceFile,
  })), [positions]);

  /** Apply a deduction edit to a row: writes the new breakdown AND syncs
   *  the row's `hours` field to (gross − Σ deductions) so the column and
   *  the drilldown stay aligned. */
  const updateDeduction = (
    row: Row, key: ProductiveHoursDeductionKey, value: number,
  ) => {
    const cur: ProductiveHoursBreakdown = row.productiveHoursBreakdown ?? {};
    const nextBreakdown: ProductiveHoursBreakdown = {
      ...cur,
      [key]: Math.max(0, value),
    };
    const nextResult = calculateProductiveHours({ productiveHoursBreakdown: nextBreakdown });
    updatePosition(row.id, {
      productiveHoursBreakdown: nextBreakdown,
      hours: nextResult.netProductiveHours,
    });
  };

  const flaggedCount = all.filter((r) => r.flag).length;
  const rows = useMemo(() => {
    const base = applyFilter(all, "dept", dept);
    return reviewOnly ? base.filter((r) => r.flag) : base;
  }, [all, dept, reviewOnly]);

  const filters: FilterGroup[] = [
    {
      id: "dept", label: "Dept",
      options: deriveDeptFilter(all),
      value: dept, onChange: setDept,
    },
    {
      id: "review", label: "View",
      options: [
        { value: "ALL",  label: "All",          count: all.length },
        { value: "FLAG", label: "Needs review", count: flaggedCount },
      ],
      value: reviewOnly ? "FLAG" : "ALL",
      onChange: (v) => setReviewOnly(v === "FLAG"),
    },
  ];

  const cols: Column<Row>[] = [
    {
      key: "title",
      label: "Position",
      width: "minmax(220px, 1.6fr)",
      sortable: true,
      render: (r) => (
        <div>
          <CellInput
            value={r.title}
            onChange={(v) => updatePosition(r.id, { title: String(v) })}
          />
          {r.warning && (
            <div style={{ fontSize: 11, color: "var(--warn)", paddingLeft: 6, marginTop: 2 }}>
              ⚠ {r.warning === "title-changed"
                ? "Title changed since prior study"
                : "Missing productive hours"}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "dept",
      label: "Dept",
      width: "80px",
      sortable: true,
      render: (r) => (
        <CellSelect
          value={r.dept}
          options={DEPT_OPTIONS}
          onChange={(v) => updatePosition(r.id, { dept: v as DeptCode })}
        />
      ),
    },
    {
      key: "fte",
      label: "FTE",
      width: "70px",
      align: "right",
      sortable: true,
      render: (r) => (
        <CellInput
          type="number" value={r.fte} step={0.05} min={0} max={2}
          onChange={(v) => updatePosition(r.id, { fte: Number(v) || 0 })}
          align="right"
        />
      ),
    },
    {
      key: "salary",
      label: "Salary",
      width: "120px",
      align: "right",
      sortable: true,
      render: (r) => (
        <CellInput
          type="currency" value={r.salary} min={0}
          onChange={(v) => updatePosition(r.id, { salary: Number(v) || 0 })}
          align="right" prefix="$"
        />
      ),
    },
    {
      key: "benefits",
      label: "Benefits",
      width: "120px",
      align: "right",
      sortable: true,
      render: (r) => (
        <CellInput
          type="currency" value={r.benefits} min={0}
          onChange={(v) => updatePosition(r.id, { benefits: Number(v) || 0 })}
          align="right" prefix="$"
        />
      ),
    },
    {
      key: "hours",
      label: "Prod hrs/yr",
      width: "140px",
      align: "right",
      sortable: true,
      render: (r) => {
        const isOpen = openId === r.id;
        return (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4,
          }}>
            <CellInput
              type="integer" value={r.hours} min={0}
              onChange={(v) => updatePosition(r.id, { hours: Number(v) || 0 })}
              align="right"
            />
            <button
              type="button"
              aria-label={isOpen ? "Hide productive-hours breakdown" : "Show productive-hours breakdown"}
              aria-expanded={isOpen}
              onClick={(e) => {
                e.stopPropagation();
                setOpenId(isOpen ? undefined : r.id);
              }}
              style={{
                cursor: "pointer", userSelect: "none",
                background: "transparent", border: "none", padding: "0 4px",
              }}
            >
              <ExpandIndicator open={isOpen}/>
            </button>
          </div>
        );
      },
    },
    {
      key: "hourly",
      label: "Direct $/hr",
      width: "120px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="num">
          {r.hours > 0 ? `$${Math.round(r.hourly)}` : "—"}
        </span>
      ),
    },
    {
      key: "source",
      label: "Source",
      width: "140px",
      align: "right",
      sortable: true,
      sortKey: (r: Row) => r.sourceFile ?? r.source,
      render: (r) => <SourcePill source={r.source} sourceFile={r.sourceFile}/>,
    },
  ];

  return (
    <div>
      <SectionLabel right={`${all.length} positions`}>
        Position roster
      </SectionLabel>
      <DataTable
        cols={cols}
        rows={rows}
        filters={filters}
        onAdd={addPosition}
        addLabel="Add position"
        defaultSort={{ key: "title", dir: "asc" }}
        stickySort={(a, b) => (a.flag ? 0 : 1) - (b.flag ? 0 : 1)}
        openId={openId}
        renderDrilldown={(r) => (
          <ProductiveHoursDrilldown
            row={r}
            onChange={(key, value) => updateDeduction(r, key, value)}
          />
        )}
      />
    </div>
  );
}

function ProductiveHoursDrilldown({
  row, onChange,
}: {
  row: Row;
  onChange: (key: ProductiveHoursDeductionKey, value: number) => void;
}) {
  const result = calculateProductiveHours(row);
  return (
    <DrilldownShell>
      <DrilldownColumn marker="①" title="Starting hours">
        <div style={{
          padding: "12px 14px",
          background: "var(--paper)", border: "1px solid var(--rule)",
          fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--ink-3)" }}>gross annual hours</span>
            <b>{fmt.int(result.grossAnnualHours)}</b>
          </div>
        </div>
      </DrilldownColumn>

      <DrilldownColumn marker="②" title="Nonproductive deductions">
        <div style={{ border: "1px solid var(--rule)", background: "var(--paper)" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 90px", gap: 10,
            padding: "6px 10px",
            background: "var(--paper-2)",
            borderBottom: "1px solid var(--rule)",
          }}>
            <DrilldownLabel>Category</DrilldownLabel>
            <DrilldownLabel align="right">Hours</DrilldownLabel>
          </div>
          {result.deductions.map((d, i) => (
            <div key={d.key} style={{
              display: "grid", gridTemplateColumns: "1fr 90px", gap: 10,
              alignItems: "center",
              padding: "5px 10px",
              borderBottom: i < result.deductions.length - 1 ? "1px solid var(--rule)" : "none",
              fontSize: 12,
            }}>
              <span style={{ color: "var(--ink-2)" }}>{d.label}</span>
              <CellInput
                type="number" value={d.hours} step={4} min={0}
                onChange={(v) => onChange(d.key, Number(v) || 0)}
                align="right"
              />
            </div>
          ))}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 90px", gap: 10,
            padding: "8px 10px",
            background: "var(--paper-2)",
            borderTop: "1px solid var(--rule)",
            fontSize: 12, fontFamily: "var(--ff-mono)",
          }}>
            <span style={{ color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10 }}>
              Total nonproductive
            </span>
            <b style={{ textAlign: "right" }}>{fmt.int(result.totalNonproductiveHours)}</b>
          </div>
        </div>
      </DrilldownColumn>

      <DrilldownColumn marker="③" title="Net productive hours">
        <div style={{
          padding: "12px 14px",
          background: "var(--paper)", border: "1px solid var(--rule)",
          fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--ink-3)" }}>gross</span>
            <b>{fmt.int(result.grossAnnualHours)}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--ink-3)" }}>− nonproductive</span>
            <b>{fmt.int(result.totalNonproductiveHours)}</b>
          </div>
          <div style={{
            borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6,
            display: "flex", justifyContent: "space-between",
          }}>
            <span>net productive hrs</span>
            <b style={{ color: "var(--accent)" }}>{fmt.int(result.netProductiveHours)}</b>
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between",
            color: "var(--ink-3)",
          }}>
            <span>productive %</span>
            <b>{result.productivePercent.toFixed(1)}%</b>
          </div>
        </div>
      </DrilldownColumn>
    </DrilldownShell>
  );
}
