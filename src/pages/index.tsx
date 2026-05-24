import { Link } from "@tanstack/react-router";
import { Page } from "@/components/layout";
import { Btn, Icon } from "@/components/ui";
import { useActiveJurisdiction } from "@/lib/active";
import { fmt } from "@/lib/format";
import { useBuildState } from "@/lib/store";
import { EntryCard } from "@/features/home/EntryCard";
import { AuditTrail } from "@/features/home/AuditTrail";
import { FEE_DEPTS } from "@/lib/data/departments";


export default function HomePage() {
  const { services, positions, capPools, policyTargets, imports, derived } = useBuildState();
  const jurisdiction = useActiveJurisdiction();
  const { impact, comparisons } = derived;

  // Headline numbers — same derivation the Revenue Gap page uses, so the
  // home tile reconciles exactly with the detail screen.
  const gap = Math.max(0, impact.recoverableGap);
  const recovery = impact.totalCost > 0
    ? (impact.currentRevenue / impact.totalCost) * 100
    : 0;
  const feesBelowTarget = comparisons.filter((c) => c.recoveryPct < c.target).length;

  // Revenue drift = closeable gap as a negative (under-collecting) signal.
  // Same magnitude as the gap; sign indicates direction for display.
  const revenueDrift = -gap;

  // Departments under their policy target — used for the monitoring card's
  // "X departments below policy" support line.
  const deptsBelowPolicy = FEE_DEPTS.reduce((count, d) => {
    const r = derived.deptRollup[d];
    if (r.totalCost <= 0) return count;
    const target = policyTargets.find((t) => t.dept === d)?.target ?? 100;
    return r.recoveryPct < target ? count + 1 : count;
  }, 0);

  // Services missing required inputs — surfaces as the secondary count
  // alongside dept policy status. (Same definition as the Revenue Gap
  // "data complete" tile.)
  const staleAssumptions = services.filter((s) => !s.volume || !s.hours).length;

  // Cost-of-service model completeness: pct of (volume, hours) cells
  // populated across every service. Mirrors the Revenue Gap data-complete
  // calculation so both screens reconcile.
  const expectedCells = Math.max(1, services.length * 2);
  const missingCells = services.reduce(
    (a, s) => a + (s.volume ? 0 : 1) + (s.hours ? 0 : 1), 0,
  );
  const modelProgress = Math.round((1 - missingCells / expectedCells) * 100);
  // Operating-layer progress: citywide recovery against the weighted
  // policy target. 100% means we're collecting exactly what policy intends.
  const opsProgress = impact.overallPct > 0
    ? Math.min(100, Math.round((recovery / impact.overallPct) * 100))
    : 0;

  // Annual update strip — derived counts:
  //  - Changes to review = recent import log entries (each merge ≈ a change set)
  //  - Structure reused  = pct of comparisons inherited from existing services
  //                        (vs. brand-new fees). For now we use 1 − (new imports
  //                        flagged for review) / total fees as the proxy.
  //  - Fees impacted     = count of fees with a non-zero adoption delta
  const changesToReview = imports.length;
  const feesImpacted = comparisons.filter((c) => Math.abs(c.annualUplift) > 0.5).length;
  const totalReviewItems = imports.reduce((a, e) => a + (e.result?.lowConfidence ?? 0), 0);
  const reuseRate = comparisons.length > 0
    ? Math.max(0, Math.min(100, Math.round((1 - totalReviewItems / Math.max(1, comparisons.length)) * 100)))
    : 100;

  return (
    <Page>
      {/* Document header */}
      <div style={{
        borderBottom: "1px solid var(--rule)",
        paddingBottom: 16, marginBottom: -4,
      }}>
        <div className="mono" style={{
          fontSize: "var(--t-l4)", fontWeight: 600, letterSpacing: "0.14em",
          textTransform: "uppercase", color: "var(--ink-3)",
        }}>{jurisdiction.name}</div>
        <div className="display" style={{
          fontSize: 26, fontWeight: 600, letterSpacing: "-0.018em",
          lineHeight: 1.15, marginTop: 4,
        }}>Revenue Intelligence System</div>
      </div>

      {/* Headline answer */}
      <div style={{
        background: "var(--paper)", border: "1px solid var(--rule)",
        padding: "28px 32px",
        display: "flex", justifyContent: "space-between",
        alignItems: "center", gap: 24, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <div className="mono" style={{
            fontSize: "var(--t-l4)", fontWeight: 600, letterSpacing: "0.12em",
            textTransform: "uppercase", color: "var(--ink-3)",
          }}>Overall cost recovery</div>
          <div className="display" style={{
            fontSize: 40, fontWeight: 600, letterSpacing: "-0.024em", lineHeight: 1.08,
          }}>
            <span className="num" style={{ color: "var(--neg)" }}>{fmt.dollarsK(gap)}/yr</span>
            {" "}
            <span style={{ color: "var(--ink-2)", fontWeight: 500 }}>
              under-recovery at {recovery.toFixed(0)}%
            </span>
          </div>
          <div style={{ fontSize: "var(--fs-ui)", color: "var(--ink-3)" }}>
            See Revenue Gap for recovery drivers, shortfalls, and source traceability.
          </div>
        </div>
        <Btn kind="primary" href="/gap">
          Open Revenue Gap <Icon name="arrow-right" size={13}/>
        </Btn>
      </div>

      {/* Workflow branch — setup + operations */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <EntryCard
          eyebrow="Cost-of-service model"
          title="Cost-of-service model"
          desc="Services, labor, overhead allocations, and recovery structure."
          progress={modelProgress}
          progressLabel="Baseline model"
          cta="Configure model"
          href="/build/services"
          checklist={[
            { l: "Services", v: `${services.length} mapped` },
            { l: "Labor",    v: `${positions.length} positions` },
            { l: "Overhead", v: `${capPools.length} pools` },
          ]}
        />
        <EntryCard
          eyebrow="Operating layer"
          title="Revenue monitoring"
          desc="Track recovery drift, subsidy exposure, and fee actions after adoption."
          progress={opsProgress}
          progressLabel={
            opsProgress >= 100 ? "Recovery at policy target"
            : opsProgress >= 80 ? "Recovery near target"
            : "Recovery below target"
          }
          cta="Open monitoring"
          href="/monitoring"
          accent
          stats={[
            { l: "Revenue drift",      v: `${revenueDrift < 0 ? "−" : "+"}${fmt.dollarsK(Math.abs(revenueDrift))}` },
            { l: "Recovery health",    v: `${recovery.toFixed(0)}%` },
            { l: "Fees below target",  v: `${feesBelowTarget}` },
          ]}
          support={
            `${deptsBelowPolicy} department${deptsBelowPolicy === 1 ? "" : "s"} below policy`
            + (staleAssumptions > 0
              ? ` · ${staleAssumptions} stale assumption${staleAssumptions === 1 ? "" : "s"}`
              : "")
          }
        />
      </div>

      {/* Recurring workflow — Annual update as a horizontal strip */}
      <Link to="/annual" style={{
        background: "var(--paper)",
        border: "1px solid var(--rule)",
        padding: "22px 26px",
        display: "grid",
        gridTemplateColumns: "minmax(280px, 1.3fr) minmax(360px, 1.6fr) auto",
        columnGap: 32, rowGap: 16,
        alignItems: "center",
        color: "var(--ink)",
        textDecoration: "none",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <div className="mono" style={{
            fontSize: "var(--t-l4)", fontWeight: 600, letterSpacing: "0.12em",
            textTransform: "uppercase", color: "var(--ink-3)",
          }}>Recurring workflow</div>
          <div className="display" style={{
            fontSize: 24, fontWeight: 600, letterSpacing: "-0.018em", lineHeight: 1.15,
          }}>Annual update</div>
          <div style={{
            fontSize: "var(--fs-ui)", color: "var(--ink-2)", lineHeight: 1.55, textWrap: "pretty",
            maxWidth: 420,
          }}>
            Refresh annual inputs, review recovery impacts, and generate the adoption packet.
          </div>
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16,
        }}>
          {[
            { l: "Changes to review", v: `${changesToReview}` },
            { l: "Structure reused",  v: `${reuseRate}%` },
            { l: "Fees impacted",     v: `${feesImpacted}` },
          ].map((s) => (
            <div key={s.l}>
              <div className="mono" style={{
                fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.12em",
                textTransform: "uppercase", color: "var(--ink-3)",
              }}>{s.l}</div>
              <div className="num display" style={{
                fontSize: 26, fontWeight: 600, marginTop: 6, letterSpacing: "-0.02em",
              }}>{s.v}</div>
            </div>
          ))}
        </div>

        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "9px 16px",
          background: "var(--ink)",
          color: "white",
          border: "1px solid var(--ink)",
          fontSize: "var(--fs-ui)", fontWeight: 500,
          whiteSpace: "nowrap",
        }}>
          Run annual update <Icon name="arrow-right" size={13}/>
        </div>
      </Link>

      {/* Activity */}
      <AuditTrail/>
    </Page>
  );
}
