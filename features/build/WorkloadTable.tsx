
import { useMemo, useState } from "react";
import {
  DataTable, deriveDeptFilter, applyFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import {
  CellInput, DeptChip, SourcePill,
  DrilldownShell, DrilldownColumn, TraceBlock, Formula,
} from "@/components/ui";
import { fmt } from "@/lib/format";
import type { DeptCode, WorkloadRow } from "@/lib/types";
import { useBuildState } from "@/lib/store";

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
  const { services, workload, updateWorkload, derived } = useBuildState();
  const [dept, setDept] = useState("ALL");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [openId, setOpenId] = useState<string | undefined>();

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
      openId={openId}
      onRowClick={(r) => setOpenId(openId === r.id ? undefined : r.id)}
      drilldownIndicator
      renderDrilldown={(r) => {
        const svc = services.find((s) => s.id === r.id);
        const fbhr = derived.fbhr[r.dept]?.fbhr ?? 0;
        const hours = svc?.hours ?? 0;
        const unitCost = hours * fbhr;
        const annualCost = unitCost * (r.current ?? 0);
        const changeAbs =
          r.current == null || r.prior == null ? null : r.current - r.prior;

        return (
          <DrilldownShell>
            <DrilldownColumn marker="①" title="Source">
              <TraceBlock label="Status">
                <span style={{ color: r.flag ? "var(--warn)" : "var(--ink-2)" }}>
                  {r.status}
                </span>
              </TraceBlock>
              <TraceBlock label="Origin">
                {r.source === "carry-forward"
                  ? "Reused from prior study — needs confirmation"
                  : r.source === "missing"
                    ? "No current-year volume available"
                    : r.source === "manual"
                      ? "Manually entered by analyst"
                      : "Permit-system export"}
              </TraceBlock>
              <TraceBlock label="Unit">{r.unit}</TraceBlock>
              <TraceBlock label="Prior volume">
                <span className="num">{r.prior?.toLocaleString() ?? "—"}</span>
              </TraceBlock>
              <div style={{ marginTop: 10 }}>
                <SourcePill tone={SOURCE_TONE[r.source]}>
                  {SOURCE_LABEL[r.source]}
                </SourcePill>
              </div>
            </DrilldownColumn>

            <DrilldownColumn marker="②" title="Change vs prior">
              <div style={{
                padding: "12px 14px",
                background: "var(--paper)", border: "1px solid var(--rule)",
                fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>prior</span>
                  <b>{r.prior?.toLocaleString() ?? "—"}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>current</span>
                  <b>{r.current?.toLocaleString() ?? "—"}</b>
                </div>
                <div style={{
                  borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6,
                  display: "flex", justifyContent: "space-between",
                }}>
                  <span>change</span>
                  {r.changePct == null || changeAbs == null ? (
                    <b>—</b>
                  ) : (
                    <b style={{
                      color: r.changePct > 0 ? "var(--pos)"
                        : r.changePct < 0 ? "var(--neg)" : "var(--ink)",
                    }}>
                      {changeAbs > 0 ? "+" : ""}{changeAbs.toLocaleString()} ({Math.round(r.changePct)}%)
                    </b>
                  )}
                </div>
              </div>
              {r.warning === "carry-forward" && (
                <div style={{
                  marginTop: 12, fontSize: 11.5,
                  color: "var(--accent)", lineHeight: 1.55,
                }}>
                  Reused from prior study — please confirm against the permit system.
                </div>
              )}
              {r.warning === "missing-current-volume" && (
                <div style={{
                  marginTop: 12, fontSize: 11.5,
                  color: "var(--warn)", lineHeight: 1.55,
                }}>
                  No current-year volume — enter manually or accept prior.
                </div>
              )}
            </DrilldownColumn>

            <DrilldownColumn marker="③" title="Carries into">
              <div style={{
                padding: "12px 14px",
                background: "var(--paper)", border: "1px solid var(--rule)",
                fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>service hours</span>
                  <b>{hours} h</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>× FBHR ({r.dept})</span>
                  <b>${Math.round(fbhr)}/hr</b>
                </div>
                <div style={{
                  borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6,
                  display: "flex", justifyContent: "space-between",
                }}>
                  <span>= unit cost</span>
                  <b>{fmt.dollars(unitCost)}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>× current vol</span>
                  <b>{(r.current ?? 0).toLocaleString()}</b>
                </div>
                <div style={{
                  borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6,
                  display: "flex", justifyContent: "space-between",
                }}>
                  <span>annual cost</span>
                  <b>{fmt.dollarsK(annualCost)}</b>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <Formula>hours × FBHR × volume = annual cost</Formula>
              </div>
            </DrilldownColumn>
          </DrilldownShell>
        );
      }}
      footerNote={`${rows.length} services · ${rows.filter((r) => r.current != null).length} captured · current volumes feed annual cost`}
    />
  );
}
