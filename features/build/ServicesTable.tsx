
import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import {
  DataTable, deriveDeptFilter, applyFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import {
  CellInput, CellSelect,
  DrilldownColumn, DrilldownLabel, DrilldownShell,
  SectionLabel, SourcePill,
} from "@/components/ui";
import type {
  DeptCode, FeeFormula, FeeFormulaTier, FeeRowKind, FeeScheduleStatus,
  ProductiveHoursRow, RoleAllocation, Service,
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
      key: "unit",
      label: "Unit",
      width: "110px",
      sortable: true,
      sortKey: (r) => r.unit ?? "",
      render: (r) => (
        <CellInput
          value={r.unit ?? ""}
          onChange={(v) => updateService(r.id, { unit: String(v) || undefined })}
          placeholder="each"
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
      label: "Role allocation",
      width: "170px",
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
        onRowClick={(r) => setOpenId(openId === r.id ? undefined : r.id)}
        drilldownIndicator
        renderDrilldown={(r) => {
          const mix = getMix(r);
          const totalPct = mix.reduce((a, m) => a + m.pct, 0);
          const COLS = "minmax(220px, 1.5fr) 70px 80px 80px 28px";
          return (
            <DrilldownShell>
              <DrilldownColumn marker="①" title="Role allocation">
                <div style={{ border: "1px solid var(--rule)", background: "var(--paper)" }}>
                  <div style={{
                    display: "grid", gridTemplateColumns: COLS, gap: 12,
                    padding: "8px 12px",
                    background: "var(--paper-2)",
                    borderBottom: "1px solid var(--rule)",
                  }}>
                    <DrilldownLabel>Role</DrilldownLabel>
                    <DrilldownLabel align="right">Dept</DrilldownLabel>
                    <DrilldownLabel align="right">%</DrilldownLabel>
                    <DrilldownLabel align="right">Hours</DrilldownLabel>
                    <span/>
                  </div>
                  {mix.map((m, i) => {
                    const pos = positionById.get(m.productiveHoursId);
                    const roleDept = pos?.dept ?? r.dept;
                    const crossDept = pos != null && pos.dept !== r.dept;
                    return (
                      <div key={`${m.productiveHoursId}-${i}`} style={{
                        display: "grid", gridTemplateColumns: COLS, gap: 12,
                        padding: "7px 12px",
                        borderBottom: i < mix.length - 1 ? "1px solid var(--rule)" : "none",
                        fontSize: 12, alignItems: "baseline",
                      }}>
                        <span style={{ color: "var(--ink-2)" }}>
                          <CellSelect
                            value={m.productiveHoursId}
                            options={positionOptions}
                            onChange={(v) => setRole(r, i, v)}
                          />
                        </span>
                        <span
                          className="mono"
                          title={crossDept ? `Cross-dept allocation (service belongs to ${r.dept})` : undefined}
                          style={{
                            textAlign: "right",
                            color: crossDept ? "var(--warn)" : "var(--ink-3)",
                            fontSize: "var(--t-l9)", letterSpacing: "0.04em",
                          }}
                        >{roleDept}</span>
                        <span style={{ textAlign: "right" }}>
                          <CellInput
                            type="number"
                            value={m.pct}
                            onChange={(v) => setPct(r, m.productiveHoursId, Number(v) || 0)}
                            step={5} min={0} max={100}
                            align="right" suffix="%"
                            fontSize={12}
                          />
                        </span>
                        <span className="num" style={{ textAlign: "right", color: "var(--ink-3)" }}>
                          {((r.hours * m.pct) / 100).toFixed(1)} h
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeRole(r, i); }}
                          title="Remove role"
                          style={{
                            color: "var(--ink-4)", fontSize: 14,
                            lineHeight: 1, padding: "0 4px",
                            background: "transparent", border: 0, cursor: "pointer",
                          }}
                        >×</button>
                      </div>
                    );
                  })}
                  <div style={{
                    display: "grid", gridTemplateColumns: COLS, gap: 12,
                    padding: "8px 12px",
                    background: "var(--paper-2)",
                    borderTop: "1px solid var(--rule-strong)",
                    fontSize: 12, fontWeight: 600,
                    alignItems: "baseline",
                  }}>
                    <span className="mono" style={{
                      fontSize: "var(--t-l9)", letterSpacing: "0.06em",
                      color: "var(--ink-3)", textTransform: "uppercase",
                    }}>Total</span>
                    <span/>
                    <span className="num" style={{
                      textAlign: "right",
                      color: Math.abs(totalPct - 100) < 0.5 ? "var(--ink)" : "var(--warn)",
                    }}>{totalPct}%</span>
                    <span className="num" style={{ textAlign: "right" }}>{r.hours} h</span>
                    <span/>
                  </div>
                  <div style={{
                    padding: "8px 12px", borderTop: "1px solid var(--rule)",
                  }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); addRole(r); }}
                      style={{
                        fontSize: 12, color: "var(--accent)",
                        background: "transparent", border: 0, cursor: "pointer",
                        padding: 0,
                      }}
                    >+ Add role</button>
                  </div>
                </div>
              </DrilldownColumn>

              <DrilldownColumn marker="②" title="Fee schedule metadata">
                <FeeMetadataPanel
                  service={r}
                  onPatch={(patch) => updateService(r.id, patch)}
                />
              </DrilldownColumn>
            </DrilldownShell>
          );
        }}
      />
    </div>
  );
}

