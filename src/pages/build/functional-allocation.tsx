import { Page, PageHeader } from "@/components/layout";
import { DeptSummaryTable, type DeptSummaryRow } from "@/components/table";
import { DeptChip, NodeEyebrow, SectionLabel } from "@/components/ui";
import { useBuildState } from "@/lib/store";
import { fmt } from "@/lib/format";
import { deptName, FEE_DEPTS } from "@/lib/data/departments";
import type { DeptCode } from "@/lib/types";

const ORDER: DeptCode[] = FEE_DEPTS;

const HELPER_TEXT =
  "Functional Allocation classifies departmental activities into " +
  "fee-recoverable and non-recoverable work after overhead allocation. " +
  "This determines the recoverable FBHR used in fee calculations.";

export default function FunctionalAllocationPage() {
  const { derived, functionalAllocation, useFunctionalAllocationFbhr } = useBuildState();
  const fa = derived.functionalAllocation;

  const activeDepts = ORDER.filter((d) => fa.byDept[d] != null);

  // Citywide tile totals.
  const totalFully = activeDepts.reduce(
    (a, d) => a + (fa.byDept[d]?.fullyBurdenedCost ?? 0), 0,
  );
  const totalRecoverable = activeDepts.reduce(
    (a, d) => a + (fa.byDept[d]?.recoverableCost ?? 0), 0,
  );
  const totalNonRecoverable = totalFully - totalRecoverable;

  // Per-dept summary rows (top section).
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

      <div style={{
        marginTop: 4, marginBottom: 16,
        padding: "10px 14px",
        background: "var(--paper-2)", border: "1px solid var(--rule)",
        fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55,
      }}>
        <span style={{ fontWeight: 600 }}>How this fits in the model. </span>
        Functional Allocation is the bridge between fully burdened
        departmental cost (after overhead allocation) and the recoverable
        cost pools used to compute FBHR. Cost is split across buckets in
        proportion to each bucket&apos;s direct hours; the dept&apos;s
        implied FBHR = fully burdened cost &divide; recoverable hours.
        This is intentionally distinct from CAP pools, which distribute
        shared support cost into departments.{" "}
        {useFunctionalAllocationFbhr ? (
          <span style={{ color: "var(--accent)", fontWeight: 600 }}>
            Implied FBHR is currently driving Cost of Service math.
          </span>
        ) : (
          <span style={{ color: "var(--ink-3)" }}>
            Implied FBHR is informational only — the engine FBHR continues
            to drive Cost of Service until the toggle is enabled.
          </span>
        )}
      </div>

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

function BucketTable() {
  const { derived } = useBuildState();
  const fa = derived.functionalAllocation;

  const cols: { key: string; label: string; width: string; align?: "left" | "right"; mono?: boolean }[] = [
    { key: "name",        label: "Bucket",            width: "1.6fr" },
    { key: "dept",        label: "Dept",              width: "80px" },
    { key: "recPct",      label: "Recoverability %",  width: "120px", align: "right", mono: true },
    { key: "fully",       label: "Fully burdened",    width: "140px", align: "right", mono: true },
    { key: "recCost",     label: "Recoverable",       width: "140px", align: "right", mono: true },
    { key: "nonRecCost",  label: "Non-recoverable",   width: "140px", align: "right", mono: true },
    { key: "directHours", label: "Direct hours",      width: "120px", align: "right", mono: true },
    { key: "recHours",    label: "Recoverable hours", width: "140px", align: "right", mono: true },
    { key: "fbhr",        label: "FBHR",              width: "100px", align: "right", mono: true },
  ];
  const grid = cols.map((c) => c.width).join(" ");

  // Flatten in dept order so the table reads the same as the seed.
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
      </div>

      {ordered.map((b, i) => (
        <div
          key={b.bucket.id}
          style={{
            display: "grid", gridTemplateColumns: grid, columnGap: 20,
            padding: "12px 16px", alignItems: "baseline",
            borderBottom: i === ordered.length - 1 ? "none" : "1px solid var(--rule)",
            fontSize: "var(--fs-ui)", color: "var(--ink)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontWeight: 500 }}>{b.bucket.name}</span>
            {b.bucket.description && (
              <span style={{
                fontSize: "var(--t-l4)", color: "var(--ink-3)", lineHeight: 1.45,
              }}>{b.bucket.description}</span>
            )}
          </div>
          <div>
            <DeptChip code={b.bucket.dept}/>
          </div>
          <div className="num" style={{ textAlign: "right", fontFamily: "var(--ff-mono)" }}>
            {b.bucket.recoverabilityPct}%
          </div>
          <div className="num" style={{ textAlign: "right", fontFamily: "var(--ff-mono)" }}>
            {fmt.dollarsK(b.fullyBurdenedCost)}
          </div>
          <div className="num" style={{ textAlign: "right", fontFamily: "var(--ff-mono)" }}>
            {fmt.dollarsK(b.recoverableCost)}
          </div>
          <div className="num" style={{
            textAlign: "right", fontFamily: "var(--ff-mono)",
            color: b.nonRecoverableCost > 0 ? "var(--ink-2)" : "var(--ink-3)",
          }}>
            {fmt.dollarsK(b.nonRecoverableCost)}
          </div>
          <div className="num" style={{
            textAlign: "right", fontFamily: "var(--ff-mono)",
            color: b.bucket.directHours > 0 ? "var(--ink)" : "var(--ink-3)",
          }}>
            {b.bucket.directHours > 0 ? fmt.int(b.bucket.directHours) : "—"}
          </div>
          <div className="num" style={{
            textAlign: "right", fontFamily: "var(--ff-mono)",
            color: b.recoverableHours > 0 ? "var(--ink)" : "var(--ink-3)",
          }}>
            {b.recoverableHours > 0 ? fmt.int(b.recoverableHours) : "—"}
          </div>
          <div className="num" style={{
            textAlign: "right", fontFamily: "var(--ff-mono)",
            color: b.impliedFbhr > 0 ? "var(--ink)" : "var(--ink-3)",
          }}>
            {b.impliedFbhr > 0 ? `$${Math.round(b.impliedFbhr)}` : "—"}
          </div>
        </div>
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
