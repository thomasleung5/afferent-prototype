"use client";

import { useMemo, useState } from "react";
import {
  DataTable, deriveDeptFilter, applyFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import {
  CellInput, CellSelect, DeptChip,
  DrilldownShell, DrilldownColumn, TraceBlock, Formula, SourcePill,
} from "@/components/ui";
import { fmt } from "@/lib/format";
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
  const { services, derived, updateService } = useBuildState();
  const [dept, setDept] = useState("ALL");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [openId, setOpenId] = useState<string | undefined>();

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
      openId={openId}
      onRowClick={(r) => setOpenId(openId === r.id ? undefined : r.id)}
      renderDrilldown={(r) => {
        const f = derived.fbhr[r.dept];
        const unitCost = r.hours * (f?.fbhr ?? 0);
        const annual = unitCost * r.volume;
        const recoveryPct = unitCost > 0 ? (r.fee / unitCost) * 100 : 0;
        return (
          <DrilldownShell>
            <DrilldownColumn marker="①" title="Source · catalog">
              <TraceBlock label="Catalog">Service definition · prior fee study Appendix A</TraceBlock>
              <TraceBlock label="Hours basis">Time-study estimate, validated by department staff</TraceBlock>
              <TraceBlock label="Volume basis">Permit-system count, FY 24/25 actuals · {fmt.int(r.volume)}/yr</TraceBlock>
              <TraceBlock label="Department"><DeptChip code={r.dept}/></TraceBlock>
              <div style={{ marginTop: 10 }}>
                <SourcePill tone="fact">FACT · 32 services in catalog</SourcePill>
              </div>
            </DrilldownColumn>

            <DrilldownColumn marker="②" title="Unit cost build-up">
              <div style={{
                padding: "10px 14px", background: "var(--paper)", border: "1px solid var(--rule)",
                fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>hours per unit</span>
                  <b>{r.hours}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>× FBHR (dept)</span>
                  <b>${Math.round(f?.fbhr ?? 0)}/hr</b>
                </div>
                <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6, display: "flex", justifyContent: "space-between" }}>
                  <span>= unit cost</span>
                  <b>{fmt.dollars(unitCost)}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>× volume {fmt.int(r.volume)}</span>
                  <b>{fmt.dollarsK(annual)}/yr</b>
                </div>
              </div>
              <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
                Current recovery <b style={{ color: recoveryPct >= 80 ? "var(--pos)" : recoveryPct >= 50 ? "var(--warn)" : "var(--neg)" }}>{recoveryPct.toFixed(0)}%</b>
                {" · "}target <b>{r.target}%</b> · recommended fee{" "}
                <b>{fmt.dollars(Math.round((unitCost * r.target) / 100 / 5) * 5)}</b>
              </div>
            </DrilldownColumn>

            <DrilldownColumn marker="③" title="Carries into">
              <TraceBlock label="FBHR">Hours × dept FBHR feeds the rollup in Cost of Service</TraceBlock>
              <TraceBlock label="Annual cost">unit cost × volume → annualized cost on the Fee Schedule</TraceBlock>
              <TraceBlock label="Recovery">fee × volume ÷ unit cost × volume = recovery %</TraceBlock>
              <TraceBlock label="Peer median">{r.peer > 0 ? fmt.dollars(r.peer) : "—"}</TraceBlock>
              <div style={{ marginTop: 10 }}>
                <Formula>fee × volume / (hours × FBHR × volume) = recovery</Formula>
              </div>
            </DrilldownColumn>
          </DrilldownShell>
        );
      }}
      footerNote={`${rows.length} services · click a row to trace lineage and edit inline`}
    />
  );
}
