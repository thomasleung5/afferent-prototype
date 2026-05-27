/* Shared functional-bucket support panel used inside the Cost of
 * Service drilldowns (both the per-service row and the per-department
 * RateDerivation row). Renders the dept's functional buckets with
 * Direct Labor / Operating / Overhead splits, the Recoverable Cost
 * Pool and Rate Basis Hours subtotals, and the FBHR equation block.
 *
 * Data source: derived.functionalAllocation (PR-FA). Per-bucket cost
 * components are split from the dept's engine-derived dollar totals by
 * the bucket's hoursSharePct — the same split rule used inside
 * deriveFunctionalAllocation. */

import { fmt } from "@/lib/format";
import type { DeptCode } from "@/lib/types";
import { useBuildState } from "@/lib/store";

interface Props {
  dept: DeptCode;
  /** When provided, the equation block adds a "Service cost" line
   *  computed as `serviceHours × FBHR`. Omit for the dept-level
   *  drilldown where this isn't applicable. */
  service?: {
    name: string;
    hours: number;
  };
}

export function FunctionalBucketSupport({ dept, service }: Props) {
  const { derived } = useBuildState();
  const fa = derived.functionalAllocation;
  const engine = derived.fbhr[dept];
  const dd = fa.byDept[dept];

  if (!dd) {
    return (
      <div style={{
        padding: "12px 14px",
        background: "var(--paper)", border: "1px solid var(--rule)",
        fontSize: 12, color: "var(--ink-3)",
      }}>
        No functional allocation configured for this department.
      </div>
    );
  }

  // Per-bucket cost splits, sized by hoursSharePct against the dept's
  // engine-derived dollar totals. Mirrors deriveFunctionalAllocation's
  // share rule so totals reconcile to dept fully-burdened cost when
  // shares sum to 100%.
  const supportRows = dd.buckets.map((b) => {
    const share = b.bucket.hoursSharePct / 100;
    return {
      id: b.bucket.id,
      name: b.bucket.name,
      directLabor: engine.directDollars * share,
      operating:   engine.operatingDollars * share,
      overhead:    engine.capDollars * share,
      fullyBurdened: b.fullyBurdenedCost,
      recoverabilityPct: b.bucket.recoverabilityPct,
      directHours: b.directHours,
      rateBasis: b.bucket.rateBasisHours,
    };
  });

  const recoverableFbhr = dd.recoverableFbhr;

  // Sums across the rendered rows so the totals row reconciles
  // exactly to what the user sees in the table. When Σ allocation
  // share = 100% these match the dept's engine totals; otherwise
  // they're proportionally scaled.
  const sum = (key: keyof Pick<SupportRow, "directLabor" | "operating" | "overhead" | "fullyBurdened" | "directHours">) =>
    supportRows.reduce((a, r) => a + r[key], 0);
  const totals = {
    directLabor: sum("directLabor"),
    operating: sum("operating"),
    overhead: sum("overhead"),
    fullyBurdened: sum("fullyBurdened"),
    directHours: sum("directHours"),
    rateBasisHours: dd.rateBasisDirectHours,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <BucketSupportTable rows={supportRows} totals={totals}/>
      <EquationBlock
        recoverableCost={dd.recoverableCost}
        rateBasisHours={dd.rateBasisDirectHours}
        recoverableFbhr={recoverableFbhr}
        service={service}
      />
    </div>
  );
}

interface SupportRow {
  id: string;
  name: string;
  directLabor: number;
  operating: number;
  overhead: number;
  fullyBurdened: number;
  recoverabilityPct: number;
  directHours: number;
  rateBasis: boolean;
}

