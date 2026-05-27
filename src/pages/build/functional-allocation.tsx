import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import {
  DataTable, DeptSummaryTable,
  type Column, type DeptSummaryRow,
} from "@/components/table";
import {
  CellInput, DeptChip, DrilldownShell, DrilldownColumn,
  NodeEyebrow, SectionLabel,
} from "@/components/ui";
import { useBuildActions, useBuildState } from "@/lib/store";
import { fmt } from "@/lib/format";
import { deptName, FEE_DEPTS } from "@/lib/data/departments";
import type { DeptCode } from "@/lib/types";
import type {
  FunctionalAllocationBucketDerived,
  FunctionalAllocationDeptDerived,
} from "@/lib/functionalAllocation";

const ORDER: DeptCode[] = FEE_DEPTS;

const HELPER_TEXT =
  "Functional Allocation classifies fully burdened departmental " +
  "activity into fee-recoverable and non-recoverable work after " +
  "overhead allocation. Recoverable FBHR is derived from recoverable " +
  "costs and recoverable productive hours.";

interface BucketRow {
  id: string;
  derived: FunctionalAllocationBucketDerived;
  dept: FunctionalAllocationDeptDerived;
}

export default function FunctionalAllocationPage() {
  const { derived } = useBuildState();
  const fa = derived.functionalAllocation;

  const activeDepts = ORDER.filter((d) => fa.byDept[d] != null);
  const totalFully = activeDepts.reduce(
    (a, d) => a + (fa.byDept[d]?.fullyBurdenedCost ?? 0), 0,
  );
  const totalRecoverable = activeDepts.reduce(
    (a, d) => a + (fa.byDept[d]?.recoverableCost ?? 0), 0,
  );
  const totalSubsidized = totalFully - totalRecoverable;

  const deptRows: DeptSummaryRow[] = activeDepts.map((d) => {
    const dd = fa.byDept[d]!;
    return {
      key: d,
      cells: {
        dept: (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <DeptChip code={d}/>
            <span style={{ fontWeight: 500 }}>{deptName(d)}</span>
          </span>
        ),
        fully: fmt.dollarsK(dd.fullyBurdenedCost),
        recCost: fmt.dollarsK(dd.recoverableCost),
        subsidized: fmt.dollarsK(dd.nonRecoverableCost),
        recovery: dd.fullyBurdenedCost > 0
          ? `${Math.round((dd.recoverableCost / dd.fullyBurdenedCost) * 100)}%`
          : "—",
        recoverableFbhr: dd.recoverableFbhr != null
          ? <b style={{ color: "var(--accent)" }}>${Math.round(dd.recoverableFbhr)}</b>
          : <span style={{ color: "var(--ink-3)" }}>—</span>,
      },
    };
  });

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="functional"/>}
        title="Functional Allocation"
        subtitle={HELPER_TEXT}
      />

      <ExplainerCard/>

      <div>
        <SectionLabel right={`${fmt.dollarsK(totalRecoverable)} recoverable · ${fmt.dollarsK(totalSubsidized)} subsidized`}>
          Summary by department
        </SectionLabel>
        <DeptSummaryTable
          cols={[
            { key: "dept",            label: "Department",        width: "1.5fr" },
            { key: "fully",           label: "Fully burdened",    width: "140px", align: "right", mono: true },
            { key: "recCost",         label: "Recoverable",       width: "140px", align: "right", mono: true },
            { key: "subsidized",      label: "Subsidized",        width: "140px", align: "right", mono: true },
            { key: "recovery",        label: "Recovery %",        width: "110px", align: "right", mono: true },
            { key: "recoverableFbhr", label: "Recoverable FBHR",  width: "140px", align: "right", mono: true },
          ]}
          rows={deptRows}
          footer={{
            dept: (
              <span style={{
                color: "var(--ink-3)", textTransform: "uppercase",
                letterSpacing: "0.06em", fontSize: "var(--t-l8)",
              }}>Citywide</span>
            ),
            fully: fmt.dollarsK(totalFully),
            recCost: fmt.dollarsK(totalRecoverable),
            subsidized: fmt.dollarsK(totalSubsidized),
            recovery: totalFully > 0 ? `${Math.round((totalRecoverable / totalFully) * 100)}%` : "—",
            recoverableFbhr: "—",
          }}
        />
      </div>

      <BucketTable/>
    </Page>
  );
}