/** PR-L4: Fee-schedule metadata editor that sits in the second drilldown
 *  column on ServicesTable. Wires every PR-L1 optional field on Service
 *  that's a scalar string / enum: rowKind, status, category, subcategory,
 *  legalAuthority, the three *Text display overrides, and notes. The
 *  Sub-editors: FormulaEditor (PR-L6) for service.formula. The peer-
 *  survey editor lives on the Fee Benchmark page (PR-M1) — this panel
 *  shows a read-only summary + cross-link via PeerSurveyStub. */
function FeeMetadataPanel({
  service, onPatch,
}: {
  service: Service;
  onPatch: (patch: Partial<Service>) => void;
}) {
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, alignItems: "baseline" }}>
      <span className="mono" style={{
        fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.06em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>{label}</span>
      <div>{children}</div>
    </div>
  );

  const notesText = (service.notes ?? []).join("\n");

  return (
    <div style={{
      border: "1px solid var(--rule)", background: "var(--paper)",
      padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10,
      fontSize: 12,
    }}>
      <Field label="Row kind">
        <CellSelect
          value={service.rowKind ?? "flat"}
          options={ROW_KIND_OPTIONS}
          onChange={(v) => onPatch({ rowKind: v as FeeRowKind })}
        />
      </Field>
      <Field label="Status">
        <CellSelect
          value={service.status ?? "existing"}
          options={STATUS_OPTIONS}
          onChange={(v) => onPatch({ status: v as FeeScheduleStatus })}
        />
      </Field>
      <Field label="Category">
        <CellInput
          value={service.category ?? ""}
          onChange={(v) => onPatch({ category: String(v) || undefined })}
          placeholder="e.g. Planning & Zoning"
        />
      </Field>
      <Field label="Subcategory">
        <CellInput
          value={service.subcategory ?? ""}
          onChange={(v) => onPatch({ subcategory: String(v) || undefined })}
          placeholder="e.g. Discretionary Permits"
        />
      </Field>
      <Field label="Current fee text">
        <CellInput
          value={service.currentFeeText ?? ""}
          onChange={(v) => onPatch({ currentFeeText: String(v) === "" && service.currentFeeText == null ? undefined : String(v) })}
          placeholder={`(numeric: $${service.fee})`}
        />
      </Field>
      <Field label="Recommended text">
        <CellInput
          value={service.recommendedFeeText ?? ""}
          onChange={(v) => onPatch({ recommendedFeeText: String(v) === "" && service.recommendedFeeText == null ? undefined : String(v) })}
          placeholder="(computed)"
        />
      </Field>
      <Field label="Full-cost text">
        <CellInput
          value={service.fullCostRecoveryFeeText ?? ""}
          onChange={(v) => onPatch({ fullCostRecoveryFeeText: String(v) === "" && service.fullCostRecoveryFeeText == null ? undefined : String(v) })}
          placeholder="(computed)"
        />
      </Field>
      <Field label="Legal authority">
        <CellInput
          value={service.legalAuthority ?? ""}
          onChange={(v) => onPatch({ legalAuthority: String(v) || undefined })}
          placeholder="e.g. CA Gov Code §66014"
        />
      </Field>
      <Field label="Notes">
        <textarea
          value={notesText}
          onChange={(e) => {
            const lines = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
            onPatch({ notes: lines.length > 0 ? lines : undefined });
          }}
          onClick={(e) => e.stopPropagation()}
          placeholder="One note per line"
          rows={3}
          style={{
            width: "100%", resize: "vertical",
            padding: "4px 6px", fontSize: 12, lineHeight: 1.4,
            fontFamily: "inherit", color: "var(--ink)",
            background: "var(--paper-2)", border: "1px solid var(--rule)",
            outline: "none",
          }}
        />
      </Field>
      <Field label="Formula">
        <FormulaEditor
          value={service.formula}
          onChange={(f) => onPatch({ formula: f })}
        />
      </Field>
      <Field label="Peer survey">
        <PeerSurveyStub serviceId={service.id} count={service.peerSurvey?.length ?? 0}/>
      </Field>
    </div>
  );
}

