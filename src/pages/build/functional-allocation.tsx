import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { DeptSummaryTable, type DeptSummaryRow } from "@/components/table";
import {
  CellInput, DeptChip, NodeEyebrow, SectionLabel,
} from "@/components/ui";
import { ExpandIndicator } from "@/components/ui/ExpandIndicator";
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
  "Functional Allocation classifies departmental activities into " +
  "fee-recoverable and non-recoverable work after overhead allocation. " +
  "This determines the recoverable FBHR used in fee calculations.";

export default function FunctionalAllocationPage() {
  const {
    derived, functionalAllocation, useFunctionalAllocationFbhr,
  } = useBuildState();
  const fa = derived.functionalAllocation;
  const { setUseFunctionalAllocationFbhr } = useBuildActions((s) => ({
    setUseFunctionalAllocationFbhr: s.setUseFunctionalAllocationFbhr,
  }));

  const activeDepts = ORDER.filter((d) => fa.byDept[d] != null);
  const totalFully = activeDepts.reduce(
    (a, d) => a + (fa.byDept[d]?.fullyBurdenedCost ?? 0), 0,
  );
  const totalRecoverable = activeDepts.reduce(
    (a, d) => a + (fa.byDept[d]?.recoverableCost ?? 0), 0,
  );
  const totalNonRecoverable = totalFully - totalRecoverable;

  const deptRows: DeptSummaryRow[] = activeDepts.map((d) => {
    const dd = fa.byDept[d]!;
    const engineFbhr = derived.fbhr[d]?.fbhr ?? 0;
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
        nonRecCost: fmt.dollarsK(dd.nonRecoverableCost),
        recovery: `${Math.round(dd.weightedRecoverabilityPct)}%`,
        engineFbhr: engineFbhr > 0 ? `$${Math.round(engineFbhr)}` : "—",
        impliedFbhr: dd.impliedFbhr != null
          ? <b style={{ color: "var(--accent)" }}>${Math.round(dd.impliedFbhr)}</b>
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

      <ExplainerCard
        useFunctionalAllocationFbhr={useFunctionalAllocationFbhr}
        setUseFunctionalAllocationFbhr={setUseFunctionalAllocationFbhr}
      />

      <SectionLabel right={`${fmt.dollarsK(totalFully)} fully burdened · ${fmt.dollarsK(totalRecoverable)} recoverable · ${fmt.dollarsK(totalNonRecoverable)} non-recoverable`}>
        Summary by department
      </SectionLabel>
      <DeptSummaryTable
        cols={[
          { key: "dept",        label: "Department",         width: "1.4fr" },
          { key: "fully",       label: "Fully burdened",     width: "140px", align: "right", mono: true },
          { key: "recCost",     label: "Recoverable",        width: "140px", align: "right", mono: true },
          { key: "nonRecCost",  label: "Non-recoverable",    width: "140px", align: "right", mono: true },
          { key: "recovery",    label: "Recovery %",         width: "100px", align: "right", mono: true },
          { key: "engineFbhr",  label: "Engine FBHR",        width: "110px", align: "right", mono: true },
          { key: "impliedFbhr", label: "Implied FBHR",       width: "120px", align: "right", mono: true },
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
          nonRecCost: fmt.dollarsK(totalNonRecoverable),
          recovery: totalFully > 0 ? `${Math.round((totalRecoverable / totalFully) * 100)}%` : "—",
          engineFbhr: "—",
          impliedFbhr: "—",
        }}
      />

      <div style={{ marginTop: 28 }}>
        <SectionLabel right={`${functionalAllocation.length} bucket${functionalAllocation.length === 1 ? "" : "s"}`}>
          Functional buckets
        </SectionLabel>
        <BucketTable/>
      </div>
    </Page>
  );
}

function ExplainerCard({
  useFunctionalAllocationFbhr, setUseFunctionalAllocationFbhr,
}: {
  useFunctionalAllocationFbhr: boolean;
  setUseFunctionalAllocationFbhr: (on: boolean) => void;
}) {
  return (
    <div style={{
      marginTop: 4, marginBottom: 16,
      padding: "12px 14px",
      background: "var(--paper-2)", border: "1px solid var(--rule)",
      display: "flex", alignItems: "flex-start", gap: 16,
    }}>
      <div style={{
        fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55, flex: 1, minWidth: 0,
      }}>
        <div style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>
          How this fits in the model
        </div>
        Functional Allocation is the bridge between fully burdened
        departmental cost (after overhead allocation) and the recoverable
        cost pools used to compute FBHR. Cost is split across buckets in
        proportion to each bucket&apos;s direct hours; the dept&apos;s
        implied FBHR = fully burdened cost &divide; recoverable hours.
        This is intentionally distinct from CAP pools, which distribute
        shared support cost into departments.
      </div>
      <label style={{
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
        fontSize: 12.5, color: "var(--ink-2)", cursor: "pointer",
        userSelect: "none",
      }}>
        <input
          type="checkbox"
          checked={useFunctionalAllocationFbhr}
          onChange={(e) => setUseFunctionalAllocationFbhr(e.currentTarget.checked)}
          style={{ accentColor: "var(--accent)" }}
        />
        <span style={{
          fontWeight: 600,
          color: useFunctionalAllocationFbhr ? "var(--accent)" : "var(--ink-2)",
        }}>
          Use implied FBHR for Cost of Service
        </span>
      </label>
    </div>
  );
}

function BucketTable() {
  const { derived } = useBuildState();
  const fa = derived.functionalAllocation;
  const [openId, setOpenId] = useState<string | null>(null);

  const cols: { key: string; label: string; width: string; align?: "left" | "right"; mono?: boolean }[] = [
    { key: "name",        label: "Bucket",            width: "1.6fr" },
    { key: "dept",        label: "Dept",              width: "80px" },
    { key: "recPct",      label: "Recoverability %",  width: "130px", align: "right", mono: true },
    { key: "fully",       label: "Fully burdened",    width: "140px", align: "right", mono: true },
    { key: "recCost",     label: "Recoverable",       width: "140px", align: "right", mono: true },
    { key: "nonRecCost",  label: "Non-recoverable",   width: "140px", align: "right", mono: true },
    { key: "directHours", label: "Direct hours",      width: "130px", align: "right", mono: true },
    { key: "recHours",    label: "Recoverable hours", width: "150px", align: "right", mono: true },
    { key: "fbhr",        label: "FBHR",              width: "100px", align: "right", mono: true },
  ];
  const grid = `${cols.map((c) => c.width).join(" ")} 36px`;

  const ordered = ORDER.flatMap((d) => fa.byDept[d]?.buckets ?? []);

  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}>
      <div style={{
        display: "grid", gridTemplateColumns: grid, columnGap: 20,
        padding: "9px 16px",
        borderBottom: "1px solid var(--rule)",
        background: "var(--paper-2)",
        fontFamily: "var(--ff-mono)",
        fontSize: "var(--t-l4)", fontWeight: 600, letterSpacing: "0.08em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>
        {cols.map((c) => (
          <div key={c.key} style={{ textAlign: c.align ?? "left" }}>{c.label}</div>
        ))}
        <div/>
      </div>

      {ordered.map((b, i) => (
        <BucketRow
          key={b.bucket.id}
          row={b}
          dept={fa.byDept[b.bucket.dept]!}
          grid={grid}
          isLast={i === ordered.length - 1}
          isOpen={openId === b.bucket.id}
          onToggle={() => setOpenId((cur) => cur === b.bucket.id ? null : b.bucket.id)}
        />
      ))}

      {ordered.length === 0 && (
        <div style={{
          padding: "20px 16px", color: "var(--ink-3)", fontSize: 13,
          textAlign: "center",
        }}>
          No functional buckets configured yet.
        </div>
      )}
    </div>
  );
}

function BucketRow({
  row, dept, grid, isLast, isOpen, onToggle,
}: {
  row: FunctionalAllocationBucketDerived;
  dept: FunctionalAllocationDeptDerived;
  grid: string;
  isLast: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const { updateFunctionalAllocation } = useBuildActions((s) => ({
    updateFunctionalAllocation: s.updateFunctionalAllocation,
  }));
  const b = row.bucket;

  return (
    <div style={{ borderBottom: isLast && !isOpen ? "none" : "1px solid var(--rule)" }}>
      <div
        onClick={onToggle}
        style={{
          display: "grid", gridTemplateColumns: grid, columnGap: 20,
          padding: "10px 16px", alignItems: "baseline",
          fontSize: "var(--fs-ui)", color: "var(--ink)",
          background: isOpen ? "var(--paper-2)" : "transparent",
          cursor: "pointer",
        }}
      >
        <div
          style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <CellInput
            value={b.name}
            onChange={(v) => {
              const next = String(v).trim();
              if (next && next !== b.name) updateFunctionalAllocation(b.id, { name: next });
            }}
          />
          {b.description && (
            <span style={{
              fontSize: "var(--t-l4)", color: "var(--ink-3)", lineHeight: 1.45,
            }}>{b.description}</span>
          )}
        </div>
        <div>
          <DeptChip code={b.dept}/>
        </div>
        <div onClick={(e) => e.stopPropagation()} style={{ textAlign: "right" }}>
          <CellInput
            type="number"
            value={b.recoverabilityPct}
            min={0}
            max={100}
            step={5}
            align="right"
            suffix="%"
            onChange={(v) => updateFunctionalAllocation(b.id, {
              recoverabilityPct: clampPct(Number(v)),
            })}
          />
        </div>
        <div className="num" style={{ textAlign: "right", fontFamily: "var(--ff-mono)" }}>
          {fmt.dollarsK(row.fullyBurdenedCost)}
        </div>
        <div className="num" style={{ textAlign: "right", fontFamily: "var(--ff-mono)" }}>
          {fmt.dollarsK(row.recoverableCost)}
        </div>
        <div className="num" style={{
          textAlign: "right", fontFamily: "var(--ff-mono)",
          color: row.nonRecoverableCost > 0 ? "var(--ink-2)" : "var(--ink-3)",
        }}>
          {fmt.dollarsK(row.nonRecoverableCost)}
        </div>
        <div onClick={(e) => e.stopPropagation()} style={{ textAlign: "right" }}>
          <CellInput
            type="integer"
            value={b.directHours}
            min={0}
            align="right"
            onChange={(v) => updateFunctionalAllocation(b.id, {
              directHours: Math.max(0, Number(v) || 0),
            })}
          />
        </div>
        <div className="num" style={{
          textAlign: "right", fontFamily: "var(--ff-mono)",
          color: row.recoverableHours > 0 ? "var(--ink)" : "var(--ink-3)",
        }}>
          {row.recoverableHours > 0 ? fmt.int(row.recoverableHours) : "—"}
        </div>
        <div className="num" style={{
          textAlign: "right", fontFamily: "var(--ff-mono)",
          color: row.impliedFbhr > 0 ? "var(--ink)" : "var(--ink-3)",
        }}>
          {row.impliedFbhr > 0 ? `$${Math.round(row.impliedFbhr)}` : "—"}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
          <ExpandIndicator open={isOpen}/>
        </div>
      </div>

      {isOpen && (
        <BucketDrilldown row={row} dept={dept}/>
      )}
    </div>
  );
}

/** Show the labor / operating / CAP contribution that's split into this
 *  bucket — the three pieces of the dept's fully burdened cost, weighted
 *  by the bucket's hour share. Plus a notes editor. */
function BucketDrilldown({
  row, dept,
}: {
  row: FunctionalAllocationBucketDerived;
  dept: FunctionalAllocationDeptDerived;
}) {
  const { updateFunctionalAllocation } = useBuildActions((s) => ({
    updateFunctionalAllocation: s.updateFunctionalAllocation,
  }));
  const { derived } = useBuildState();
  const fbhr = derived.fbhr[row.bucket.dept];
  const b = row.bucket;
  // Bucket's share of the dept's fully burdened cost. Mirrors the split
  // rule in lib/functionalAllocation.ts so display reconciles to the
  // top-of-row "Fully burdened" column.
  const share = dept.fullyBurdenedCost > 0
    ? row.fullyBurdenedCost / dept.fullyBurdenedCost
    : 0;
  const laborContribution = (fbhr?.directDollars ?? 0) * share;
  const operatingContribution = (fbhr?.operatingDollars ?? 0) * share;
  const capContribution = (fbhr?.capDollars ?? 0) * share;

  return (
    <div style={{
      padding: "12px 16px 16px",
      background: "var(--paper-2)",
      borderTop: "1px dashed var(--rule)",
    }}>
      <div className="mono" style={{
        fontSize: "var(--t-l4)", fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 8,
      }}>
        Cost composition
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 130px 100px 130px",
        columnGap: 16, rowGap: 6,
        fontSize: 12, color: "var(--ink-2)",
      }}>
        <div style={{ color: "var(--ink-3)" }}>Source</div>
        <div className="num" style={{ textAlign: "right", color: "var(--ink-3)" }}>Dept total</div>
        <div className="num" style={{ textAlign: "right", color: "var(--ink-3)" }}>Share</div>
        <div className="num" style={{ textAlign: "right", color: "var(--ink-3)" }}>This bucket</div>

        <div>Direct labor (salaries + benefits)</div>
        <div className="num" style={{ textAlign: "right" }}>{fmt.dollarsK(fbhr?.directDollars ?? 0)}</div>
        <div className="num" style={{ textAlign: "right" }}>{Math.round(share * 100)}%</div>
        <div className="num" style={{ textAlign: "right", fontWeight: 600 }}>{fmt.dollarsK(laborContribution)}</div>

        <div>Departmental operating</div>
        <div className="num" style={{ textAlign: "right" }}>{fmt.dollarsK(fbhr?.operatingDollars ?? 0)}</div>
        <div className="num" style={{ textAlign: "right" }}>{Math.round(share * 100)}%</div>
        <div className="num" style={{ textAlign: "right", fontWeight: 600 }}>{fmt.dollarsK(operatingContribution)}</div>

        <div>Allocated overhead (CAP)</div>
        <div className="num" style={{ textAlign: "right" }}>{fmt.dollarsK(fbhr?.capDollars ?? 0)}</div>
        <div className="num" style={{ textAlign: "right" }}>{Math.round(share * 100)}%</div>
        <div className="num" style={{ textAlign: "right", fontWeight: 600 }}>{fmt.dollarsK(capContribution)}</div>

        <div style={{ color: "var(--ink-3)", borderTop: "1px solid var(--rule)", paddingTop: 4 }}>
          Bucket fully burdened cost
        </div>
        <div/>
        <div/>
        <div className="num" style={{
          textAlign: "right", fontWeight: 700, color: "var(--ink)",
          borderTop: "1px solid var(--rule)", paddingTop: 4,
        }}>
          {fmt.dollarsK(row.fullyBurdenedCost)}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="mono" style={{
          fontSize: "var(--t-l4)", fontWeight: 600, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 6,
        }}>
          Notes
        </div>
        <CellInput
          value={b.notes ?? ""}
          placeholder="Analyst notes for this bucket"
          onChange={(v) => {
            const next = String(v);
            const patch = next.trim() === ""
              ? { notes: undefined }
              : { notes: next };
            updateFunctionalAllocation(b.id, patch);
          }}
        />
      </div>
    </div>
  );
}

function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}
