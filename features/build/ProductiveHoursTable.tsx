import { useMemo, useState } from "react";
import {
  DataTable, deriveDeptFilter, applyFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import {
  CellInput, CellSelect, DrilldownColumn, DrilldownShell,
  MiniTable, MonoLabel, SectionLabel, SourcePill,
  type MiniTableColumn,
} from "@/components/ui";
import type { DeptCode, ProductiveHoursBreakdown, ProductiveHoursRow } from "@/lib/types";
import { FEE_DEPTS } from "@/lib/data/departments";
import { useBuildState } from "@/lib/store";
import { fmt } from "@/lib/format";
import {
  calculateProductiveHours,
  type ProductiveHoursDeductionKey,
} from "@/lib/productiveHours";

const DEPT_OPTIONS: string[] = [...FEE_DEPTS];

/** Productive-hours modeling table. Sits below the Labor Line Items
 *  section on Labor. Reads/writes the productiveHours slice — one row
 *  per role, carrying FTE × hrs-per-FTE inputs that feed the FBHR
 *  denominator. Salary/benefits live as labor operating lines in the
 *  row above; this table is hours-only. */
export function ProductiveHoursTable() {
  const {
    productiveHours, updateProductiveHours, addProductiveHours,
  } = useBuildState();
  const [dept, setDept] = useState("ALL");
  const [openId, setOpenId] = useState<string | undefined>();

  const all = useMemo(() => [...productiveHours], [productiveHours]);

  const rows = useMemo(() => applyFilter(all, "dept", dept), [all, dept]);

  const filters: FilterGroup[] = [
    {
      id: "dept", label: "Dept",
      options: deriveDeptFilter(all),
      value: dept, onChange: setDept,
    },
  ];

  /** Apply a deduction edit: writes the new breakdown AND syncs the
   *  row's `hours` to (gross − Σ deductions). */
  const updateDeduction = (
    row: ProductiveHoursRow, key: ProductiveHoursDeductionKey, value: number,
  ) => {
    const cur: ProductiveHoursBreakdown = row.productiveHoursBreakdown ?? {};
    const nextBreakdown: ProductiveHoursBreakdown = {
      ...cur,
      [key]: Math.max(0, value),
    };
    const nextResult = calculateProductiveHours({ productiveHoursBreakdown: nextBreakdown });
    updateProductiveHours(row.id, {
      productiveHoursBreakdown: nextBreakdown,
      hours: nextResult.netProductiveHours,
    });
  };

  const cols: Column<ProductiveHoursRow>[] = [
    {
      key: "title",
      label: "Role",
      width: "minmax(220px, 1.6fr)",
      sortable: true,
      render: (r) => (
        <CellInput
          value={r.title}
          onChange={(v) => updateProductiveHours(r.id, { title: String(v) })}
        />
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
          onChange={(v) => updateProductiveHours(r.id, { dept: v as DeptCode })}
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
          onChange={(v) => updateProductiveHours(r.id, { fte: Number(v) || 0 })}
          align="right"
        />
      ),
    },
    {
      key: "hours",
      label: "Prod hrs/yr",
      width: "140px",
      align: "right",
      sortable: true,
      render: (r) => (
        <CellInput
          type="integer" value={r.hours} min={0}
          onChange={(v) => updateProductiveHours(r.id, { hours: Number(v) || 0 })}
          align="right"
        />
      ),
    },
    {
      key: "source",
      label: "Source",
      width: "140px",
      align: "right",
      sortable: true,
      sortKey: (r) => r.sourceFile ?? r.source,
      render: (r) => <SourcePill source={r.source} sourceFile={r.sourceFile}/>,
    },
  ];

  return (
    <div>
      <SectionLabel right={`${all.length} role${all.length === 1 ? "" : "s"}`}>
        Productive Hours
      </SectionLabel>
      <DataTable
        cols={cols}
        rows={rows}
        filters={filters}
        onAdd={addProductiveHours}
        addLabel="Add role"
        defaultSort={{ key: "title", dir: "asc" }}
        openId={openId}
        onRowClick={(r) => setOpenId(openId === r.id ? undefined : r.id)}
        drilldownIndicator
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
  row: ProductiveHoursRow;
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
        {(() => {
          const deductionCols: MiniTableColumn[] = [
            { key: "label", label: "Category", width: "1fr" },
            { key: "hours", label: "Hours",    width: "90px", align: "right" },
          ];
          return (
            <MiniTable
              columns={deductionCols}
              rows={result.deductions}
              rowKey={(d) => d.key}
              renderCell={(col, d) => {
                if (col.key === "label") {
                  return <span style={{ color: "var(--ink-2)" }}>{d.label}</span>;
                }
                return (
                  <CellInput
                    type="number" value={d.hours} step={4} min={0}
                    onChange={(v) => onChange(d.key, Number(v) || 0)}
                    align="right"
                    fontSize={12}
                  />
                );
              }}
              renderFooter={(col) => {
                if (col.key === "label") return <MonoLabel>Total nonproductive</MonoLabel>;
                return <span className="num">{fmt.int(result.totalNonproductiveHours)}</span>;
              }}
            />
          );
        })()}
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