const ROW_KIND_OPTIONS = [
  { value: "flat",               label: "Flat" },
  { value: "formula",            label: "Formula" },
  { value: "deposit",            label: "Deposit" },
  { value: "time-and-materials", label: "T&M" },
  { value: "pass-through",       label: "Pass-through" },
  { value: "statutory",          label: "Statutory" },
];

const STATUS_OPTIONS = [
  { value: "existing",      label: "Existing" },
  { value: "new",           label: "New" },
  { value: "renamed",       label: "Renamed" },
  { value: "moved",         label: "Moved" },
  { value: "deleted",       label: "Deleted" },
  { value: "not-evaluated", label: "Not evaluated" },
];

const FORMULA_KIND_OPTIONS = [
  { value: "none",              label: "(none — flat row)" },
  { value: "tiered-valuation",  label: "Tiered valuation" },
  { value: "percentage",        label: "Percentage" },
  { value: "per-unit",          label: "Per unit" },
  { value: "expression",        label: "Expression (freeform)" },
];

/** Default-shape helper — produces a sane starting formula for each kind
 *  when the user switches via the picker. Keeps the existing formula's
 *  basis/text where the field still applies, so a re-pick doesn't blow
 *  away the analyst's previous typing. */
function defaultFormulaFor(
  kind: FeeFormula["kind"],
  prev: FeeFormula | undefined,
): FeeFormula {
  const prevBasis = prev && "basis" in prev ? prev.basis : "";
  if (kind === "tiered-valuation") {
    return {
      kind: "tiered-valuation",
      basis: prevBasis || "construction valuation",
      tiers: prev?.kind === "tiered-valuation" && prev.tiers.length > 0
        ? prev.tiers
        : [{ baseFee: 0, perUnit: 0, unitSize: 1000 }],
    };
  }
  if (kind === "percentage") {
    return {
      kind: "percentage",
      basis: prevBasis || "construction valuation",
      rate: prev?.kind === "percentage" ? prev.rate : 1,
      ...(prev?.kind === "percentage" && prev.minFee != null ? { minFee: prev.minFee } : {}),
      ...(prev?.kind === "percentage" && prev.maxFee != null ? { maxFee: prev.maxFee } : {}),
    };
  }
  if (kind === "per-unit") {
    return {
      kind: "per-unit",
      unit: prev?.kind === "per-unit" ? prev.unit : "linear foot",
      rate: prev?.kind === "per-unit" ? prev.rate : 0,
      ...(prev?.kind === "per-unit" && prev.minFee != null ? { minFee: prev.minFee } : {}),
    };
  }
  return {
    kind: "expression",
    text: prev?.kind === "expression" ? prev.text : "",
  };
}

/** Editor for the Service.formula union. Renders a kind picker + the
 *  kind-specific fields below it. Switching kinds re-shapes the value
 *  via defaultFormulaFor, preserving whatever sub-fields still apply.
 *  Choosing "(none — flat row)" clears the formula back to undefined. */
