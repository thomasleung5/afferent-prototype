import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import {
  DataTable, DeptSummaryTable,
  type Column, type DeptSummaryRow,
} from "@/components/table";
import {
  CellInput, DeptChip, NodeEyebrow, SectionLabel,
} from "@/components/ui";
import { FunctionalBucketSupport } from "@/features/build/FunctionalBucketSupport";
import { useBuildActions, useBuildState } from "@/lib/store";
import { fmt } from "@/lib/format";
import { deptName, FEE_DEPTS } from "@/lib/data/departments";
import type { DeptCode, FunctionalAllocationBucket } from "@/lib/types";
import type {
  FunctionalAllocationBucketDerived,
  FunctionalAllocationDeptDerived,
} from "@/lib/functionalAllocation";

const ORDER: DeptCode[] = FEE_DEPTS;

const HELPER_TEXT =
  "Classify departmental cost into fee-recoverable activities and direct hours.";

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
  const totalDirectHours = activeDepts.reduce(
    (a, d) => a + (fa.byDept[d]?.directHours ?? 0), 0,
  );

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
        directHours: dd.directHours > 0 ? fmt.int(dd.directHours) : "—",
        recoverableFbhr: dd.recoverableFbhr != null
          ? <span style={{ color: "var(--accent)" }}>${Math.round(dd.recoverableFbhr)}</span>
          : <span style={{ color: "var(--ink-3)" }}>—</span>,
      },
      drilldown: (
        <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 12 }}>
          <FunctionalBucketSupport dept={d}/>
        </div>
      ),
    };
  });

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="functional"/>}
        title="Functional Allocation"
        subtitle={HELPER_TEXT}
      />

      <div>
        <SectionLabel right={`${fmt.dollarsK(totalRecoverable)} fee-recoverable of ${fmt.dollarsK(totalFully)}`}>
          Summary by department
        </SectionLabel>
        <DeptSummaryTable
          cols={[
            { key: "dept",            label: "Department",        width: "1.5fr" },
            { key: "fully",           label: "Total cost",        width: "140px", align: "right", mono: true },
            { key: "recCost",         label: "Fee-Recoverable Cost", width: "170px", align: "right", mono: true },
            { key: "directHours",     label: "Direct Hours",            width: "120px", align: "right", mono: true },
            { key: "recoverableFbhr", label: "FBHR",              width: "120px", align: "right", mono: true },
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
            directHours: totalDirectHours > 0 ? fmt.int(totalDirectHours) : "—",
            recoverableFbhr: "—",
          }}
        />
      </div>

      <BucketTable/>
    </Page>
  );
}

