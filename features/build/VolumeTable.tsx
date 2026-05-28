
import { useMemo, useState } from "react";
import {
  DataTable, deriveDeptFilter, applyFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import { CellInput, DeptChip, SectionLabel, SourcePill } from "@/components/ui";
import type { DeptCode, VolumeRow } from "@/lib/types";
import { useBuildState } from "@/lib/store";

interface Row {
  id: string;
  name: string;
  feeNo?: string;
  dept: DeptCode;
  /** Activity label — Services is the canonical owner (Service.activity).
   *  Falls back to the legacy VolumeRow.unit for rows whose Service has
   *  no activity set. Distinct from the FEE PRICING unit (each / per
   *  hour / etc.) which stays on Services + Fee Schedule. */
  activity: string;
  prior: number | null;
  current: number | null;
  status: VolumeRow["status"];
  source: VolumeRow["source"];
  sourceFile?: string;
  flag: boolean;
  warning?: VolumeRow["flag"];
  changePct: number | null;
}

export function VolumeTable() {
  const { services, volume, updateVolume } = useBuildState();
  const [dept, setDept] = useState("ALL");
  const [reviewOnly, setReviewOnly] = useState(false);

  const all: Row[] = useMemo(() => volume.map((w): Row => {
    const svc = services.find((s) => s.id === w.id);
    const changePct =
      w.current == null || w.prior == null || w.prior === 0
        ? null
        : ((w.current - w.prior) / w.prior) * 100;
    return {
      id: w.id,
      name: svc?.name ?? w.id,
      feeNo: svc?.feeNo,
      dept: (svc?.dept ?? "PLAN") as DeptCode,
      activity: svc?.activity ?? w.unit ?? "",
      prior: w.prior,
      current: w.current,
      status: w.status,
      source: w.source,
      sourceFile: w.sourceFile,
      flag: !!w.flag,
      warning: w.flag,
      changePct,
    };
  }), [services, volume]);

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
      key: "feeNo",
      label: "Fee #",
      width: "90px",
      sortable: true,
      sortKey: (r) => r.feeNo ?? "",
      render: (r) => (
        <span className="num" style={{
          color: r.feeNo ? "var(--ink-2)" : "var(--ink-4)",
        }}>{r.feeNo ?? "—"}</span>
      ),
    },
    {
      key: "name",
      label: "Service",
      width: "minmax(240px, 1.8fr)",
      sortable: true,
      render: (r) => (
        <div>
          <div style={{ fontSize: "var(--fs-ui)" }}>{r.name}</div>
          <div className="mono" style={{ fontSize: "var(--t-l4)", color: "var(--ink-4)", marginTop: 2 }}>
            {r.id}
          </div>
          {r.warning === "missing-current-volume" && (
            <div style={{ fontSize: "var(--t-l8)", color: "var(--warn)", marginTop: 2 }}>
              ⚠ No current-year volume — enter manually or use prior
            </div>
          )}
          {r.warning === "carry-forward" && (
            <div style={{ fontSize: "var(--t-l8)", color: "var(--accent)", marginTop: 2 }}>
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
      key: "activity",
      label: "Activity",
      width: "110px",
      sortable: true,
      render: (r) => (
        <span style={{ color: r.activity ? "var(--ink-2)" : "var(--ink-4)" }}>
          {r.activity || "—"}
        </span>
      ),
    },
    {
      key: "prior",
      label: "Prior",
      width: "100px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="num">
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
          onChange={(v) => updateVolume(r.id, {
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
      width: "150px",
      align: "right",
      sortable: true,
      sortKey: (r: Row) => r.sourceFile ?? r.source,
      render: (r) => <SourcePill source={r.source} sourceFile={r.sourceFile}/>,
    },
  ];

  return (
    <div>
      <SectionLabel right={`${all.length} services`}>
        Service volume
      </SectionLabel>
      <DataTable
        cols={cols}
        rows={rows}
        filters={filters}
        defaultSort={{ key: "feeNo", dir: "asc" }}
        stickySort={(a, b) => (a.flag ? 0 : 1) - (b.flag ? 0 : 1)}
      />
    </div>
  );
}