function FormulaEditor({
  value, onChange,
}: {
  value: FeeFormula | undefined;
  onChange: (next: FeeFormula | undefined) => void;
}) {
  const kind = value?.kind ?? "none";
  const handleKindChange = (next: string) => {
    if (next === "none") { onChange(undefined); return; }
    onChange(defaultFormulaFor(next as FeeFormula["kind"], value));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <CellSelect
        value={kind}
        options={FORMULA_KIND_OPTIONS}
        onChange={handleKindChange}
      />
      {value?.kind === "tiered-valuation" && (
        <TieredValuationFields
          value={value}
          onChange={(next) => onChange(next)}
        />
      )}
      {value?.kind === "percentage" && (
        <PercentageFields value={value} onChange={(next) => onChange(next)}/>
      )}
      {value?.kind === "per-unit" && (
        <PerUnitFields value={value} onChange={(next) => onChange(next)}/>
      )}
      {value?.kind === "expression" && (
        <ExpressionFields value={value} onChange={(next) => onChange(next)}/>
      )}
    </div>
  );
}

function TieredValuationFields({
  value, onChange,
}: {
  value: Extract<FeeFormula, { kind: "tiered-valuation" }>;
  onChange: (next: FeeFormula) => void;
}) {
  const patchTier = (i: number, patch: Partial<FeeFormulaTier>) => {
    const next = value.tiers.map((t, idx) => idx === i ? { ...t, ...patch } : t);
    onChange({ ...value, tiers: next });
  };
  const removeTier = (i: number) =>
    onChange({ ...value, tiers: value.tiers.filter((_, idx) => idx !== i) });
  const addTier = () =>
    onChange({ ...value, tiers: [...value.tiers, { baseFee: 0, perUnit: 0, unitSize: 1000 }] });
  const TIER_COLS = "1fr 1fr 1fr 70px 22px";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <FormulaSubField label="Basis">
        <CellInput
          value={value.basis}
          onChange={(v) => onChange({ ...value, basis: String(v) })}
          placeholder="e.g. construction valuation"
        />
      </FormulaSubField>
      <div style={{ border: "1px solid var(--rule)", background: "var(--paper-2)" }}>
        <div style={{
          display: "grid", gridTemplateColumns: TIER_COLS, gap: 8,
          padding: "5px 8px", borderBottom: "1px solid var(--rule)",
          fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.06em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>
          <span>Up to</span><span>Base fee</span><span>+ per</span><span>per</span><span/>
        </div>
        {value.tiers.map((t, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: TIER_COLS, gap: 8,
            padding: "4px 8px",
            borderBottom: i < value.tiers.length - 1 ? "1px solid var(--rule)" : "none",
            alignItems: "baseline",
          }}>
            <CellInput
              type="integer"
              value={t.upTo ?? ""}
              onChange={(v) => patchTier(i, { upTo: v === "" ? undefined : Number(v) })}
              placeholder="(no cap)"
              fontSize={12}
            />
            <CellInput
              type="currency"
              value={t.baseFee}
              onChange={(v) => patchTier(i, { baseFee: Number(v) || 0 })}
              prefix="$"
              fontSize={12}
            />
            <CellInput
              type="number"
              value={t.perUnit ?? 0}
              onChange={(v) => patchTier(i, { perUnit: Number(v) || 0 })}
              step={0.1} min={0}
              fontSize={12}
            />
            <CellInput
              type="integer"
              value={t.unitSize ?? 1000}
              onChange={(v) => patchTier(i, { unitSize: Number(v) || 1 })}
              fontSize={12}
            />
            <button
              onClick={(e) => { e.stopPropagation(); removeTier(i); }}
              title="Remove tier"
              style={{
                color: "var(--ink-4)", fontSize: 14, lineHeight: 1, padding: "0 4px",
                background: "transparent", border: 0, cursor: "pointer",
              }}
            >×</button>
          </div>
        ))}
        <div style={{ padding: "5px 8px", borderTop: "1px solid var(--rule)" }}>
          <button
            onClick={(e) => { e.stopPropagation(); addTier(); }}
            style={{
              fontSize: 12, color: "var(--accent)",
              background: "transparent", border: 0, cursor: "pointer", padding: 0,
            }}
          >+ Add tier</button>
        </div>
      </div>
    </div>
  );
}

