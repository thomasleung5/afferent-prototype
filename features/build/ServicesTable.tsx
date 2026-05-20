
import { useMemo, useState } from "react";
import {
  DataTable, deriveDeptFilter, applyFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import {
  CellInput, CellSelect,
  DrilldownShell, DrilldownColumn, SectionLabel, SourcePill, TraceBlock,
} from "@/components/ui";
import type { DeptCode, Service } from "@/lib/types";
import { useBuildState } from "@/lib/store";

const DEPT_OPTIONS = ["PLAN", "BLDG", "ENG"];

const ROLE_MIX_BY_DEPT: Record<DeptCode, { role: string; pct: number }[]> = {
  PLAN: [{ role: "Planner II",        pct: 70 }, { role: "Senior Planner",       pct: 30 }],
  BLDG: [{ role: "Plans Examiner",    pct: 60 }, { role: "Permit Technician",    pct: 40 }],
  ENG:  [{ role: "Civil Engineer II", pct: 65 }, { role: "Engineering Technician", pct: 35 }],
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
            <span style={{
              display: "inline-block", fontSize: 9,
              color: isOpen ? "var(--accent)" : "var(--ink-3)",
              transform: isOpen ? "rotate(90deg)" : "none",
              transition: "transform 100ms",
              fontFamily: "var(--ff-mono)", lineHeight: 1,
            }}>▶</span>
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
                  padding: "6px 10px",
                  background: "var(--paper-2)",
                  borderBottom: "1px solid var(--rule)",
                  fontFamily: "var(--ff-mono)", fontSize: 10, fontWeight: 600,
                  letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase",
                }}>
                  <div>Role</div>
                  <div style={{ textAlign: "right" }}>%</div>
                  <div style={{ textAlign: "right" }}>Hours</div>
                </div>
                {mix.map((m, i) => (
                  <div key={m.role} style={{
                    display: "grid", gridTemplateColumns: "1fr 80px 80px", gap: 12,
                    padding: "5px 10px",
                    borderBottom: i < mix.length - 1 ? "1px solid var(--rule)" : "none",
                    fontSize: 12.5, alignItems: "center",
                  }}>
                    <span style={{ color: "var(--ink-2)" }}>{m.role}</span>
                    <span style={{ textAlign: "right" }}>
                      <CellInput
                        type="number"
                        value={m.pct}
                        onChange={(v) => setPct(r, m.role, Number(v) || 0)}
                        step={5} min={0} max={100}
                        align="right" suffix="%"
                      />
                    </span>
                    <span className="num" style={{ textAlign: "right", color: "var(--ink-2)" }}>
                      {((r.hours * m.pct) / 100).toFixed(1)} h
                    </span>
                  </div>
                ))}
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 80px 80px", gap: 12,
                  padding: "6px 10px",
                  background: "var(--paper-2)",
                  borderTop: "2px solid var(--ink)",
                  fontFamily: "var(--ff-mono)", fontSize: 11, fontWeight: 700,
                  alignItems: "baseline",
                }}>
                  <span className="mono" style={{
                    fontSize: 10, letterSpacing: "0.1em",
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

            <DrilldownColumn marker="②" title="Basis">
              <TraceBlock label="Basis">
                Time-study averaged across recent permits in this dept
              </TraceBlock>
              <TraceBlock label="Hours / inst">
                <span className="num">{r.hours} h</span>
              </TraceBlock>
            </DrilldownColumn>
          </DrilldownShell>
        );
      }}
      />
    </div>
  );
}
