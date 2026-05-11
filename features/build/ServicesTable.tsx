
import { useMemo, useState } from "react";
import {
  DataTable, deriveDeptFilter, applyFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import { CellInput, CellSelect, DeptChip } from "@/components/ui";
import type { DeptCode, Service } from "@/lib/types";
import { useBuildState } from "./BuildContext";

const SERVICE_TYPES = ["Permit", "Application", "Inspection", "Review", "Meeting", "Other"];
const DEPT_OPTIONS = ["PLAN", "BLDG", "ENG"];

const TYPE_FOR = (id: string): string => {
  if (/-pc$|-apr$|-fpc$|-pchk/.test(id)) return "Plan check";
  if (/-insp|-erosion|-ai\b/.test(id)) return "Inspection";
  if (/-sfr$|-rem$|-pool$|-solar$|-mep$|-tco$|-ext$/.test(id)) return "Permit";
  if (/-ency|-encl|-grade|-storm/.test(id)) return "Permit";
  if (/-preap|-adu/.test(id)) return "Meeting";
  if (/-fence|-oak|-mod|-wlss|-mvar/.test(id)) return "Permit";
  if (id.startsWith("plan-")) return "Application";
  if (id.startsWith("bldg-")) return "Permit";
  if (id.startsWith("eng-")) return "Review";
  return "Other";
};

interface Row extends Service {
  flag?: boolean;
}

export function ServicesTable() {
  const { services, updateService } = useBuildState();
  const [dept, setDept] = useState("ALL");
  const [reviewOnly, setReviewOnly] = useState(false);

  const allRows: Row[] = useMemo(() => services.map((s) => ({
    ...s,
    flag: !s.hours || !s.volume,
  })), [services]);

  const rows = useMemo(() => {
    const filtered = applyFilter(allRows, "dept", dept);
    return reviewOnly ? filtered.filter((r) => r.flag) : filtered;
  }, [allRows, dept, reviewOnly]);

  const flaggedCount = allRows.filter((r) => r.flag).length;

  const filters: FilterGroup[] = [
    {
      id: "dept", label: "Dept",
      options: deriveDeptFilter(allRows),
      value: dept,
      onChange: setDept,
    },
    {
      id: "review", label: "View",
      options: [
        { value: "ALL",  label: "All",          count: allRows.length },
        { value: "FLAG", label: "Needs review", count: flaggedCount },
      ],
      value: reviewOnly ? "FLAG" : "ALL",
      onChange: (v) => setReviewOnly(v === "FLAG"),
    },
  ];

  const cols: Column<Row>[] = [
    {
      key: "name",
      label: "Service",
      width: "minmax(280px, 2fr)",
      sortable: true,
      render: (r) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <CellInput
            value={r.name}
            onChange={(v) => updateService(r.id, { name: String(v) })}
          />
          <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.04em", paddingLeft: 6 }}>
            {r.id}
          </span>
        </div>
      ),
    },
    {
      key: "dept",
      label: "Dept",
      width: "90px",
      sortable: true,
      render: (r) => (
        <CellSelect
          value={r.dept}
          options={DEPT_OPTIONS}
          onChange={(v) => updateService(r.id, { dept: v as DeptCode })}
        />
      ),
    },
    {
      key: "type",
      label: "Type",
      width: "130px",
      sortable: true,
      sortKey: (r) => TYPE_FOR(r.id),
      render: (r) => (
        <CellSelect
          value={TYPE_FOR(r.id)}
          options={SERVICE_TYPES}
          onChange={() => { /* TODO when type lives on Service */ }}
        />
      ),
    },
    {
      key: "hours",
      label: "Hours / inst",
      width: "120px",
      align: "right",
      sortable: true,
      render: (r) => (
        <CellInput
          type="number"
          value={r.hours}
          onChange={(v) => updateService(r.id, { hours: Number(v) || 0 })}
          step={0.5}
          align="right"
          suffix="h"
        />
      ),
    },
  ];

  return (
    <DataTable
      title="Service catalog"
      eyebrow="Inputs · Hours per instance feeds Cost of Service"
      cols={cols}
      rows={rows}
      filters={filters}
      defaultSort={{ key: "name", dir: "asc" }}
      stickySort={(a, b) => (a.flag ? 0 : 1) - (b.flag ? 0 : 1)}
      footerNote={`${rows.length} services · edit inline`}
    />
  );
}