function ExplainerCard() {
  return (
    <div style={{
      marginTop: 4, marginBottom: 16,
      padding: "12px 14px",
      background: "var(--paper-2)", border: "1px solid var(--rule)",
      fontSize: 12, color: "var(--ink-2)", lineHeight: 1.55,
    }}>
      Department cost flows through allocation shares into functional
      buckets, where a fee-recoverable percentage determines the share
      absorbed by user fees vs. the General Fund. The Recoverable FBHR
      computed here drives Cost of Service downstream; departments
      without functional buckets continue to use the engine FBHR.
    </div>
  );
}

function BucketTable() {
  const { derived } = useBuildState();
  const fa = derived.functionalAllocation;
  const { updateFunctionalAllocation } = useBuildActions((s) => ({
    updateFunctionalAllocation: s.updateFunctionalAllocation,
  }));
  const [openId, setOpenId] = useState<string | undefined>();

  const rows: BucketRow[] = ORDER.flatMap((d) => {
    const dd = fa.byDept[d];
    if (!dd) return [];
    return dd.buckets.map((b) => ({
      id: b.bucket.id,
      derived: b,
      dept: dd,
    }));
  });

  // Per-dept rate-basis validation. A dept with no rate-basis buckets
  // can't compute Recoverable FBHR — surface the offending dept(s) so
  // the analyst knows why the rate is "—".
  const deptsMissingRateBasis = ORDER.filter((d) => {
    const dd = fa.byDept[d];
    if (!dd) return false;
    return dd.rateBasisDirectHours <= 0;
  });

  const cols: Column<BucketRow>[] = [
    {
      key: "dept",
      label: "Dept",
      width: "80px",
      sortable: true,
      sortKey: (r) => r.derived.bucket.dept,
      render: (r) => <DeptChip code={r.derived.bucket.dept}/>,
    },
    {
      key: "name",
      label: "Bucket",
      width: "minmax(220px, 2fr)",
      sortable: true,
      sortKey: (r) => r.derived.bucket.name,
      render: (r) => (
        <span style={{ fontWeight: 500 }}>{r.derived.bucket.name}</span>
      ),
    },
    {
      key: "allocationShare",
      label: "Allocation Share",
      width: "130px",
      align: "right",
      sortable: true,
      sortKey: (r) => r.derived.bucket.hoursSharePct,
      render: (r) => (
        <InlinePctInput
          value={r.derived.bucket.hoursSharePct}
          onCommit={(v) => updateFunctionalAllocation(r.derived.bucket.id, {
            hoursSharePct: v,
          })}
          dim
        />
      ),
    },
    {
      key: "feeRecoverable",
      label: "Fee Recoverable %",
      width: "140px",
      align: "right",
      sortable: true,
      sortKey: (r) => r.derived.bucket.recoverabilityPct,
      render: (r) => (
        <InlinePctInput
          value={r.derived.bucket.recoverabilityPct}
          onCommit={(v) => updateFunctionalAllocation(r.derived.bucket.id, {
            recoverabilityPct: v,
          })}
        />
      ),
    },
    {
      key: "rateBasis",
      label: "Rate Basis Hours",
      width: "130px",
      align: "center",
      sortable: true,
      sortKey: (r) => r.derived.bucket.rateBasisHours ? 1 : 0,
      render: (r) => (
        <RateBasisCheckbox
          checked={r.derived.bucket.rateBasisHours}
          onChange={(v) => updateFunctionalAllocation(r.derived.bucket.id, {
            rateBasisHours: v,
          })}
        />
      ),
    },
    {
      key: "fully",
      label: "Fully burdened",
      width: "130px",
      align: "right",
      sortable: true,
      sortKey: (r) => r.derived.fullyBurdenedCost,
      render: (r) => (
        <span className="num" style={{ fontVariantNumeric: "tabular-nums" }}>
          {fmt.dollarsK(r.derived.fullyBurdenedCost)}
        </span>
      ),
    },
    {
      key: "recoverable",
      label: "Recoverable",
      width: "130px",
      align: "right",
      sortable: true,
      sortKey: (r) => r.derived.recoverableCost,
      render: (r) => (
        <span className="num" style={{
          fontVariantNumeric: "tabular-nums",
          fontWeight: 600,
          color: r.derived.recoverableCost > 0 ? "var(--ink)" : "var(--ink-3)",
        }}>
          {fmt.dollarsK(r.derived.recoverableCost)}
        </span>
      ),
    },
    {
      key: "subsidized",
      label: "Subsidized",
      width: "130px",
      align: "right",
      sortable: true,
      sortKey: (r) => r.derived.nonRecoverableCost,
      render: (r) => (
        <span className="num" style={{
          fontVariantNumeric: "tabular-nums",
          color: r.derived.nonRecoverableCost > 0 ? "var(--ink-2)" : "var(--ink-3)",
        }}>
          {fmt.dollarsK(r.derived.nonRecoverableCost)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <SectionLabel>Functional buckets</SectionLabel>
      {deptsMissingRateBasis.length > 0 && (
        <div style={{
          marginBottom: 10,
          padding: "8px 12px",
          background: "var(--warn-tint)", border: "1px solid var(--warn)",
          fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.55,
        }}>
          <span className="mono" style={{
            color: "var(--warn)", fontWeight: 700, marginRight: 6,
          }}>NO RATE BASIS</span>
          {deptsMissingRateBasis.join(" · ")} {deptsMissingRateBasis.length === 1 ? "has" : "have"}{" "}
          no buckets flagged as Rate Basis Hours. Recoverable FBHR
          renders as &mdash; until at least one bucket per dept is
          selected.
        </div>
      )}
      <DataTable
        cols={cols}
        rows={rows}
        defaultSort={{ key: "fully", dir: "desc" }}
        openId={openId}
        onRowClick={(r) => setOpenId(openId === r.id ? undefined : r.id)}
        drilldownIndicator
        renderDrilldown={(r) => <BucketDrilldown row={r}/>}
        emptyState="No functional buckets configured yet."
      />
    </div>
  );
}

function BucketDrilldown({ row }: { row: BucketRow }) {
  const { updateFunctionalAllocation } = useBuildActions((s) => ({
    updateFunctionalAllocation: s.updateFunctionalAllocation,
  }));
  const { derived } = useBuildState();
  const b = row.derived.bucket;
  const dept = row.dept;
  const fbhr = derived.fbhr[b.dept];
  const engineFbhr = fbhr?.fbhr ?? 0;
  const recoverableDeptFbhr = dept.recoverableFbhr;

  // Bucket's share of dept fully burdened cost. Mirrors the split rule
  // in lib/functionalAllocation.ts; used for the cost-composition table.
  const share = dept.fullyBurdenedCost > 0
    ? row.derived.fullyBurdenedCost / dept.fullyBurdenedCost
    : 0;
  const laborContribution = (fbhr?.directDollars ?? 0) * share;
  const operatingContribution = (fbhr?.operatingDollars ?? 0) * share;
  const capContribution = (fbhr?.capDollars ?? 0) * share;

  return (
    <DrilldownShell>
      <DrilldownColumn marker="①" title="Hours">
        <FactList
          rows={[
            { label: "Direct hours", value: row.derived.directHours > 0 ? fmt.int(row.derived.directHours) : "—" },
          ]}
        />
        <div style={{ height: 14 }}/>
        <div className="mono" style={{
          fontSize: "var(--t-l9)", fontWeight: 700, letterSpacing: "0.12em",
          color: "var(--ink-3)", textTransform: "uppercase",
          marginBottom: 8,
        }}>FBHR comparison</div>
        <FactList
          rows={[
            { label: "Engine FBHR (dept)",      value: engineFbhr > 0 ? `$${Math.round(engineFbhr)}` : "—" },
            {
              label: "Recoverable FBHR (dept)",
              value: recoverableDeptFbhr != null
                ? <b style={{ color: "var(--accent)" }}>${Math.round(recoverableDeptFbhr)}</b>
                : "—",
            },
          ]}
        />
      </DrilldownColumn>

      <DrilldownColumn marker="②" title="Cost composition">
        <FactList
          rows={[
            { label: "Direct labor",        value: fmt.dollarsK(laborContribution) },
            { label: "Operating",           value: fmt.dollarsK(operatingContribution) },
            { label: "Allocated overhead",  value: fmt.dollarsK(capContribution) },
            {
              label: "Bucket fully burdened",
              value: <b>{fmt.dollarsK(row.derived.fullyBurdenedCost)}</b>,
              divider: true,
            },
          ]}
        />
      </DrilldownColumn>

      <DrilldownColumn marker="③" title="Notes & narrative">
        <div onClick={(e) => e.stopPropagation()}>
          <CellInput
            value={b.notes ?? ""}
            placeholder="Analyst notes for this bucket"
            onChange={(v) => {
              const next = String(v);
              updateFunctionalAllocation(b.id, {
                notes: next.trim() === "" ? undefined : next,
              });
            }}
          />
        </div>
        {b.description && (
          <div style={{
            marginTop: 12,
            fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.55,
          }}>
            {b.description}
          </div>
        )}
      </DrilldownColumn>
    </DrilldownShell>
  );
}

/** Inline %-input for the bucket row. Compact, muted-by-default
 *  (subtle bordered focus state from `CellInput`), suffix-marked with
 *  "%". Numbers clamp to [0,100] and commit on blur/Enter. */
function InlinePctInput({
  value, onCommit, dim = false,
}: {
  value: number;
  onCommit: (v: number) => void;
  dim?: boolean;
}) {
  return (
    <CellInput
      type="number"
      value={value}
      min={0}
      max={100}
      step={5}
      align="right"
      suffix="%"
      dim={dim}
      onChange={(v) => onCommit(clampPct(Number(v)))}
    />
  );
}

/** Compact rate-basis checkbox. Stops click propagation so toggling
 *  doesn't accidentally collapse / expand the row's drilldown. */
function RateBasisCheckbox({
  checked, onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <span
      onClick={(e) => e.stopPropagation()}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        style={{ accentColor: "var(--accent)", cursor: "pointer", margin: 0 }}
        aria-label="Rate basis hours"
      />
    </span>
  );
}

interface FactRow {
  label: string;
  value: React.ReactNode;
  divider?: boolean;
}

function FactList({ rows }: { rows: FactRow[] }) {
  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule)",
      fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.55,
    }}>
      {rows.map((r, i) => (
        <div
          key={r.label}
          style={{
            display: "flex", justifyContent: "space-between", gap: 12,
            padding: "7px 12px",
            borderTop: r.divider ? "2px solid var(--ink)" : undefined,
            borderBottom: i < rows.length - 1 && !rows[i + 1]?.divider
              ? "1px solid var(--rule)" : undefined,
            alignItems: "baseline",
          }}
        >
          <span style={{ color: "var(--ink-2)" }}>{r.label}</span>
          <span style={{
            color: "var(--ink)", fontVariantNumeric: "tabular-nums",
          }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}
