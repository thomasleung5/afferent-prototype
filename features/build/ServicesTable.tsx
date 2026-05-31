
import { useEffect, useMemo, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import {
  DataTable, deriveDeptFilter, applyFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import {
  ActivityCombobox, AddRowButton, CellInput, CellSelect,
  DrilldownColumn, DrilldownShell, InlineLinkRow,
  MiniTable, MonoLabel, RemoveIconButton, SectionLabel, SourcePill,
  UnitCombobox,
  type MiniTableColumn,
} from "@/components/ui";
import type {
  DeptCode, ProductiveHoursRow, RoleAllocation, Service,
} from "@/lib/types";
import { useBuildState } from "@/lib/store";
import {
  effectiveRoleAllocations, serviceCapacityWarnings,
  type ServiceCapacityWarning,
} from "@/lib/capacity";

import { FEE_DEPTS } from "@/lib/data/departments";

const DEPT_OPTIONS: string[] = [...FEE_DEPTS];

interface Row extends Service {
  flag?: boolean;
}

export function ServicesTable() {
  const {
    services, productiveHours, serviceRoleAllocations,
    updateService, addService, setServiceRoleAllocations,
  } = useBuildState();
  const [dept, setDept] = useState("ALL");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [openId, setOpenId] = useState<string | undefined>();

  // Resolved allocations per service — override when set, else FTE-weighted
  // default from same-dept positions. Editors below commit changes by
  // writing the full allocation array back through setServiceRoleAllocations.
  const getMix = (r: Row): RoleAllocation[] =>
    effectiveRoleAllocations(r, productiveHours, serviceRoleAllocations);
  const commitMix = (serviceId: string, next: RoleAllocation[]) =>
    setServiceRoleAllocations(serviceId, next);
  const setPct = (r: Row, productiveHoursId: string, pct: number) => {
    const next = getMix(r).map((m) =>
      m.productiveHoursId === productiveHoursId ? { ...m, pct } : m,
    );
    commitMix(r.id, next);
  };
  const setRole = (r: Row, idx: number, productiveHoursId: string) => {
    const next = getMix(r).map((m, i) =>
      i === idx ? { ...m, productiveHoursId } : m,
    );
    commitMix(r.id, next);
  };
  const removeRole = (r: Row, idx: number) => {
    commitMix(r.id, getMix(r).filter((_, i) => i !== idx));
  };
  const addRole = (r: Row) => {
    const existing = new Set(getMix(r).map((m) => m.productiveHoursId));
    const candidate = productiveHours.find(
      (p) => p.dept === r.dept && !existing.has(p.id),
    ) ?? productiveHours.find((p) => !existing.has(p.id));
    if (!candidate) return;
    commitMix(r.id, [...getMix(r), { productiveHoursId: candidate.id, pct: 0 }]);
  };

  // Position picker options — all productiveHours rows, ordered by dept
  // (service's own dept first) then by title. Cross-dept allocations are
  // possible since role.dept is what the capacity model rolls up.
  const positionOptions = useMemo(() => buildPositionOptions(productiveHours), [productiveHours]);
  const positionById = useMemo(() => {
    const m = new Map<string, ProductiveHoursRow>();
    for (const p of productiveHours) m.set(p.id, p);
    return m;
  }, [productiveHours]);

  // Capacity warnings (alloc pcts ≠ 100, dangling productiveHoursId).
  // Grouped by serviceId so each row can render its own warnings inline
  // and the flag system picks affected services into "Needs review".
  const warningsByService = useMemo(() => {
    const all = serviceCapacityWarnings(services, serviceRoleAllocations, productiveHours);
    const m = new Map<string, ServiceCapacityWarning[]>();
    for (const w of all) {
      const list = m.get(w.serviceId) ?? [];
      list.push(w);
      m.set(w.serviceId, list);
    }
    return m;
  }, [services, serviceRoleAllocations, productiveHours]);

  const allRows: Row[] = useMemo(() => services.map((s) => ({
    ...s,
    flag: !s.hours || !s.volume || warningsByService.has(s.id),
  })), [services, warningsByService]);

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
      key: "feeNo",
      label: "Fee #",
      width: "90px",
      sortable: true,
      sortKey: (r) => r.feeNo ?? "",
      render: (r) => (
        <CellInput
          value={r.feeNo ?? ""}
          onChange={(v) => updateService(r.id, { feeNo: String(v) || undefined })}
          placeholder="—"
        />
      ),
    },
    {
      key: "name",
      label: "Service",
      width: "minmax(240px, 2fr)",
      sortable: true,
      render: (r) => {
        const warnings = warningsByService.get(r.id) ?? [];
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <CellInput
              value={r.name}
              onChange={(v) => updateService(r.id, { name: String(v) })}
            />
            <span className="mono" style={{ fontSize: "var(--t-l4)", color: "var(--ink-4)", letterSpacing: "0.04em", paddingLeft: 6 }}>
              {r.id}
            </span>
            {warnings.map((w, i) => (
              <div key={i} style={{
                fontSize: "var(--t-l8)", color: "var(--warn)",
                marginTop: 2, paddingLeft: 6,
              }}>
                ⚠ {formatServiceWarning(w)}
              </div>
            ))}
          </div>
        );
      },
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
          onChange={(v) => updateService(r.id, { dept: v as DeptCode })}
        />
      ),
    },
    {
      key: "activity",
      label: "Activity",
      width: "140px",
      sortable: true,
      sortKey: (r) => r.activityLabel ?? "",
      render: (r) => (
        <ActivityCombobox
          value={r.activityLabel != null
            ? { label: r.activityLabel, type: r.activityType ?? "CUSTOM" }
            : undefined}
          onChange={(next) =>
            updateService(r.id, { activityLabel: next.label, activityType: next.type })}
        />
      ),
    },
    {
      key: "unit",
      label: "Unit",
      width: "140px",
      sortable: true,
      sortKey: (r) => r.unitLabel ?? "",
      render: (r) => (
        <UnitCombobox
          value={r.unitLabel != null
            ? { label: r.unitLabel, type: r.unitType ?? "CUSTOM" }
            : undefined}
          onChange={(next) =>
            updateService(r.id, { unitLabel: next.label, unitType: next.type })}
        />
      ),
    },
    {
      key: "hours",
      label: "Hours / inst",
      width: "100px",
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
      label: "Role allocation",
      width: "120px",
      align: "right",
      sortable: true,
      sortKey: (r) => getMix(r).length,
      render: (r) => (
        <span style={{ color: "var(--ink-2)" }}>
          {getMix(r).length} roles
        </span>
      ),
    },
    {
      key: "source",
      label: "Source",
      width: "110px",
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
        defaultSort={{ key: "feeNo", dir: "asc" }}
        stickySort={(a, b) => (a.flag ? 0 : 1) - (b.flag ? 0 : 1)}
        openId={openId}
        onRowClick={(r) => setOpenId(openId === r.id ? undefined : r.id)}
        drilldownIndicator
        renderDrilldown={(r) => {
          const mix = getMix(r);
          const totalPct = mix.reduce((a, m) => a + m.pct, 0);
          const roleCols: MiniTableColumn[] = [
            { key: "role",   label: "Role",  width: "minmax(220px, 1.5fr)" },
            { key: "dept",   label: "Dept",  width: "70px", align: "right" },
            { key: "pct",    label: "%",     width: "80px", align: "right" },
            { key: "hours",  label: "Hours", width: "80px", align: "right" },
            { key: "remove", label: "",      width: "28px" },
          ];
          return (
            <DrilldownShell>
              <DrilldownColumn marker="①" title="Role allocation">
                <MiniTable
                  columns={roleCols}
                  rows={mix}
                  rowKey={(m, i) => `${m.productiveHoursId}-${i}`}
                  renderCell={(col, m, i) => {
                    if (col.key === "role") {
                      return (
                        <CellSelect
                          value={m.productiveHoursId}
                          options={positionOptions}
                          onChange={(v) => setRole(r, i, v)}
                        />
                      );
                    }
                    if (col.key === "dept") {
                      const pos = positionById.get(m.productiveHoursId);
                      const roleDept = pos?.dept ?? r.dept;
                      const crossDept = pos != null && pos.dept !== r.dept;
                      return (
                        <MonoLabel
                          title={crossDept ? `Cross-dept allocation (service belongs to ${r.dept})` : undefined}
                          style={{ color: crossDept ? "var(--warn)" : "var(--ink-3)" }}
                        >{roleDept}</MonoLabel>
                      );
                    }
                    if (col.key === "pct") {
                      return (
                        <CellInput
                          type="number"
                          value={m.pct}
                          onChange={(v) => setPct(r, m.productiveHoursId, Number(v) || 0)}
                          step={5} min={0} max={100}
                          align="right" suffix="%"
                          fontSize={12}
                        />
                      );
                    }
                    if (col.key === "hours") {
                      return <span className="num" style={{ color: "var(--ink-3)" }}>{((r.hours * m.pct) / 100).toFixed(1)} h</span>;
                    }
                    if (col.key === "remove") {
                      return (
                        <RemoveIconButton
                          title="Remove role"
                          onClick={(e) => { e.stopPropagation(); removeRole(r, i); }}
                        />
                      );
                    }
                    return null;
                  }}
                  renderFooter={(col) => {
                    if (col.key === "role") return <MonoLabel>Total</MonoLabel>;
                    if (col.key === "pct") {
                      return (
                        <span className="num" style={{
                          color: Math.abs(totalPct - 100) < 0.5 ? "var(--ink)" : "var(--warn)",
                        }}>{totalPct}%</span>
                      );
                    }
                    if (col.key === "hours") return <span className="num">{r.hours} h</span>;
                    return null;
                  }}
                  footerSlot={(
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        padding: "10px 16px",
                        borderTop: "1px solid var(--rule-strong)",
                        background: "var(--paper-2)",
                      }}
                    >
                      <AddRowButton label="Add role" onClick={() => addRole(r)}/>
                    </div>
                  )}
                />
                <InlineLinkRow
                  links={[
                    { to: "/build/costs",    search: { serviceId: r.id },
                      text: "View cost of service →",
                      onClick: (e) => e.stopPropagation() },
                    { to: "/build/fee-schedule", search: { serviceId: r.id },
                      text: "View fee schedule →",
                      onClick: (e) => e.stopPropagation() },
                  ]}
                />
              </DrilldownColumn>
            </DrilldownShell>
          );
        }}
      />
    </div>
  );
}


/** Inline human-readable copy for a per-service capacity warning. Kept
 *  short so it fits in the service name cell's secondary line under
 *  the service id, matching VolumeTable's inline warning pattern. */
function formatServiceWarning(w: ServiceCapacityWarning): string {
  if (w.kind === "alloc-not-100") {
    return `Role allocation totals ${Math.round(w.actual)}% (should be 100%)`;
  }
  return `Role references missing position (${w.productiveHoursId})`;
}

/** Build the position picker options from the full productiveHours roster.
 *  Sort by dept (FEE_DEPTS order) then by title for stable listings; the
 *  display label includes the dept code so cross-dept picks are visible
 *  before the role's Dept column refreshes. */
function buildPositionOptions(
  rows: ProductiveHoursRow[],
): { value: string; label: string }[] {
  const deptOrder = new Map<DeptCode, number>(
    FEE_DEPTS.map((d, i) => [d, i]),
  );
  return [...rows]
    .sort((a, b) => {
      const da = deptOrder.get(a.dept) ?? 99;
      const db = deptOrder.get(b.dept) ?? 99;
      if (da !== db) return da - db;
      return a.title.localeCompare(b.title);
    })
    .map((p) => ({ value: p.id, label: `${p.title} (${p.dept})` }));
}