function BucketTable() {
  const { derived } = useBuildState();
  const fa = derived.functionalAllocation;
  const { updateFunctionalAllocation, addFunctionalAllocation } = useBuildActions((s) => ({
    updateFunctionalAllocation: s.updateFunctionalAllocation,
    addFunctionalAllocation: s.addFunctionalAllocation,
  }));
  // Shared open id so only one drilldown is expanded at a time across
  // the per-dept sections.
  const [openId, setOpenId] = useState<string | undefined>();

  const activeDepts = ORDER.filter((d) => fa.byDept[d] != null);

  // Per-dept rate-basis validation. A dept with no rate-basis buckets
  // can't compute FBHR — surface the offending dept(s) so the analyst
  // knows why the rate is "—".
  const deptsMissingRateBasis = activeDepts.filter((d) => {
    const dd = fa.byDept[d];
    return dd != null && dd.rateBasisDirectHours <= 0;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {deptsMissingRateBasis.length > 0 && (
        <div style={{
          padding: "8px 12px",
          background: "var(--warn-tint)", border: "1px solid var(--warn)",
          fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.55,
        }}>
          <span className="mono" style={{
            color: "var(--warn)", fontWeight: 700, marginRight: 6,
          }}>NO RATE BASIS</span>
          {deptsMissingRateBasis.join(" · ")} {deptsMissingRateBasis.length === 1 ? "has" : "have"}{" "}
          no activities included in FBHR. FBHR renders as &mdash;
          until at least one activity per dept is included.
        </div>
      )}

      {activeDepts.map((d) => (
        <DeptBucketSection
          key={d}
          dept={d}
          openId={openId}
          onToggleRow={(id) => setOpenId(openId === id ? undefined : id)}
          onUpdate={updateFunctionalAllocation}
          onAdd={() => addFunctionalAllocation(d)}
        />
      ))}
    </div>
  );
}

function DeptBucketSection({
  dept, openId, onToggleRow, onUpdate, onAdd,
}: {
  dept: DeptCode;
  openId?: string;
  onToggleRow: (id: string) => void;
  onUpdate: (id: string, patch: Partial<FunctionalAllocationBucket>) => void;
  onAdd: () => void;
}) {
  const { derived } = useBuildState();
  const dd = derived.functionalAllocation.byDept[dept];
  if (!dd) return null;

  const rows: BucketRow[] = dd.buckets.map((b) => ({
    id: b.bucket.id,
    derived: b,
    dept: dd,
  }));

  const sectionRight = `${rows.length} ${rows.length === 1 ? "activity" : "activities"}`;

  const cols: Column<BucketRow>[] = [
    {
      key: "name",
      label: "Activity",
      width: "minmax(220px, 2fr)",
      sortable: true,
      sortKey: (r) => r.derived.bucket.name,
      render: (r) => (
        <span style={{ fontWeight: 500 }}>{r.derived.bucket.name}</span>
      ),
    },
    {
      key: "totalCost",
      label: "Total Cost",
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
      label: "Fee-Recoverable Cost",
      width: "170px",
      align: "right",
      sortable: true,
      sortKey: (r) => r.derived.recoverableCost,
      render: (r) => (
        <span className="num" style={{
          fontVariantNumeric: "tabular-nums",
          color: r.derived.recoverableCost > 0 ? "var(--accent)" : "var(--ink-3)",
        }}>
          {fmt.dollarsK(r.derived.recoverableCost)}
        </span>
      ),
    },
    {
      key: "directHours",
      label: "Direct Hours",
      width: "120px",
      align: "right",
      sortable: true,
      sortKey: (r) => r.derived.directHours,
      render: (r) => {
        const included = r.derived.bucket.rateBasisHours;
        return (
          <span
            className="num"
            title={included
              ? "Included in FBHR"
              : "Excluded from FBHR"}
            style={{
              fontVariantNumeric: "tabular-nums",
              color: included && r.derived.directHours > 0 ? "var(--ink)" : "var(--ink-3)",
            }}
          >
            {r.derived.directHours > 0 ? fmt.int(r.derived.directHours) : "—"}
          </span>
        );
      },
    },
  ];

  // Σ allocation share so the analyst can see if a dept's buckets
  // reconcile to 100%. Totals row uses the same per-column sums that
  // already appear in the workpaper drilldown.
  const sumDirectHours = rows.reduce((a, r) => a + r.derived.directHours, 0);
  const sumTotalCost = rows.reduce((a, r) => a + r.derived.fullyBurdenedCost, 0);
  const sumRecoverable = rows.reduce((a, r) => a + r.derived.recoverableCost, 0);

  return (
    <div>
      <SectionLabel right={sectionRight}>
        <span style={{
          color: "var(--ink-3)", marginRight: 8,
          letterSpacing: "0.02em", fontWeight: 400, textTransform: "none",
        }}>{dept}</span>
        {deptName(dept)}
      </SectionLabel>
      <DataTable
        cols={cols}
        rows={rows}
        defaultSort={{ key: "totalCost", dir: "desc" }}
        openId={openId}
        onRowClick={(r) => onToggleRow(r.id)}
        drilldownIndicator
        renderDrilldown={(r) => (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <ActivityConfigPanel
              bucket={r.derived.bucket}
              onUpdate={onUpdate}
            />
            <FunctionalBucketSupport
              dept={r.derived.bucket.dept}
              bucketId={r.derived.bucket.id}
            />
          </div>
        )}
        emptyState="No activities configured for this department."
        footer={{
          name: (
            <span className="mono" style={{
              fontSize: "var(--t-l9)", letterSpacing: "0.1em",
              color: "var(--ink-3)", textTransform: "uppercase",
            }}>Total</span>
          ),
          directHours: (
            <span className="num" style={{ fontVariantNumeric: "tabular-nums" }}>
              {sumDirectHours > 0 ? fmt.int(sumDirectHours) : "—"}
            </span>
          ),
          totalCost: (
            <span className="num" style={{ fontVariantNumeric: "tabular-nums" }}>
              {fmt.dollarsK(sumTotalCost)}
            </span>
          ),
          recoverable: (
            <span className="num" style={{
              fontVariantNumeric: "tabular-nums",
              color: sumRecoverable > 0 ? "var(--accent)" : "var(--ink-3)",
            }}>
              {fmt.dollarsK(sumRecoverable)}
            </span>
          ),
        }}
        onAdd={onAdd}
        addLabel="Add activity"
      />
    </div>
  );
}

/** Compact methodology strip rendered above the cost-breakdown table
 *  in each activity drilldown. Hosts the three methodology inputs
 *  (Allocation %, Fee Recoverability %, Included in FBHR) that used
 *  to live as columns on the main table. Styled as a thin inline
 *  control row — secondary to the cost-breakdown table below. */
function ActivityConfigPanel({
  bucket, onUpdate,
}: {
  bucket: FunctionalAllocationBucket;
  onUpdate: (id: string, patch: Partial<FunctionalAllocationBucket>) => void;
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        display: "flex", flexWrap: "wrap", alignItems: "center",
        gap: "4px 18px",
        padding: "4px 2px",
        fontFamily: "var(--ff-mono)",
        fontSize: "var(--t-l4)", letterSpacing: "0.04em",
        color: "var(--ink-3)",
      }}
    >
      <ConfigField label="Allocation %">
        <InlinePctInput
          value={bucket.hoursSharePct}
          onCommit={(v) => onUpdate(bucket.id, { hoursSharePct: v })}
        />
      </ConfigField>
      <ConfigField label="Fee Recoverability %">
        <InlinePctInput
          value={bucket.recoverabilityPct}
          onCommit={(v) => onUpdate(bucket.id, { recoverabilityPct: v })}
        />
      </ConfigField>
      <ConfigField label="Included in FBHR">
        <RateBasisCheckbox
          checked={bucket.rateBasisHours}
          onChange={(v) => onUpdate(bucket.id, { rateBasisHours: v })}
        />
      </ConfigField>
    </div>
  );
}

function ConfigField({
  label, children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        textTransform: "uppercase",
      }}
    >
      <span>{label}</span>
      <span style={{
        textTransform: "none", letterSpacing: 0,
        fontFamily: "var(--ff-ui)", fontSize: "var(--fs-ui)",
        fontWeight: 400, color: "var(--ink)",
        minWidth: 90,
      }}>{children}</span>
    </label>
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
        aria-label="Included in FBHR"
      />
    </span>
  );
}

function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}
