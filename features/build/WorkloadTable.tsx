"use client";

import { useMemo, useState } from "react";
import {
  DataTable, deriveDeptFilter, applyFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import { CellInput, DeptChip, SourcePill } from "@/components/ui";
import type { DeptCode, WorkloadRow } from "@/lib/types";
import { useBuildState } from "./BuildContext";

interface Row {
  id: string;
  name: string;
  dept: DeptCode;
  unit: string;
  prior: number | null;
  current: number | null;
  status: WorkloadRow["status"];
  source: WorkloadRow["source"];
  flag: boolean;
  warning?: WorkloadRow["flag"];
  changePct: number | null;
}

const SOURCE_TONE: Record<WorkloadRow["source"], "fact" | "policy" | "default"> = {
  imported: "fact",
  "carry-forward": "policy",
  manual: "policy",
  missing: "default",
};

const SOURCE_LABEL: Record<WorkloadRow["source"], string> = {
  imported: "Imported",
  "carry-forward": "Carry-forward",
  manual: "Manual",
  missing: "Missing",
};

export function WorkloadTable() {
  const { services, workload, updateWorkload } = useBuildState();
  const [dept, setDept] = useState("ALL");
  const [reviewOnly, setReviewOnly] = useState(false);

  const all: Row[] = useMemo(() => workload.map((w): Row => {
    const svc = services.find((s) => s.id === w.id);
    const changePct =
      w.current == null || w.prior == null || w.prior === 0
        ? null
        : ((w.current - w.prior) / w.prior) * 100;
    return {
      id: w.id,
      name: svc?.name ?? w.id,
      dept: (svc?.dept ?? "PLAN") as DeptCode,
      unit: w.unit,
      prior: w.prior,
      current: w.current,
      status: w.status,
      source: w.source,
      flag: !!w.flag,
      warning: w.flag,
      changePct,
    };
  }), [services, workload]);

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
      key: "name",
      label: "Service",
      width: "minmax(280px, 2fr)",
      sortable: true,
      render: (r) => (
        <div>
          <div style={{ fontSize: 13 }}>{r.name}</div>
          {r.warning === "missing-current-volume" && (
            <div style={{ fontSize: 11, color: "var(--warn)", marginTop: 2 }}>
              ⚠ No current-year volume — enter manually or use prior
            </div>
          )}
          {r.warning === "carry-forward" && (
            <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 2 }}>
              Reused from prior study — confirm
            </div>
          )}
        </div>
      ),
    },
    {
      key: "dept",
      label: "Dept",
      width: "70px",
      sortable: true,
      render: (r) => <DeptChip code={r.dept}/>,
    },
    {
      key: "unit",
      label: "Unit",
      width: "100px",
      sortable: true,
      render: (r) => <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{r.unit}</span>,
    },
    {
      key: "prior",
      label: "Prior",
      width: "100px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="num" style={{ color: "var(--ink-3)" }}>
          {r.prior?.toLocaleString() ?? "—"}
        </span>
      ),
    },
    {
      key: "current",
      label: "Current",
      width: "120px",
      align: "right",
      sortable: true,
      sortKey: (r) => r.current ?? -Infinity,
      render: (r) => (
        <CellInput
          type="number"
          value={r.current ?? ""}
          onChange={(v) => updateWorkload(r.id, {
            current: Number(v) || 0,
            status: "Manual",
            source: "manual",
            flag: undefined,
          })}
          align="right"
          placeholder="enter"
        />
      ),
    },
    {
      key: "changePct",
      label: "Change",
      width: "80px",
      align: "right",
      sortable: true,
      sortKey: (r) => r.changePct ?? -Infinity,
      render: (r) => {
        if (r.changePct == null) return <span style={{ color: "var(--ink-4)" }}>—</span>;
        const d = r.changePct;
        const color = d > 0 ? "var(--pos)" : d < 0 ? "var(--neg)" : "var(--ink)";
        return (
          <span className="num" style={{ color }}>
            {d > 0 ? "+" : ""}{Math.round(d)}%
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Source",
      width: "130px",
      align: "right",
      sortable: true,
      render: (r) => (
        <SourcePill tone={SOURCE_TONE[r.source]}>
          {SOURCE_LABEL[r.source]}
        </SourcePill>
      ),
    },
  ];

  return (
    <DataTable
      title="Service workload"
      eyebrow="Inputs · Edit current volume inline; recovery recomputes"
      cols={cols}
      rows={rows}
      filters={filters}
      defaultSort={{ key: "name", dir: "asc" }}
      stickySort={(a, b) => (a.flag ? 0 : 1) - (b.flag ? 0 : 1)}
      footerNote={`${rows.length} services · ${rows.filter((r) => r.current != null).length} captured · current volumes feed annual cost`}
    />
  );
}
