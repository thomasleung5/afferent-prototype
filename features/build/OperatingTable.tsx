
import { useMemo, useState } from "react";
import {
  DataTable, deriveDeptFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import {
  CellInput, CellSelect, SectionLabel, SharedChip, SourcePill,
} from "@/components/ui";
import type { OpCategory, OpDept, OperatingLine } from "@/lib/types";
import { useBuildState } from "@/lib/store";

const CATEGORIES: OpCategory[] = [
  "Software & subscriptions",
  "Professional services",
  "Training & travel",
  "Office & supplies",
  "Memberships & dues",
  "Vehicles & equipment",
  "Legal noticing",
  "Capital outlay",
  "Other",
];

export function OperatingTable() {
  const { operating, updateOperating, addOperatingLine, derived } = useBuildState();
  const deptOptionsForEdit = [...derived.activeFeeDepts, "SHARED:CDS"];
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [includeFilter, setIncludeFilter] = useState("ALL");

  // This page is the non-labor view of the budget-classification table.
  // Labor-classified rows surface on the Labor page's Labor Line
  // Items section instead, so they're filtered out here to avoid double
  // display. costType === "Operating" is the default and the value
  // storeMigration backfills any persisted rows missing the field.
  const operatingScope = useMemo(
    () => operating.filter((r) => r.costType !== "Labor"),
    [operating],
  );

  const rows: OperatingLine[] = useMemo(() => operatingScope.filter((r) => {
    if (deptFilter !== "ALL" && r.dept !== deptFilter) return false;
    if (categoryFilter !== "ALL" && r.category !== categoryFilter) return false;
    if (includeFilter === "INC" && !r.include) return false;
    if (includeFilter === "EXC" && r.include) return false;
    return true;
  }), [operatingScope, deptFilter, categoryFilter, includeFilter]);

  const deptOptions = deriveDeptFilter(operatingScope, "dept", { "SHARED:CDS": "Shared" });

  const categoryCounts: Record<string, number> = {};
  operatingScope.forEach((r) => { categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1; });
  const categoryOptions = [
    { value: "ALL", label: "All", count: operatingScope.length },
    ...CATEGORIES.filter((c) => categoryCounts[c]).map((c) => ({
      value: c, label: c, count: categoryCounts[c],
    })),
  ];

  const includeOptions = [
    { value: "ALL", label: "All",      count: operatingScope.length },
    { value: "INC", label: "Included", count: operatingScope.filter((r) => r.include).length },
    { value: "EXC", label: "Excluded", count: operatingScope.filter((r) => !r.include).length },
  ];

  const filters: FilterGroup[] = [
    { id: "dept",     label: "Dept",     options: deptOptions,     value: deptFilter,     onChange: setDeptFilter },
    { id: "category", label: "Category", options: categoryOptions, value: categoryFilter, onChange: setCategoryFilter },
    { id: "include",  label: "Status",   options: includeOptions,  value: includeFilter,  onChange: setIncludeFilter },
  ];

  const cols: Column<OperatingLine>[] = [
    {
      key: "code",
      label: "Code",
      width: "110px",
      sortable: true,
      render: (r) => (
        <span className="num" style={{
          opacity: r.include ? 1 : 0.45,
          color: "var(--ink-2)",
        }}>{r.code}</span>
      ),
    },
    {
      key: "line",
      label: "Line item",
      width: "minmax(220px, 1.6fr)",
      sortable: true,
      render: (r) => (
        <div style={{ opacity: r.include ? 1 : 0.45 }}>
          <span style={{
            color: "var(--ink-2)",
            textDecoration: r.include ? "none" : "line-through",
            textDecorationColor: "var(--ink-4)",
          }}>{r.line}</span>
          {!r.include && r.excludeReason && (
            <div style={{ fontSize: "var(--t-l8)", color: "var(--ink-3)", marginTop: 2, fontStyle: "italic" }}>
              Excluded: {r.excludeReason}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "dept",
      label: "Dept",
      width: "110px",
      sortable: true,
      render: (r) => (
        <div style={{ opacity: r.include ? 1 : 0.45 }}>
          {r.dept === "SHARED:CDS" ? <SharedChip/> : (
            <CellSelect
              value={r.dept}
          options={deptOptionsForEdit}
              onChange={(v) => updateOperating(r.id, { dept: v as OpDept })}
            />
          )}
        </div>
      ),
    },
    {
      key: "sourceDept",
      label: "Source Dept",
      width: "140px",
      sortable: true,
      sortKey: (r) => r.sourceDept ?? "",
      render: (r) => (
        <div
          title={r.sourceDept ?? ""}
          style={{
            opacity: r.include ? 1 : 0.45,
            color: r.sourceDept ? "var(--ink-2)" : "var(--ink-4)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {r.sourceDept ?? "—"}
        </div>
      ),
    },
    {
      key: "category",
      label: "Category",
      width: "170px",
      sortable: true,
      render: (r) => (
        <div style={{ opacity: r.include ? 1 : 0.45 }}>
          <CellSelect
            value={r.category}
            options={CATEGORIES}
            onChange={(v) => updateOperating(r.id, { category: v as OpCategory })}
          />
        </div>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      width: "110px",
      align: "right",
      sortable: true,
      render: (r) => (
        <div style={{ opacity: r.include ? 1 : 0.45 }}>
          <CellInput
            type="currency" value={r.amount} min={0}
            onChange={(v) => updateOperating(r.id, { amount: Number(v) || 0 })}
            align="right" prefix="$"
          />
        </div>
      ),
    },
    {
      key: "source",
      label: "Source",
      width: "150px",
      align: "right",
      sortable: true,
      sortKey: (r) => r.sourceFile ?? r.source,
      render: (r) => (
        <div style={{ opacity: r.include ? 1 : 0.45 }}>
          <SourcePill source={r.source} sourceFile={r.sourceFile}/>
        </div>
      ),
    },
    {
      key: "include",
      label: "Include",
      align: "center",
      width: "80px",
      render: (r) => (
        <button
          onClick={() => updateOperating(r.id, { include: !r.include })}
          title={r.include ? "Click to exclude from $/hr (line stays visible for audit)" : "Click to include in $/hr"}
          style={{
            width: 36, height: 20, padding: 2,
            background: r.include ? "var(--accent)" : "var(--rule)",
            border: "none", borderRadius: 999,
            position: "relative", cursor: "pointer",
          }}
        >
          <span style={{
            position: "absolute", top: 2, left: r.include ? 18 : 2,
            width: 16, height: 16, borderRadius: "50%", background: "var(--paper)",
            transition: "left 100ms",
          }}/>
        </button>
      ),
    },
  ];

  return (
    <div>
      <SectionLabel right={`${operatingScope.length} line${operatingScope.length === 1 ? "" : "s"}`}>
        Operating Costs
      </SectionLabel>
      <DataTable
        cols={cols}
        rows={rows}
        filters={filters}
        onAdd={() => addOperatingLine("Operating")}
        addLabel="Add line item"
        defaultSort={{ key: "amount", dir: "desc" }}
      />
    </div>
  );
}