function PercentageFields({
  value, onChange,
}: {
  value: Extract<FeeFormula, { kind: "percentage" }>;
  onChange: (next: FeeFormula) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <FormulaSubField label="Basis">
        <CellInput
          value={value.basis}
          onChange={(v) => onChange({ ...value, basis: String(v) })}
          placeholder="e.g. construction valuation"
        />
      </FormulaSubField>
      <FormulaSubField label="Rate (%)">
        <CellInput
          type="number"
          value={value.rate}
          onChange={(v) => onChange({ ...value, rate: Number(v) || 0 })}
          step={0.1} min={0} suffix="%"
          fontSize={12}
        />
      </FormulaSubField>
      <FormulaSubField label="Min fee">
        <CellInput
          type="currency"
          value={value.minFee ?? ""}
          onChange={(v) => onChange({ ...value, minFee: v === "" ? undefined : Number(v) })}
          prefix="$" placeholder="(none)"
          fontSize={12}
        />
      </FormulaSubField>
      <FormulaSubField label="Max fee">
        <CellInput
          type="currency"
          value={value.maxFee ?? ""}
          onChange={(v) => onChange({ ...value, maxFee: v === "" ? undefined : Number(v) })}
          prefix="$" placeholder="(none)"
          fontSize={12}
        />
      </FormulaSubField>
    </div>
  );
}

function PerUnitFields({
  value, onChange,
}: {
  value: Extract<FeeFormula, { kind: "per-unit" }>;
  onChange: (next: FeeFormula) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <FormulaSubField label="Unit">
        <CellInput
          value={value.unit}
          onChange={(v) => onChange({ ...value, unit: String(v) })}
          placeholder="e.g. linear foot"
        />
      </FormulaSubField>
      <FormulaSubField label="Rate">
        <CellInput
          type="currency"
          value={value.rate}
          onChange={(v) => onChange({ ...value, rate: Number(v) || 0 })}
          prefix="$"
          fontSize={12}
        />
      </FormulaSubField>
      <FormulaSubField label="Min fee">
        <CellInput
          type="currency"
          value={value.minFee ?? ""}
          onChange={(v) => onChange({ ...value, minFee: v === "" ? undefined : Number(v) })}
          prefix="$" placeholder="(none)"
          fontSize={12}
        />
      </FormulaSubField>
    </div>
  );
}

function ExpressionFields({
  value, onChange,
}: {
  value: Extract<FeeFormula, { kind: "expression" }>;
  onChange: (next: FeeFormula) => void;
}) {
  return (
    <textarea
      value={value.text}
      onChange={(e) => onChange({ ...value, text: e.target.value })}
      onClick={(e) => e.stopPropagation()}
      placeholder="e.g. greater of $500 or 0.5% of valuation"
      rows={2}
      style={{
        width: "100%", resize: "vertical",
        padding: "4px 6px", fontSize: 12, lineHeight: 1.4,
        fontFamily: "inherit", color: "var(--ink)",
        background: "var(--paper-2)", border: "1px solid var(--rule)",
        outline: "none",
      }}
    />
  );
}

/** Tiny label+value row used inside FormulaEditor's kind-specific blocks.
 *  Narrower label column than the outer FeeMetadataPanel's Field so the
 *  editor reads as a sub-form, not a peer of the metadata fields. */
function FormulaSubField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 8, alignItems: "baseline" }}>
      <span className="mono" style={{
        fontSize: "var(--t-l9)", letterSpacing: "0.04em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>{label}</span>
      <div>{children}</div>
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

/** PR-M1: read-only summary for service.peerSurvey on the Services
 *  drilldown. The editor itself lives on the Fee Benchmark page now —
 *  per-agency peer rows are conceptually a benchmark concern, not a
 *  service-catalog concern, and entering them where you can see the
 *  median / variance refresh in real time is the better workflow. */
function PeerSurveyStub({ serviceId, count }: { serviceId: string; count: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
      <span style={{ color: count > 0 ? "var(--ink-2)" : "var(--ink-4)" }}>
        {count > 0 ? `${count} agency value${count === 1 ? "" : "s"}` : "(no entries)"}
      </span>
      <Link
        to="/build/benchmark"
        search={{ serviceId }}
        onClick={(e) => e.stopPropagation()}
        style={{
          fontSize: "var(--t-l8)", color: "var(--accent)",
          textDecoration: "underline", textUnderlineOffset: 3,
        }}
      >Edit in Fee Benchmark →</Link>
    </span>
  );
}