function BucketSupportTable({
  rows, totals,
}: {
  rows: SupportRow[];
  totals: {
    directLabor: number;
    operating: number;
    overhead: number;
    fullyBurdened: number;
    directHours: number;
    rateBasisHours: number;
  };
}) {
  const cols: { key: keyof SupportRow | "rateBasisFlag"; label: string; width: string; align?: "left" | "right" }[] = [
    { key: "name",              label: "Functional bucket", width: "minmax(160px, 1.6fr)" },
    { key: "directLabor",       label: "Direct labor",      width: "100px", align: "right" },
    { key: "operating",         label: "Operating",         width: "100px", align: "right" },
    { key: "overhead",          label: "Overhead",          width: "100px", align: "right" },
    { key: "fullyBurdened",     label: "Fully burdened",    width: "120px", align: "right" },
    { key: "recoverabilityPct", label: "Recovery %",        width: "90px",  align: "right" },
    { key: "directHours",       label: "Direct hours",      width: "110px", align: "right" },
    { key: "rateBasisFlag",     label: "Rate basis hrs",    width: "110px", align: "right" },
  ];
  const grid = cols.map((c) => c.width).join(" ");

  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule)",
      fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.4,
    }}>
      <div style={{
        display: "grid", gridTemplateColumns: grid, gap: 10,
        padding: "8px 12px",
        borderBottom: "1px solid var(--rule)",
        background: "var(--paper-2)",
        fontSize: "var(--t-l4)", fontWeight: 600, letterSpacing: "0.08em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>
        {cols.map((c) => (
          <div key={c.key} style={{ textAlign: c.align ?? "left" }}>{c.label}</div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "12px", color: "var(--ink-3)", textAlign: "center" }}>
          No functional buckets.
        </div>
      ) : rows.map((r, i) => (
        <div
          key={r.id}
          style={{
            display: "grid", gridTemplateColumns: grid, gap: 10,
            padding: "7px 12px", alignItems: "baseline",
            borderBottom: i < rows.length - 1 ? "1px solid var(--rule)" : undefined,
            color: "var(--ink-2)",
          }}
        >
          <span style={{ color: "var(--ink)" }}>{r.name}</span>
          <span style={{ textAlign: "right" }}>{fmt.dollarsK(r.directLabor)}</span>
          <span style={{ textAlign: "right" }}>{fmt.dollarsK(r.operating)}</span>
          <span style={{ textAlign: "right" }}>{fmt.dollarsK(r.overhead)}</span>
          <span style={{ textAlign: "right", color: "var(--ink)" }}>
            {fmt.dollarsK(r.fullyBurdened)}
          </span>
          <span style={{ textAlign: "right" }}>{r.recoverabilityPct}%</span>
          <span style={{ textAlign: "right", color: r.directHours > 0 ? "var(--ink)" : "var(--ink-3)" }}>
            {r.directHours > 0 ? fmt.int(r.directHours) : "—"}
          </span>
          <span style={{
            textAlign: "right",
            color: r.rateBasis ? "var(--accent)" : "var(--ink-3)",
            fontWeight: r.rateBasis ? 700 : 400,
          }}>
            {r.rateBasis ? "✓" : "—"}
          </span>
        </div>
      ))}

      <div style={{
        display: "grid", gridTemplateColumns: grid, gap: 10,
        padding: "10px 12px",
        borderTop: "2px solid var(--ink)",
        background: "var(--paper-2)",
        alignItems: "baseline",
        color: "var(--ink)", fontWeight: 700,
      }}>
        <span style={{
          fontSize: "var(--t-l4)", letterSpacing: "0.06em",
          textTransform: "uppercase", color: "var(--ink-3)",
        }}>
          Total
        </span>
        <span style={{ textAlign: "right" }}>{fmt.dollarsK(totals.directLabor)}</span>
        <span style={{ textAlign: "right" }}>{fmt.dollarsK(totals.operating)}</span>
        <span style={{ textAlign: "right" }}>{fmt.dollarsK(totals.overhead)}</span>
        <span style={{ textAlign: "right" }}>{fmt.dollarsK(totals.fullyBurdened)}</span>
        <span/>
        <span style={{ textAlign: "right" }}>
          {totals.directHours > 0 ? fmt.int(totals.directHours) : "—"}
        </span>
        <span style={{ textAlign: "right" }}>
          {totals.rateBasisHours > 0 ? fmt.int(totals.rateBasisHours) : "—"}
        </span>
      </div>
    </div>
  );
}

function EquationBlock({
  recoverableCost, rateBasisHours, recoverableFbhr, service,
}: {
  recoverableCost: number;
  rateBasisHours: number;
  recoverableFbhr: number | null;
  service?: { name: string; hours: number };
}) {
  const fbhrLabel = recoverableFbhr != null
    ? `$${Math.round(recoverableFbhr)}/hr`
    : "—";
  const serviceCost = service && recoverableFbhr != null
    ? service.hours * recoverableFbhr
    : null;

  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule)",
      padding: "12px 14px",
      fontFamily: "var(--ff-mono)", fontSize: 12.5, lineHeight: 1.6,
    }}>
      <Line label="Recoverable cost pool" value={fmt.dollars(recoverableCost)}/>
      <Divider char="÷"/>
      <Line label="Rate basis hours" value={rateBasisHours > 0 ? fmt.int(rateBasisHours) : "0"}/>
      <Divider char="="/>
      <Line label="FBHR" value={fbhrLabel} highlight/>

      {service && (
        <>
          <div style={{ height: 6 }}/>
          <div style={{ borderTop: "1px dashed var(--rule)", paddingTop: 8 }}>
            <Line label={`${service.hours} hrs × FBHR`} value="" muted/>
            <Divider char="="/>
            <Line
              label={`Service cost — ${service.name}`}
              value={serviceCost != null ? fmt.dollars(serviceCost) : "—"}
              highlight
            />
          </div>
        </>
      )}
    </div>
  );
}

function Line({
  label, value, highlight = false, muted = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12,
    }}>
      <span style={{
        fontSize: "var(--t-l4)", letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: muted ? "var(--ink-3)" : highlight ? "var(--ink-3)" : "var(--ink-3)",
        fontWeight: 600,
      }}>{label}</span>
      <span style={{
        color: muted ? "var(--ink-3)" : highlight ? "var(--accent)" : "var(--ink)",
        fontWeight: highlight ? 700 : 600,
        fontVariantNumeric: "tabular-nums",
      }}>{value}</span>
    </div>
  );
}

function Divider({ char }: { char: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "center",
      color: "var(--ink-3)", fontSize: 13, lineHeight: 1, padding: "2px 0",
    }}>
      {char}
    </div>
  );
}
