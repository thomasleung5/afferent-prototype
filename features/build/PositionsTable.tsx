
import { useMemo, useState } from "react";
import {
  DataTable, deriveDeptFilter, applyFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import { CellInput, CellSelect, SectionLabel, SourcePill } from "@/components/ui";
import type { DeptCode, Position } from "@/lib/types";
import { FEE_DEPTS } from "@/lib/data/departments";
import { useBuildState } from "@/lib/store";

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

  const all: Row[] = useMemo(() => positions.map((p): Row => ({
    id: p.id,
    title: p.title,
    dept: p.dept,
    fte: p.fte,
    salary: p.salary,
    benefits: p.benefits,
    hours: p.hours,
    flag: !!p.flag,
    warning: p.flag,
    hourly: p.hours > 0 ? (p.salary + p.benefits) / p.hours : 0,
    source: p.source,
    sourceFile: p.sourceFile,
  })), [positions]);

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
      width: "110px",
      align: "right",
      sortable: true,
      render: (r) => (
        <CellInput
          type="number" value={r.hours} step={20} min={0}
          onChange={(v) => updatePosition(r.id, { hours: Number(v) || 0 })}
          align="right"
        />
      ),
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
      />
    </div>
  );
}
