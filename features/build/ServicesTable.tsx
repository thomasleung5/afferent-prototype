
import { useEffect, useMemo, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import {
  DataTable, deriveDeptFilter, applyFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import {
  CellInput, CellSelect,
  DrilldownColumn, DrilldownLabel, DrilldownShell,
  ExpandIndicator, SectionLabel, SourcePill,
} from "@/components/ui";
import type { DeptCode, Service } from "@/lib/types";
import { useBuildState } from "@/lib/store";

import { FEE_DEPTS } from "@/lib/data/departments";

const DEPT_OPTIONS: string[] = [...FEE_DEPTS];

const ROLE_MIX_BY_DEPT: Record<DeptCode, { role: string; pct: number }[]> = {
  PLAN:  [{ role: "Planner II",        pct: 70 }, { role: "Senior Planner",       pct: 30 }],
  BLDG:  [{ role: "Plans Examiner",    pct: 60 }, { role: "Permit Technician",    pct: 40 }],
  ENG:   [{ role: "Civil Engineer II", pct: 65 }, { role: "Engineering Technician", pct: 35 }],
  PARKS: [{ role: "Recreation Coordinator", pct: 70 }, { role: "Recreation Supervisor", pct: 30 }],
  PD:    [{ role: "Records Specialist", pct: 60 }, { role: "Police Officer",          pct: 40 }],
  FIRE:  [{ role: "Fire Inspector",     pct: 70 }, { role: "Fire Marshal",            pct: 30 }],
};

interface Row extends Service {
  flag?: boolean;
}

type RoleMix = { role: string; pct: number }[];

export function ServicesTable() {
  const { services, updateService, addService } = useBuildState();
  const [dept, setDept] = useState("ALL");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [openId, setOpenId] = useState<string | undefined>();
  const [mixById, setMixById] = useState<Record<string, RoleMix>>({});

  const getMix = (r: Row): RoleMix => mixById[r.id] ?? ROLE_MIX_BY_DEPT[r.dept];
  const setPct = (r: Row, role: string, pct: number) => {
    const next = getMix(r).map((m) => m.role === role ? { ...m, pct } : m);
    setMixById({ ...mixById, [r.id]: next });
  };

  const allRows: Row[] = useMemo(() => services.map((s) => ({
    ...s,
    flag: !s.hours || !s.volume,
  })), [services]);

  const rows = useMemo(() => {
    const filtered = applyFilter(allRows, "dept", dept);
    return reviewOnly ? filtered.filter((r) => r.flag) : filtered;
  }, [allRows, dept, reviewOnly]);

  // ?serviceId=... means we were cross-navigated here. Clear filters
  // that would hide the row, open its drilldown, scroll into view, and
  // flash briefly. Same pattern as the other cross-nav consumers.
  const { serviceId } = useSearch({ from: "/build/services" });
  useEffect(() => {
    if (!serviceId) return;
    if (!allRows.some((r) => r.id === serviceId)) return;
    setDept("ALL");
    setReviewOnly(false);
    setOpenId(serviceId);
    const handle = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(serviceId)}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("row-flash");
      window.setTimeout(() => el.classList.remove("row-flash"), 1700);
    }, 30);
    return () => window.clearTimeout(handle);
  }, [serviceId, allRows]);

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
          <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)", letterSpacing: "0.04em", paddingLeft: 6 }}>
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
    {
      key: "mix",
      label: "Role mix",
      width: "120px",
      align: "right",
      sortable: true,
      sortKey: (r) => getMix(r).length,
      render: (r) => {
        const mix = getMix(r);
        const isOpen = openId === r.id;
        return (
          <div
            onClick={(e) => {
              e.stopPropagation();
              setOpenId(isOpen ? undefined : r.id);
            }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 12.5, color: "var(--ink-2)",
              cursor: "pointer", userSelect: "none",
            }}
          >
            <span>{mix.length} roles</span>
            <ExpandIndicator open={isOpen}/>
          </div>
        );
      },
    },
    {
      key: "source",
      label: "Source",
      width: "150px",
      align: "right",
      sortable: true,
      sortKey: (r) => r.sourceFile ?? r.source,
      render: (r) => <SourcePill source={r.source} sourceFile={r.sourceFile}/>,
    },
  ];

  return (
    <div>
      <SectionLabel right={`${allRows.length} services`}>
        Service catalog
      </SectionLabel>
      <DataTable
        cols={cols}
        rows={rows}
        filters={filters}
        onAdd={addService}
        addLabel="Add service"
        defaultSort={{ key: "name", dir: "asc" }}
        stickySort={(a, b) => (a.flag ? 0 : 1) - (b.flag ? 0 : 1)}
        openId={openId}
        renderDrilldown={(r) => {
          const mix = getMix(r);
          const totalPct = mix.reduce((a, m) => a + m.pct, 0);
          return (
            <DrilldownShell>
              <DrilldownColumn marker="①" title="Role mix">
                <div style={{ border: "1px solid var(--rule)", background: "var(--paper)" }}>
                  <div style={{
                    display: "grid", gridTemplateColumns: "1fr 80px 80px", gap: 12,
                    padding: "8px 12px",
                    background: "var(--paper-2)",
                    borderBottom: "1px solid var(--rule)",
                  }}>
                    <DrilldownLabel>Role</DrilldownLabel>
                    <DrilldownLabel align="right">%</DrilldownLabel>
                    <DrilldownLabel align="right">Hours</DrilldownLabel>
                  </div>
                  {mix.map((m, i) => (
                    <div key={m.role} style={{
                      display: "grid", gridTemplateColumns: "1fr 80px 80px", gap: 12,
                      padding: "7px 12px",
                      borderBottom: i < mix.length - 1 ? "1px solid var(--rule)" : "none",
                      fontSize: 12, alignItems: "baseline",
                    }}>
                      <span style={{ color: "var(--ink-2)" }}>{m.role}</span>
                      <span style={{ textAlign: "right" }}>
                        <CellInput
                          type="number"
                          value={m.pct}
                          onChange={(v) => setPct(r, m.role, Number(v) || 0)}
                          step={5} min={0} max={100}
                          align="right" suffix="%"
                          fontSize={12}
                        />
                      </span>
                      <span className="num" style={{ textAlign: "right", color: "var(--ink-3)" }}>
                        {((r.hours * m.pct) / 100).toFixed(1)} h
                      </span>
                    </div>
                  ))}
                  <div style={{
                    display: "grid", gridTemplateColumns: "1fr 80px 80px", gap: 12,
                    padding: "8px 12px",
                    background: "var(--paper-2)",
                    borderTop: "1px solid var(--rule-strong)",
                    fontSize: 12, fontWeight: 600,
                    alignItems: "baseline",
                  }}>
                    <span className="mono" style={{
                      fontSize: 10, letterSpacing: "0.06em",
                      color: "var(--ink-3)", textTransform: "uppercase",
                    }}>Total</span>
                    <span className="num" style={{
                      textAlign: "right",
                      color: Math.abs(totalPct - 100) < 0.5 ? "var(--ink)" : "var(--warn)",
                    }}>{totalPct}%</span>
                    <span className="num" style={{ textAlign: "right" }}>{r.hours} h</span>
                  </div>
                </div>
              </DrilldownColumn>
            </DrilldownShell>
          );
        }}
      />
    </div>
  );
}
