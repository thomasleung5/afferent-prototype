
import { useEffect, useMemo } from "react";
import { useBuildState } from "@/lib/store";
import { useActiveFiscalYear, useActiveJurisdiction } from "@/lib/active";
import {
  buildExportPayload, type ExportPayload,
} from "@/lib/export/buildPayload";
import { fmt } from "@/lib/format";
import { deptName, FEE_DEPTS } from "@/lib/data/departments";
import type { DeptCode } from "@/lib/types";
import {
  ExportCover, ExportTile, ExportTileGrid, ExportToolbar, PrintStyles,
} from "@/components/ui";
import { useAutoPrint, useStoreHydrated } from "@/lib/printing";

export default function FeeStudyExportPage() {
  const hydrated = useStoreHydrated();
  const state = useBuildState();
  const jurisdiction = useActiveJurisdiction();
  const fiscalYear = useActiveFiscalYear();
  useEffect(() => {
    const prev = document.title;
    document.title = `Fee Study — ${jurisdiction.name} — ${fiscalYear}`;
    return () => { document.title = prev; };
  }, [jurisdiction.name, fiscalYear]);
  const payload = useMemo<ExportPayload>(() => buildExportPayload({
    productiveHours: state.productiveHours,
    operating:    state.operating,
    capPools:     state.capPools,
    volume:       state.volume,
    services:     state.services,
    policyTargets: state.policyTargets,
    policyExceptions: state.policyExceptions,
    pendingReview: state.pendingReview,
    lineage:      state.lineage,
    derived:      state.derived,
    jurisdiction: {
      name: jurisdiction.name,
      fiscal: fiscalYear,
      preparedBy: jurisdiction.preparedBy,
      peers: jurisdiction.peers,
    },
  }), [state, jurisdiction, fiscalYear]);

  if (!hydrated) {
    return (
      <div style={{
        padding: 40, fontFamily: "var(--ff-ui)",
        color: "var(--ink-3)", fontSize: 13,
      }}>Loading export…</div>
    );
  }

  return (
    <>
      <PrintStyles pageMargin="0.7in"/>
      <Toolbar payload={payload}/>
      <Report payload={payload}/>
    </>
  );
}

function Toolbar({ payload }: { payload: ExportPayload }) {
  return (
    <ExportToolbar
      subtitle={`${payload.cover.cityName} · ${payload.cover.fiscal} fee study`}
    />
  );
}

/** Auto-fire window.print on first load if the URL has ?print=1. */
function Report({ payload }: { payload: ExportPayload }) {
  useAutoPrint();
  return (
    <div className="report">
      <Cover payload={payload}/>
      <TableOfContents/>
      <ExecutiveSummary payload={payload}/>
      <BackgroundAndObjectives payload={payload}/>
      <LegalFramework payload={payload}/>
      <DataSourcesAndValidation payload={payload}/>
      <Methodology payload={payload}/>
      <SummaryOfFindings payload={payload}/>
      <DepartmentAnalysis payload={payload}/>
      <CostRecoveryPolicyConsiderations payload={payload}/>
      <RecommendedFeeSchedule payload={payload}/>
      <ImplementationOptions payload={payload}/>
      <PeerComparisonSurvey payload={payload}/>
      <RecommendationsAndNextSteps/>
      <Appendices payload={payload}/>
    </div>
  );
}

// ============================================================================
// Cover & front matter
// ============================================================================

function Cover({ payload }: { payload: ExportPayload }) {
  return (
    <ExportCover
      city={payload.cover.cityName}
      title="User Fee Study"
      subtitle="Cost of Service · Cost Recovery Policy · Recommended Fee Schedule"
      fields={[
        { label: "Fiscal year",  value: payload.cover.fiscal },
        { label: "Prepared by",  value: "Finance Department · Afferent" },
        { label: "Peer cities",  value: payload.cover.peers.length > 0
            ? payload.cover.peers.join(" · ") : "—" },
        { label: "Generated",    value: new Date(payload.cover.generatedAt).toLocaleDateString(undefined, {
            month: "long", day: "numeric", year: "numeric",
          }) },
      ]}
    />
  );
}

const TOC_SECTIONS = [
  "Executive Summary",
  "Background and Study Objectives",
  "Legal Framework and Cost Recovery Policy",
  "Data Sources and Validation",
  "Study Methodology",
  "Summary of Findings",
  "Department Analysis",
  "Cost Recovery Policy Considerations",
  "Recommended Fee Schedule",
  "Implementation Options",
  "Peer Comparison Survey",
  "Recommendations and Next Steps",
  "Appendices",
];

const APPENDIX_SECTIONS = [
  "Appendix A — Full Fee Detail",
  "Appendix B — Fully Burdened Hourly Rate Detail",
  "Appendix C — Peer Comparison Survey",
  "Appendix D — Assumptions and Limitations",
];

function TableOfContents() {
  return (
    <section className="section section-break" style={{ marginBottom: 48 }}>
      <div className="eyebrow">Contents</div>
      <h2 className="h2">Table of contents</h2>
      <ol style={{
        margin: 0, padding: 0, listStyle: "none",
        fontSize: 13, lineHeight: 1.9,
      }}>
        {TOC_SECTIONS.map((label, i) => (
          <li key={label} style={{
            display: "flex", alignItems: "baseline", gap: 12,
            borderBottom: "1px dotted var(--rule)",
            padding: "4px 0",
          }}>
            <span className="mono" style={{
              fontSize: 10, color: "var(--ink-3)",
              minWidth: 28,
            }}>{(i + 1).toString().padStart(2, "0")}</span>
            <span>{label}</span>
          </li>
        ))}
        {APPENDIX_SECTIONS.map((label) => (
          <li key={label} style={{
            display: "flex", alignItems: "baseline", gap: 12,
            borderBottom: "1px dotted var(--rule)",
            padding: "4px 0",
          }}>
            <span className="mono" style={{
              fontSize: 10, color: "var(--ink-3)",
              minWidth: 28,
            }}>—</span>
            <span style={{ color: "var(--ink-2)" }}>{label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ============================================================================
// § 1 — Executive Summary
// ============================================================================

function ExecutiveSummary({ payload }: { payload: ExportPayload }) {
  const s = payload.summary;
  const cityName = payload.cover.cityName;
  const fiscal = payload.cover.fiscal;
  const departments = "Planning, Building, and Engineering";
  const recoveryTargetSummary = recoveryTargetSummaryLabel(payload);

  return (
    <section className="section section-break" style={{ marginBottom: 40 }}>
      <div className="eyebrow">Section 1</div>
      <h2 className="h2">Executive summary</h2>

      <div className="body">
        <p>
          {cityName} engaged Afferent to conduct a comprehensive Development
          Services Fee Study for Fiscal Year {fiscal}. The purpose of the
          study was to evaluate the full cost of providing fee-related
          services, assess current levels of cost recovery, and develop an
          updated fee schedule aligned with adopted policy objectives.
        </p>
        <p>
          The analysis identified approximately <b>{fmt.dollarsK(s.totalCost)}</b>{" "}
          in annual fee-related service costs across the {departments}{" "}
          divisions. Current fee revenues recover approximately{" "}
          <b>{s.recoveryPct.toFixed(0)}%</b> of those costs, resulting in an
          estimated annual General Fund subsidy of approximately{" "}
          <b>{fmt.dollarsK(s.annualSubsidy)}</b>.
        </p>
        <p>
          If adopted, the recommended fee schedule would increase annual fee
          revenue by approximately <b>{fmt.dollarsK(s.potentialUplift)}</b>{" "}
          and improve overall cost recovery toward{" "}
          <b>{recoveryTargetSummary}</b>, consistent with adopted departmental
          recovery targets.
        </p>
      </div>

      <ExportTileGrid columns={4}>
        <ExportTile label="Services modeled" value={s.services.toString()}/>
        <ExportTile label="FTE" value={s.fte.toFixed(1)}/>
        <ExportTile label="Current recovery"
              value={`${s.recoveryPct.toFixed(0)}%`}
              tone={s.recoveryPct >= 80 ? "pos" : s.recoveryPct >= 50 ? "warn" : "neg"}/>
        <ExportTile label="Annual gap" value={fmt.dollarsK(s.recoveryGap)} tone="neg" last/>
        <ExportTile label="Policy-intended recovery"
              value={`${s.intendedRecoveryPct.toFixed(0)}%`}/>
        <ExportTile label="Annual subsidy" value={fmt.dollarsK(s.annualSubsidy)} tone="warn"/>
        <ExportTile label="Potential uplift" value={fmt.dollarsK(s.potentialUplift)} tone="pos"/>
        <ExportTile label="Total annual cost" value={fmt.dollarsK(s.totalCost)} last/>
      </ExportTileGrid>
    </section>
  );
}

// ============================================================================
// § 2 — Background and Study Objectives
// ============================================================================

function BackgroundAndObjectives({ payload }: { payload: ExportPayload }) {
  return (
    <section className="section section-break" style={{ marginBottom: 40 }}>
      <div className="eyebrow">Section 2</div>
      <h2 className="h2">Background and study objectives</h2>

      <div className="body">
        <p>
          California local governments periodically conduct fee studies to
          ensure that user fees remain aligned with the reasonable cost of
          providing services and consistent with adopted fiscal policy
          objectives.
        </p>
        <p>
          User fees are commonly used to recover the cost of services that
          primarily benefit individual applicants, permit holders,
          developers, or regulated parties rather than the public at large.
        </p>
        <p>
          The City&apos;s existing fee schedule has historically been updated
          incrementally; however, changes in staffing structure, service
          complexity, labor costs, and development activity warranted a
          comprehensive reevaluation of fee-related costs.
        </p>
        <p>
          The study focused on fee-supported activities within the Planning,
          Building, and Engineering divisions. The analysis excluded
          development impact fees, utility rates, and penalties governed by
          separate statutory frameworks.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 18 }}>Study objectives</h3>
      <div className="body">
        <ul>
          <li>Evaluate the full cost of providing fee-related services.</li>
          <li>Identify areas of significant under-recovery.</li>
          <li>Align fee levels with the City&apos;s adopted cost-recovery targets.</li>
          <li>Improve the transparency of fee calculations.</li>
          <li>Strengthen the legal defensibility of the fee schedule.</li>
          <li>
            Establish a framework that can be reasonably updated in future
            fiscal years.
          </li>
        </ul>
      </div>

      <FootnoteServicesContext payload={payload}/>
    </section>
  );
}

function FootnoteServicesContext({ payload }: { payload: ExportPayload }) {
  const s = payload.summary;
  return (
    <div className="body footnote">
      Scope: {s.services} fee-related services across {s.fte.toFixed(1)} FTE of
      development services staffing.
    </div>
  );
}

// ============================================================================
// § 3 — Legal Framework and Cost Recovery Policy
// ============================================================================

function LegalFramework({ payload }: { payload: ExportPayload }) {
  const { targets } = payload.policy;
  return (
    <section className="section section-break" style={{ marginBottom: 40 }}>
      <div className="eyebrow">Section 3</div>
      <h2 className="h2">Legal framework and cost recovery policy</h2>

      <div className="body">
        <p>
          User fees in California are governed by Proposition 218,
          Proposition 26, and Government Code Section 66014, which generally
          require that fees not exceed the estimated reasonable cost of
          providing the service for which the fee is charged.
        </p>
        <p>
          While this study calculates the estimated full cost of service for
          each fee category, the decision regarding the appropriate level of
          cost recovery remains a policy determination of the City Council.
        </p>
        <p>
          Certain services may intentionally recover less than full cost in
          support of broader policy objectives, including housing production,
          economic development, or community benefit considerations.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 18 }}>Adopted departmental recovery targets</h3>
      <table>
        <thead>
          <tr>
            <th>Department</th>
            <th className="num">Target</th>
            <th>Policy note</th>
          </tr>
        </thead>
        <tbody>
          {targets.map((t) => (
            <tr key={t.id}>
              <td>
                <b>{deptDisplayName(t.dept)}</b>
                <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginLeft: 6 }}>
                  {t.dept}
                </span>
              </td>
              <td className="num"><b>{t.target}%</b></td>
              <td style={{ color: "var(--ink-2)" }}>{t.note}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="body" style={{ marginTop: 14 }}>
        <p>
          Recovery targets below 100% represent intentional General Fund
          subsidy decisions.
        </p>
      </div>
    </section>
  );
}

// ============================================================================
// § 4 — Data Sources and Validation
// ============================================================================

function DataSourcesAndValidation({ payload }: { payload: ExportPayload }) {
  const sourceInventory = buildSourceInventory(payload);
  const totalReviewFlags = payload.reviewFlags.reduce((a, f) => a + f.count, 0);

  return (
    <section className="section section-break" style={{ marginBottom: 40 }}>
      <div className="eyebrow">Section 4</div>
      <h2 className="h2">Data sources and validation</h2>

      <div className="body">
        <p>
          The estimated reasonable cost of providing services calculated in
          this study relies on source data compiled from the City&apos;s
          financial, payroll, operational, and adopted policy records for
          the fiscal year analyzed. Each data domain was subject to
          validation review prior to inclusion in the cost model in order
          to support the legal defensibility of the resulting fee schedule.
        </p>
        <p>
          The source inventory below summarizes the records used to develop
          the cost of service analysis, the volume of records loaded into
          the model, and the validation status assigned to each domain at
          the time the report was generated.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 18 }}>Source inventory</h3>
      <table>
        <thead>
          <tr>
            <th>Data domain</th>
            <th className="num">Records</th>
            <th>Source files</th>
            <th className="num">Validated</th>
            <th className="num">Review</th>
          </tr>
        </thead>
        <tbody>
          {sourceInventory.map((row) => (
            <tr key={row.domain}>
              <td><b>{row.label}</b></td>
              <td className="num">{row.records > 0 ? fmt.int(row.records) : "—"}</td>
              <td style={{ color: "var(--ink-2)" }}>
                {row.files.length > 0 ? row.files.join(", ") : "Not available."}
              </td>
              <td className="num">{row.validated}</td>
              <td className="num" style={{
                color: row.review > 0 ? "var(--warn)" : "var(--ink-3)",
              }}>
                {row.review}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="h3" style={{ marginTop: 22 }}>Validation procedures</h3>
      <div className="body">
        <ul>
          <li>
            Reconciliation of direct labor compensation to adopted budget
            personnel appropriations for the fiscal year analyzed.
          </li>
          <li>
            Reconciliation of departmental operating expenditures to
            adopted budget non-personnel appropriations, with line-level
            exclusion of items not appropriately recovered through user
            fees (e.g., capital outlay, one-time charges).
          </li>
          <li>
            Confirmation of indirect overhead pool totals against the
            City&apos;s Cost Allocation Plan source document, including
            verification of allocation bases and step-down conservation.
          </li>
          <li>
            Review of staff time estimates with departmental subject-matter
            staff to confirm reasonableness against operational experience.
          </li>
          <li>
            Confirmation of current adopted fees against the City&apos;s
            published fee schedule in effect for the study period.
          </li>
          <li>
            Independent comparison of resulting Fully Burdened Hourly Rates
            against rates published by peer jurisdictions to confirm
            results fall within an expected range.
          </li>
        </ul>
      </div>

      {totalReviewFlags > 0 && (
        <div className="body footnote">
          {totalReviewFlags} source record
          {totalReviewFlags === 1 ? "" : "s"} remain
          {totalReviewFlags === 1 ? "s" : ""} flagged for review at the
          time this report was generated. Outstanding items are listed in
          Appendix D and do not affect the figures presented elsewhere in
          this report.
        </div>
      )}
    </section>
  );
}

// ============================================================================
// § 5 — Study Methodology
// ============================================================================

function Methodology({ payload }: { payload: ExportPayload }) {
  const productiveHours = payload.assumptions.find(
    (a) => a.label === "Productive hours/yr (default)",
  )?.value ?? "1,720";
  const roundingNote = payload.assumptions.find(
    (a) => a.label === "Recommended rounding",
  )?.value ?? "Not available.";
  return (
    <section className="section section-break" style={{ marginBottom: 40 }}>
      <div className="eyebrow">Section 5</div>
      <h2 className="h2">Study methodology</h2>

      <div className="body">
        <p>
          The study utilized a bottom-up costing methodology commonly
          employed in municipal fee studies throughout California. Under this
          approach, the estimated cost of each fee-related service is
          calculated based on:
        </p>
        <ul>
          <li>the staff time required to perform the service, and</li>
          <li>the fully burdened hourly cost of the personnel performing the work.</li>
        </ul>
        <p>
          The analysis evaluates the full cost incurred by the City to
          provide services, including direct labor, departmental operating
          costs, and allocated indirect overhead support.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 18 }}>Fully Burdened Hourly Rate (FBHR)</h3>
      <div className="body">
        <p>
          Fully Burdened Hourly Rates (FBHR) form the foundation of the fee
          analysis and represent the estimated hourly cost of providing
          services within each department. FBHR incorporates three primary
          cost components:
        </p>
        <ul>
          <li>direct labor costs</li>
          <li>departmental operating costs</li>
          <li>allocated indirect overhead costs</li>
        </ul>
      </div>

      <h3 className="h3" style={{ marginTop: 14 }}>Direct labor</h3>
      <div className="body">
        <p>
          Direct labor costs include salaries and benefits associated with
          staff performing fee-related services, including planners,
          engineers, inspectors, permit technicians, supervisors, and
          management personnel.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 14 }}>Departmental operating costs</h3>
      <div className="body">
        <p>
          Department operating costs include non-labor expenditures necessary
          to support service delivery, including software systems, vehicles,
          equipment, supplies, contracted services, and other departmental
          operating expenses.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 14 }}>Indirect overhead</h3>
      <div className="body">
        <p>
          Indirect overhead costs represent central support services provided
          across the organization, including Finance, Human Resources,
          Information Technology, City Administration, legal support,
          insurance, and other shared administrative functions.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 14 }}>Overhead allocation</h3>
      <div className="body">
        <p>
          Indirect overhead costs were allocated using a step-down allocation
          methodology commonly used in municipal cost allocation plans.
          Allocation bases vary by cost pool and may include full-time
          equivalent staffing, payroll transactions, square footage,
          technology utilization, agenda volume, and administrative workload
          indicators.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 14 }}>Productive hours</h3>
      <div className="body">
        <p>
          The analysis assumes <b>{productiveHours}</b> productive hours
          annually per full-time equivalent employee. Productive hours
          represent paid hours net of holidays, leave, training,
          administrative downtime, and other non-billable activities.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 14 }}>Unit cost calculation</h3>
      <div className="body">
        <p>
          Once Fully Burdened Hourly Rates were established, estimated staff
          time requirements were developed for each fee category based on
          operational review and staff input. Unit costs were calculated as:
        </p>
        <div style={{
          margin: "8px 0", padding: "10px 14px",
          background: "var(--paper-2)", border: "1px solid var(--rule)",
          fontFamily: "var(--ff-mono)", fontSize: 12,
        }}>
          Unit Cost = Service Hours × Fully Burdened Hourly Rate
        </div>
        <MethodologyUnitCostExample payload={payload}/>
      </div>

      <h3 className="h3" style={{ marginTop: 14 }}>Annualized fiscal impact</h3>
      <div className="body">
        <p>
          Annualized fiscal impacts were estimated using projected service
          volumes and current fee demand assumptions. Current and
          recommended fee revenues were compared against calculated annual
          service costs in order to evaluate existing recovery levels,
          subsidy amounts, and projected fiscal impacts.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 14 }}>Recommended fees</h3>
      <div className="body">
        <p>
          Recommended fees were developed by applying adopted departmental
          recovery targets to the calculated full cost of service. Where
          recovery targets are below 100%, the remaining cost of service is
          assumed to be subsidized by the General Fund.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 14 }}>Step-down allocation of indirect costs</h3>
      <div className="body">
        <p>
          The City&apos;s Cost Allocation Plan was used as the source for
          indirect overhead distributed to the direct fee departments. Pool
          allocations were applied using a step-down methodology in which
          each indirect cost center is allocated to receiving departments in
          a single pass, in accordance with established municipal cost
          allocation practice.
        </p>
        <p>
          Allocation bases were selected to reflect the most appropriate
          driver of the underlying activity for each pool. Bases used in the
          study include full-time equivalent staffing, payroll transactions,
          accounts payable transactions, agenda volume, public records
          requests, contract activity, building square footage, vehicle
          count, recruitment activity, and direct assignment for pools
          attributable to a single department.
        </p>
        <p>
          Indirect departments classified as public-benefit (such as City
          Council and Boards and Committees) are excluded from recovery
          through user fees, consistent with policy guidance regarding the
          appropriate treatment of governance functions.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 14 }}>Fee rounding convention</h3>
      <div className="body">
        <p>
          Calculated recommended fees were rounded for presentation in the
          adopted fee schedule. The rounding convention applied in this
          study is <b>{roundingNote}</b>. Rounding produces nominally lower
          recovery than the unrounded calculation and does not result in a
          fee in excess of the estimated reasonable cost of service.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 14 }}>Scope of analysis</h3>
      <div className="body">
        <p>
          The analysis evaluated services within the City&apos;s development
          services divisions for which a per-unit user fee is charged or for
          which one could reasonably be established. Fees governed by
          separate statutory frameworks were not evaluated as part of this
          study, including development impact fees subject to the Mitigation
          Fee Act, utility rates governed by Proposition 218, fines and
          penalties, and pass-through charges.
        </p>
        <p>
          Services within scope but for which no fee is currently charged
          were retained in the analysis at calculated full cost so that the
          policy implications of full subsidy of those services are
          transparent.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 14 }}>Reliance on staff time estimates</h3>
      <div className="body">
        <p>
          Service-level staff time estimates were developed in consultation
          with departmental staff and reflect operational judgment regarding
          the typical effort required to complete each service. Staff time
          estimates necessarily reflect averages and may vary for an
          individual project. The methodology is intended to produce
          defensible average-cost estimates suitable for use in establishing
          a published fee schedule.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 18 }}>Reliance, data sources, and limitations</h3>
      {payload.disclaimers.map((d) => (
        <div key={d.heading} className="body" style={{ marginTop: 6 }}>
          <p>
            <b>{d.heading}.</b>{" "}
            <span style={{ color: "var(--ink-2)" }}>{d.body}</span>
          </p>
        </div>
      ))}
    </section>
  );
}

function MethodologyUnitCostExample({ payload }: { payload: ExportPayload }) {
  // Pick the median-hours fee as a worked example so the number is
  // representative rather than the highest or lowest.
  const sample = [...payload.feeSchedule]
    .filter((f) => f.hours > 0 && f.unitCost > 0)
    .sort((a, b) => a.hours - b.hours)[Math.floor(payload.feeSchedule.length / 2)];
  if (!sample) return null;
  const fbhr = sample.unitCost / sample.hours;
  return (
    <p>
      For example, {sample.name.toLowerCase()} requires approximately{" "}
      {sample.hours} staff hours; at the applicable Fully Burdened Hourly Rate
      of approximately ${Math.round(fbhr)} per hour, the estimated full cost
      of service equals approximately {fmt.dollars(sample.unitCost)}.
    </p>
  );
}

// ============================================================================
// § 6 — Summary of Findings
// ============================================================================

function SummaryOfFindings({ payload }: { payload: ExportPayload }) {
  const s = payload.summary;
  const findings = deriveFindings(payload);
  const recommendedRevenueTotal = payload.deptSummaries.reduce(
    (a, d) => a + d.recommendedRevenue, 0,
  );
  const totalCurrentRecovery = s.recoveryPct;
  const totalRecommendedRecovery = s.totalCost > 0 ? (recommendedRevenueTotal / s.totalCost) * 100 : 0;

  return (
    <section className="section section-break" style={{ marginBottom: 40 }}>
      <div className="eyebrow">Section 6</div>
      <h2 className="h2">Summary of findings</h2>

      <div className="body">
        <p>
          The study identified approximately <b>{fmt.dollarsK(s.totalCost)}</b>{" "}
          in annual fee-related service costs across the Planning, Building,
          and Engineering divisions. Current fee revenues recover
          approximately <b>{s.recoveryPct.toFixed(0)}%</b> of full cost,
          resulting in an estimated annual General Fund subsidy of
          approximately <b>{fmt.dollarsK(s.annualSubsidy)}</b>.
        </p>
        <p>
          The summary table below compares estimated annual service costs,
          current fee revenues, the revenue level that would be collected
          at full cost recovery, and the projected revenue and recovery
          level under the recommended fee schedule.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 14 }}>Summary by department</h3>
      <table style={{ marginTop: 4 }}>
        <thead>
          <tr>
            <th>Department</th>
            <th className="num">Current revenue</th>
            <th className="num">Full cost recovery</th>
            <th className="num">Surplus / (subsidy)</th>
            <th className="num">Existing recovery %</th>
            <th className="num">Recommended revenue</th>
            <th className="num">Recommended recovery %</th>
          </tr>
        </thead>
        <tbody>
          {payload.deptSummaries.map((d) => (
            <tr key={d.dept}>
              <td>
                <b>{deptDisplayName(d.dept)}</b>
                <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginLeft: 6 }}>
                  {d.dept}
                </span>
              </td>
              <td className="num">{fmt.dollarsK(d.currentRevenue)}</td>
              <td className="num">{fmt.dollarsK(d.fullCostRevenue)}</td>
              <td className="num" style={{
                color: d.surplusSubsidy < 0 ? "var(--neg)" : "var(--pos)",
              }}>
                {parens(d.surplusSubsidy)}
              </td>
              <td className="num"><b>{d.recoveryPct.toFixed(0)}%</b></td>
              <td className="num">{fmt.dollarsK(d.recommendedRevenue)}</td>
              <td className="num">
                <b style={{ color: "var(--accent)" }}>{d.recommendedRecoveryPct.toFixed(0)}%</b>
              </td>
            </tr>
          ))}
          <tr className="total">
            <td>
              <span className="mono" style={{
                color: "var(--ink-3)", textTransform: "uppercase",
                letterSpacing: "0.06em", fontSize: 9.5,
              }}>Citywide</span>
            </td>
            <td className="num">{fmt.dollarsK(s.currentRevenue)}</td>
            <td className="num">{fmt.dollarsK(s.totalCost)}</td>
            <td className="num" style={{
              color: s.currentRevenue - s.totalCost < 0 ? "var(--neg)" : "var(--pos)",
            }}>
              {parens(s.currentRevenue - s.totalCost)}
            </td>
            <td className="num"><b>{totalCurrentRecovery.toFixed(0)}%</b></td>
            <td className="num">{fmt.dollarsK(recommendedRevenueTotal)}</td>
            <td className="num">
              <b style={{ color: "var(--accent)" }}>{totalRecommendedRecovery.toFixed(0)}%</b>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="body footnote">
            Surplus/subsidy is presented from the General Fund perspective:
            negative values indicate the General Fund underwrites a portion
            of the cost of service. Recommended revenue applies the adopted
            recovery target to the calculated cost of service.
      </div>

      <div className="body" style={{ marginTop: 14 }}>
        {findings.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </section>
  );
}

// ============================================================================
// § 7 — Department Analysis
// ============================================================================

const DEPT_OVERVIEWS: Record<string, string> = {
  PLAN:  "Planning fees support discretionary development review, entitlement processing, environmental review, public hearings, and related administrative activities.",
  BLDG:  "Building fees support permit intake, plan review, inspections, code compliance activities, and permit issuance functions.",
  ENG:   "Engineering fees support grading review, encroachment permits, improvement plan review, stormwater review, and infrastructure coordination activities.",
  PARKS: "Parks & Recreation fees support recreation programs, facility rentals, athletic field permits, aquatics, and youth services activities.",
  PD:    "Police service fees support alarm permits, special-event coverage, fingerprinting, record requests, and other non-emergency administrative activities.",
  FIRE:  "Fire prevention fees support fire and life-safety inspections, plan review, hazardous materials permits, and related code compliance activities.",
};

function DepartmentAnalysis({ payload }: { payload: ExportPayload }) {
  return (
    <section className="section section-break" style={{ marginBottom: 40 }}>
      <div className="eyebrow">Section 7</div>
      <h2 className="h2">Department analysis</h2>

      {payload.deptSummaries.map((d, i) => (
        <DepartmentSubsection
          key={d.dept}
          payload={payload}
          deptCode={d.dept}
          isFirst={i === 0}
        />
      ))}
    </section>
  );
}

function DepartmentSubsection({
  payload, deptCode, isFirst,
}: { payload: ExportPayload; deptCode: string; isFirst: boolean }) {
  const dept = payload.deptSummaries.find((d) => d.dept === deptCode);
  if (!dept) return null;
  const fees = payload.feeSchedule.filter((f) => f.dept === deptCode);
  const buckets = payload.deptBuckets.find((b) => b.dept === deptCode)?.buckets ?? [];
  const recommendedRevenue = dept.recommendedRevenue;
  const projectedRecoveryPct = dept.recommendedRecoveryPct;
  const recovery = dept.recoveryPct;
  const driverNarrative = DEPT_DRIVER_NARRATIVE[deptCode] ?? "";

  return (
    <div className="row" style={{
      marginTop: isFirst ? 8 : 24,
      paddingTop: isFirst ? 0 : 18,
      borderTop: isFirst ? "none" : "1px solid var(--rule)",
    }}>
      <h3 className="h3" style={{ fontSize: 15, marginBottom: 10 }}>
        {deptDisplayName(dept.dept)}
      </h3>

      <div className="body">
        <p>{DEPT_OVERVIEWS[deptCode] ?? ""}</p>
      </div>

      <h3 className="h3" style={{ marginTop: 12 }}>Cost of service</h3>
      <div className="body">
        <p>
          The {deptDisplayName(dept.dept).toLowerCase()} division was staffed
          by approximately <b>{dept.fte.toFixed(1)} full-time equivalent</b>{" "}
          positions during the study period, supported by approximately{" "}
          <b>{fmt.dollarsK(dept.directDollars)}</b> in direct labor cost,{" "}
          <b>{fmt.dollarsK(dept.operatingDollars)}</b> in departmental
          operating cost, and <b>{fmt.dollarsK(dept.capDollars)}</b> in
          allocated indirect overhead. Total annualized cost of providing
          fee-related services within the division is approximately{" "}
          <b>{fmt.dollarsK(dept.totalCost)}</b>.
        </p>
        <p>
          Distributed across {fmt.int(dept.productiveHours * dept.fte)}{" "}
          productive hours of staff availability, the resulting Fully Burdened
          Hourly Rate is approximately <b>${Math.round(dept.fbhr)} per hour</b>,
          comprised of <b>${Math.round(dept.directRate)}</b> direct labor,{" "}
          <b>${Math.round(dept.operatingRate)}</b> departmental operating, and{" "}
          <b>${Math.round(dept.capRate)}</b> allocated indirect overhead.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 12 }}>Functional cost buckets</h3>
      {buckets.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Functional bucket</th>
              <th className="num">Services</th>
              <th className="num">Annual hours</th>
              <th className="num">Annual cost</th>
              <th className="num">Current revenue</th>
              <th className="num">Recovery %</th>
              <th className="num">Recommended revenue</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.bucket}>
                <td><b>{b.bucket}</b></td>
                <td className="num">{b.serviceCount}</td>
                <td className="num">{fmt.int(b.hours)}</td>
                <td className="num">{fmt.dollarsK(b.annualCost)}</td>
                <td className="num">{fmt.dollarsK(b.currentRevenue)}</td>
                <td className="num"><b>{b.recoveryPct.toFixed(0)}%</b></td>
                <td className="num">
                  <b style={{ color: "var(--accent)" }}>{fmt.dollarsK(b.recommendedRevenue)}</b>
                </td>
              </tr>
            ))}
            <tr className="total">
              <td>
                <span className="mono" style={{
                  color: "var(--ink-3)", textTransform: "uppercase",
                  letterSpacing: "0.06em", fontSize: 9.5,
                }}>Division total</span>
              </td>
              <td className="num">{buckets.reduce((a, b) => a + b.serviceCount, 0)}</td>
              <td className="num">{fmt.int(buckets.reduce((a, b) => a + b.hours, 0))}</td>
              <td className="num">{fmt.dollarsK(dept.totalCost)}</td>
              <td className="num">{fmt.dollarsK(dept.currentRevenue)}</td>
              <td className="num"><b>{recovery.toFixed(0)}%</b></td>
              <td className="num"><b>{fmt.dollarsK(recommendedRevenue)}</b></td>
            </tr>
          </tbody>
        </table>
      ) : (
        <div className="body"><p>Not available.</p></div>
      )}

      <h3 className="h3" style={{ marginTop: 12 }}>Cost recovery findings</h3>
      <div className="body">
        <p>
          {deptDisplayName(dept.dept)} services represent approximately{" "}
          <b>{fmt.dollarsK(dept.totalCost)}</b> in annual cost of service.
          Current revenues recover approximately{" "}
          <b>{recovery.toFixed(0)}%</b> of those costs against an adopted
          recovery target of <b>{dept.target}%</b>.{" "}
          {recoveryNarrative(recovery, dept.target, deptDisplayName(dept.dept))}
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 12 }}>Key cost drivers</h3>
      <div className="body">
        <p>{driverNarrative}</p>
      </div>

      <h3 className="h3" style={{ marginTop: 12 }}>Recommended adjustments</h3>
      <div className="body">
        <p>
          Applying the adopted recovery target to the calculated cost of
          service produces a recommended fee schedule projected to recover
          approximately <b>{projectedRecoveryPct.toFixed(0)}%</b> of full
          cost — an estimated annual revenue change of{" "}
          <b>{signed(recommendedRevenue - dept.currentRevenue)}</b>.{" "}
          {adjustmentNarrative(fees)}
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 12 }}>Fee table</h3>
      <table>
        <thead>
          <tr>
            <th>Fee item</th>
            <th className="num">Hours</th>
            <th className="num">Unit cost</th>
            <th className="num">Current</th>
            <th className="num">Recommended</th>
            <th className="num">Change</th>
          </tr>
        </thead>
        <tbody>
          {fees.map((f) => {
            const delta = f.recommended - f.fee;
            return (
              <tr key={f.id}>
                <td>
                  <div>{f.name}</div>
                  <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-3)", marginTop: 2 }}>
                    {f.id}
                  </div>
                </td>
                <td className="num">{f.hours}</td>
                <td className="num">{fmt.dollars(f.unitCost)}</td>
                <td className="num">{fmt.dollars(f.fee)}</td>
                <td className="num">
                  <b style={{ color: "var(--accent)" }}>{fmt.dollars(f.recommended)}</b>
                </td>
                <td className="num" style={{
                  color: delta > 0 ? "var(--neg)" : delta < 0 ? "var(--pos)" : "var(--ink-3)",
                }}>
                  {delta > 0 ? "+" : ""}{fmt.dollars(delta)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const DEPT_DRIVER_NARRATIVE: Record<string, string> = {
  PLAN:  "Planning workload is driven by discretionary review, staff report preparation, public hearing support, environmental review, applicant coordination, and iterative revisions during project entitlement.",
  BLDG:  "Building workload is driven by plan review, inspection volume, code compliance activity, permit issuance, and contractor coordination during construction.",
  ENG:   "Engineering workload is driven by grading review, stormwater compliance, improvement plan review, infrastructure coordination, and iterative revisions during project implementation.",
  PARKS: "Recreation workload is driven by program registration, facility scheduling, instructor coordination, athletic field permitting, and seasonal program rollout.",
  PD:    "Police-services workload is driven by alarm permit administration, special-event coordination, fingerprinting and records requests, and the administrative review of non-emergency service requests.",
  FIRE:  "Fire-prevention workload is driven by life-safety inspections, fire plan review, hazardous-materials permitting, and applicant coordination during construction and occupancy.",
};

// ============================================================================
// § 8 — Cost Recovery Policy Considerations
// ============================================================================

function CostRecoveryPolicyConsiderations({ payload }: { payload: ExportPayload }) {
  const { targets, exceptions } = payload.policy;
  const summary = payload.summary;
  const residualSubsidy = Math.max(0, summary.annualSubsidy - summary.potentialUplift);
  const intendedRecovery = `${summary.intendedRecoveryPct.toFixed(0)}%`;

  return (
    <section className="section section-break" style={{ marginBottom: 40 }}>
      <div className="eyebrow">Section 8</div>
      <h2 className="h2">Cost recovery policy considerations</h2>

      <div className="body">
        <p>
          The recommended fee schedule applies the adopted departmental
          recovery targets summarized in Section 3 to the calculated full
          cost of service. Selection of a recovery target for a given
          service category is a policy determination of the City Council
          that balances multiple considerations, including the relative
          benefit to the individual fee payer versus the public at large,
          the City&apos;s overall fiscal condition, statutory restrictions
          on fee levels, and broader policy objectives such as housing
          production or economic development.
        </p>
        <p>
          A recovery target set below 100% reflects an intentional
          commitment of General Fund support to subsidize a portion of the
          cost of providing the service. Establishing such targets
          explicitly, rather than allowing them to develop implicitly
          through fee inflation lag, supports transparent policy
          decision-making and clearer reporting of the fiscal cost of
          policy commitments.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 18 }}>General Fund subsidy implications</h3>
      <div className="body">
        <p>
          Under current adopted fee levels, the known General Fund subsidy
          of fee-related services is estimated at approximately{" "}
          <b>{fmt.dollarsK(summary.annualSubsidy)}</b> annually. Adoption of
          the recommended fee schedule would reduce this subsidy by an
          estimated <b>{fmt.dollarsK(summary.potentialUplift)}</b> per year,
          leaving an estimated residual subsidy of approximately{" "}
          <b>{fmt.dollarsK(residualSubsidy)}</b> consistent with the policy
          recovery target of <b>{intendedRecovery}</b> blended across the
          modeled departments.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 14 }}>Adopted departmental recovery targets</h3>
      <table>
        <thead>
          <tr>
            <th>Department</th>
            <th className="num">Target</th>
            <th>Policy rationale</th>
          </tr>
        </thead>
        <tbody>
          {targets.map((t) => (
            <tr key={t.id}>
              <td><b>{deptDisplayName(t.dept)}</b></td>
              <td className="num"><b>{t.target}%</b></td>
              <td style={{ color: "var(--ink-2)" }}>{t.note || "Not available."}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="h3" style={{ marginTop: 18 }}>Fee-specific exceptions</h3>
      <div className="body">
        <p>
          Policy may also adopt fee-level exceptions to the departmental
          recovery target for individual services where broader policy
          objectives apply (for example, reduced fees for accessory
          dwelling units in support of housing production). Adopted
          exceptions in effect for the study period are summarized below.
        </p>
      </div>
      {exceptions.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Fee item</th>
              <th className="num">Exception target</th>
              <th>Policy rationale</th>
            </tr>
          </thead>
          <tbody>
            {exceptions.map((e) => (
              <tr key={e.id}>
                <td><b>{e.fee}</b></td>
                <td className="num"><b>{e.target}%</b></td>
                <td style={{ color: "var(--ink-2)" }}>{e.note || "Not available."}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="body"><p>Not available.</p></div>
      )}

      <h3 className="h3" style={{ marginTop: 18 }}>Cost recovery outcomes by department</h3>
      <div className="body" style={{ marginBottom: 8 }}>
        <p>
          The table below summarizes projected recovery outcomes under the
          recommended fee schedule, with the residual subsidy required to
          fund services at the adopted policy level shown for each
          department.
        </p>
      </div>
      <table>
        <thead>
          <tr>
            <th>Department</th>
            <th className="num">Total cost</th>
            <th className="num">Current revenue</th>
            <th className="num">Current recovery</th>
            <th className="num">Policy target</th>
            <th className="num">Recommended revenue</th>
            <th className="num">Recommended recovery</th>
            <th className="num">Net change</th>
            <th className="num">Residual subsidy</th>
          </tr>
        </thead>
        <tbody>
          {payload.costRecoveryOutcomes.map((o) => (
            <tr key={o.dept}>
              <td><b>{deptDisplayName(o.dept)}</b></td>
              <td className="num">{fmt.dollarsK(o.totalCost)}</td>
              <td className="num">{fmt.dollarsK(o.currentRevenue)}</td>
              <td className="num">{o.currentRecoveryPct.toFixed(0)}%</td>
              <td className="num" style={{ color: "var(--ink-3)" }}>{o.policyTarget}%</td>
              <td className="num">{fmt.dollarsK(o.recommendedRevenue)}</td>
              <td className="num">
                <b style={{ color: "var(--accent)" }}>{o.recommendedRecoveryPct.toFixed(0)}%</b>
              </td>
              <td className="num" style={{
                color: o.netChange > 0 ? "var(--pos)" : o.netChange < 0 ? "var(--neg)" : "var(--ink-3)",
              }}>
                <b>{signed(o.netChange)}</b>
              </td>
              <td className="num">{fmt.dollarsK(o.residualSubsidy)}</td>
            </tr>
          ))}
          {(() => {
            const t = payload.costRecoveryOutcomes.reduce(
              (a, o) => ({
                totalCost: a.totalCost + o.totalCost,
                currentRevenue: a.currentRevenue + o.currentRevenue,
                recommendedRevenue: a.recommendedRevenue + o.recommendedRevenue,
                netChange: a.netChange + o.netChange,
                residualSubsidy: a.residualSubsidy + o.residualSubsidy,
              }),
              { totalCost: 0, currentRevenue: 0, recommendedRevenue: 0, netChange: 0, residualSubsidy: 0 },
            );
            const cur = t.totalCost > 0 ? (t.currentRevenue / t.totalCost) * 100 : 0;
            const rec = t.totalCost > 0 ? (t.recommendedRevenue / t.totalCost) * 100 : 0;
            return (
              <tr className="total">
                <td>
                  <span className="mono" style={{
                    color: "var(--ink-3)", textTransform: "uppercase",
                    letterSpacing: "0.06em", fontSize: 9.5,
                  }}>Citywide</span>
                </td>
                <td className="num">{fmt.dollarsK(t.totalCost)}</td>
                <td className="num">{fmt.dollarsK(t.currentRevenue)}</td>
                <td className="num">{cur.toFixed(0)}%</td>
                <td/>
                <td className="num">{fmt.dollarsK(t.recommendedRevenue)}</td>
                <td className="num">
                  <b style={{ color: "var(--accent)" }}>{rec.toFixed(0)}%</b>
                </td>
                <td className="num"><b>{signed(t.netChange)}</b></td>
                <td className="num">{fmt.dollarsK(t.residualSubsidy)}</td>
              </tr>
            );
          })()}
        </tbody>
      </table>

      <h3 className="h3" style={{ marginTop: 18 }}>Policy questions for Council consideration</h3>
      <div className="body">
        <ul>
          <li>
            Are the adopted departmental recovery targets reflective of
            current Council policy direction regarding the appropriate
            balance between user fee support and General Fund support?
          </li>
          <li>
            Are existing fee-specific exceptions consistent with current
            policy priorities, and are additional exceptions warranted
            (e.g., affordable housing, small business support, or other
            priority service categories)?
          </li>
          <li>
            Should the City adopt a written policy regarding inter-study
            inflationary adjustments so that recovery levels do not drift
            below target between comprehensive studies?
          </li>
          <li>
            Over what time horizon should the recommended fee changes be
            phased in? Implementation options are presented in Section 10.
          </li>
        </ul>
      </div>
    </section>
  );
}

// ============================================================================
// § 9 — Recommended Fee Schedule
// ============================================================================

function RecommendedFeeSchedule({ payload }: { payload: ExportPayload }) {
  return (
    <section className="section section-break" style={{ marginBottom: 40 }}>
      <div className="eyebrow">Section 9</div>
      <h2 className="h2">Recommended fee schedule</h2>

      <h3 className="h3" style={{ marginTop: 18 }}>Recommended fee schedule</h3>
      <div className="body" style={{ marginBottom: 12 }}>
        <p>
          The following table summarizes the calculated full cost of service,
          current fee levels, recommended fees, recovery targets, and
          estimated annual fiscal impact for each fee category evaluated in
          this study.
        </p>
      </div>

      <table>
        <thead>
          <tr>
            <th>Fee item</th>
            <th>Dept</th>
            <th className="num">Hours</th>
            <th className="num">Vol/yr</th>
            <th className="num">Unit cost</th>
            <th className="num">Current fee</th>
            <th className="num">Recommended</th>
            <th className="num">Target</th>
            <th className="num">Recovery</th>
            <th className="num">Annual uplift</th>
          </tr>
        </thead>
        <tbody>
          {payload.feeSchedule.map((r) => (
            <tr key={r.id}>
              <td>
                <div>{r.name}</div>
                <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-3)", marginTop: 2 }}>
                  {r.id}
                </div>
              </td>
              <td><span className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>{r.dept}</span></td>
              <td className="num">{r.hours}</td>
              <td className="num">{fmt.int(r.volume)}</td>
              <td className="num">{fmt.dollars(r.unitCost)}</td>
              <td className="num">{fmt.dollars(r.fee)}</td>
              <td className="num"><b style={{ color: "var(--accent)" }}>{fmt.dollars(r.recommended)}</b></td>
              <td className="num">{r.target}%</td>
              <td className="num">{r.recoveryPct.toFixed(0)}%</td>
              <td className="num" style={{
                color: r.uplift > 0 ? "var(--pos)" : r.uplift < 0 ? "var(--neg)" : "var(--ink-3)",
              }}>
                <b>{r.uplift > 0 ? "+" : ""}{fmt.dollarsK(r.uplift)}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ============================================================================
// § 10 — Implementation Options
// ============================================================================

function ImplementationOptions({ payload }: { payload: ExportPayload }) {
  const uplift = payload.summary.potentialUplift;
  const fiscal = payload.cover.fiscal;
  const deptUplift = payload.deptSummaries
    .map((d) => {
      const u = payload.feeSchedule
        .filter((f) => f.dept === d.dept)
        .reduce((acc, f) => acc + Math.max(0, f.uplift), 0);
      return { dept: d.dept, label: deptDisplayName(d.dept), uplift: u };
    })
    .filter((d) => d.uplift > 0)
    .sort((a, b) => b.uplift - a.uplift);

  const phasedYears: { label: string; share: number }[] = [
    { label: "Year 1", share: 1 / 3 },
    { label: "Year 2", share: 2 / 3 },
    { label: "Year 3", share: 1 },
  ];

  return (
    <section className="section section-break" style={{ marginBottom: 40 }}>
      <div className="eyebrow">Section 10</div>
      <h2 className="h2">Implementation options</h2>

      <div className="body">
        <p>
          The Council retains discretion regarding the timing and structure
          of fee adoption. The implementation options summarized below
          illustrate the annualized fiscal impact of common adoption
          approaches relative to the recommended fee schedule developed in
          Section 9. The options are not mutually exclusive — the Council
          may combine elements of each approach as appropriate.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 18 }}>Option A — Immediate full adoption</h3>
      <div className="body">
        <p>
          The recommended fee schedule is adopted in full at the next fee
          adoption hearing and takes effect at the beginning of the
          following fiscal year. This option produces the full annualized
          fiscal impact in Year 1 and most closely aligns adopted fees with
          the estimated reasonable cost of service.
        </p>
        <p>
          Estimated Year 1 annualized fiscal impact:{" "}
          <b>+{fmt.dollarsK(uplift)}</b> in fee revenue relative to current
          fee levels.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 14 }}>Option B — Three-year phased adoption</h3>
      <div className="body">
        <p>
          The recommended fee schedule is phased in over three fiscal years
          in approximately equal increments. This option moderates the
          year-over-year impact on fee payers while progressing toward
          adopted recovery targets within a defined period.
        </p>
      </div>
      <table>
        <thead>
          <tr>
            <th>Phase</th>
            <th className="num">Cumulative share of recommended uplift</th>
            <th className="num">Estimated annualized fiscal impact</th>
          </tr>
        </thead>
        <tbody>
          {phasedYears.map((y) => (
            <tr key={y.label}>
              <td><b>{y.label}</b></td>
              <td className="num">{Math.round(y.share * 100)}%</td>
              <td className="num">
                <b>+{fmt.dollarsK(uplift * y.share)}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="h3" style={{ marginTop: 18 }}>Option C — Selective adoption by department</h3>
      <div className="body">
        <p>
          The recommended fee schedule is adopted on a departmental basis,
          allowing the Council to defer adoption of categories that warrant
          additional policy review. Estimated annualized fiscal impact by
          department is presented below to support selective adoption
          decisions.
        </p>
      </div>
      {deptUplift.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Department</th>
              <th className="num">Estimated annualized fiscal impact</th>
              <th className="num">Share of total</th>
            </tr>
          </thead>
          <tbody>
            {deptUplift.map((d) => (
              <tr key={d.dept}>
                <td><b>{d.label}</b></td>
                <td className="num"><b>+{fmt.dollarsK(d.uplift)}</b></td>
                <td className="num">
                  {uplift > 0 ? `${Math.round((d.uplift / uplift) * 100)}%` : "—"}
                </td>
              </tr>
            ))}
            <tr className="total">
              <td>
                <span className="mono" style={{
                  color: "var(--ink-3)", textTransform: "uppercase",
                  letterSpacing: "0.06em", fontSize: 9.5,
                }}>Citywide</span>
              </td>
              <td className="num"><b>+{fmt.dollarsK(uplift)}</b></td>
              <td className="num">100%</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <div className="body"><p>Not available.</p></div>
      )}

      <div className="body footnote">
        Fiscal impacts shown are estimated annualized impacts at full
        implementation of each option and assume the volume and service-mix
        assumptions described in Section 5. Actual impacts in any given
        year will vary with permit volume and service mix. Fiscal year
        analyzed: {fiscal}.
      </div>
    </section>
  );
}

// ============================================================================
// § 11 — Peer Comparison Survey
// ============================================================================

function PeerComparisonSurvey({ payload }: { payload: ExportPayload }) {
  if (payload.benchmarks.length === 0 || payload.cover.peers.length === 0) {
    return null;
  }
  const outliers = peerOutlierCommentary(payload);
  return (
    <section className="section section-break" style={{ marginBottom: 40 }}>
      <div className="eyebrow">Section 11</div>
      <h2 className="h2">Peer comparison survey</h2>

      <div className="body" style={{ marginBottom: 12 }}>
        <p>
          A peer comparison survey was conducted to provide additional
          context for adopted fee levels. The peer set includes adopted fees
          from {payload.cover.peers.join(", ")}. Peer medians reflect listed
          prices and may understate full cost recovery where peer
          jurisdictions subsidize service costs from their general funds.
        </p>
      </div>

      <table>
        <thead>
          <tr>
            <th>Service</th>
            <th>Dept</th>
            <th className="num">Our fee</th>
            <th className="num">Peer median</th>
            <th className="num">vs median</th>
            <th className="num">vs cost</th>
          </tr>
        </thead>
        <tbody>
          {payload.benchmarks.map((b) => (
            <tr key={b.id}>
              <td>{b.name}</td>
              <td><span className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>{b.dept}</span></td>
              <td className="num">{fmt.dollars(b.fee)}</td>
              <td className="num">{fmt.dollars(b.peerMedian)}</td>
              <td className="num" style={{
                color: b.varianceVsMedian > 5 ? "var(--neg)" : b.varianceVsMedian < -5 ? "var(--warn)" : "var(--pos)",
              }}>
                {b.varianceVsMedian > 0 ? "+" : ""}{Math.round(b.varianceVsMedian)}%
              </td>
              <td className="num" style={{
                color: b.varianceVsCost < -10 ? "var(--neg)" : "var(--ink)",
              }}>
                {b.varianceVsCost > 0 ? "+" : ""}{Math.round(b.varianceVsCost)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {outliers.length > 0 && (
        <div className="body" style={{ marginTop: 14 }}>
          {outliers.map((line, i) => <p key={i}>{line}</p>)}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// § 12 — Recommendations and Next Steps
// ============================================================================

function RecommendationsAndNextSteps() {
  return (
    <section className="section section-break" style={{ marginBottom: 40 }}>
      <div className="eyebrow">Section 12</div>
      <h2 className="h2">Recommendations and next steps</h2>

      <div className="body">
        <p>
          Based on the findings of this study, adoption of an updated fee
          schedule is recommended in order to improve alignment between
          current fees and the cost of providing services.
        </p>
        <p>
          It is further recommended that the City continue annual
          inflationary adjustments between comprehensive fee studies.
        </p>
        <p>
          A comprehensive reevaluation of fee assumptions and service levels
          should be conducted every three to five years.
        </p>
        <p>
          The City should maintain documentation supporting fee calculations
          to ensure ongoing legal defensibility.
        </p>
      </div>
    </section>
  );
}

// ============================================================================
// § 13 — Appendices
// ============================================================================

function Appendices({ payload }: { payload: ExportPayload }) {
  return (
    <section className="section section-break" style={{ marginBottom: 24 }}>
      <div className="eyebrow">Section 13</div>
      <h2 className="h2">Appendices</h2>

      <AppendixA payload={payload}/>
      <AppendixB payload={payload}/>
      <AppendixC payload={payload}/>
      <AppendixD payload={payload}/>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Appendix A — Full Fee Detail
// ---------------------------------------------------------------------------

function AppendixA({ payload }: { payload: ExportPayload }) {
  const totals = payload.feeDetailByDept.reduce(
    (a, g) => ({
      annualCost: a.annualCost + g.total.annualCost,
      annualRevenue: a.annualRevenue + g.total.annualRevenue,
      annualRecommendedRevenue: a.annualRecommendedRevenue + g.total.annualRecommendedRevenue,
      uplift: a.uplift + g.total.uplift,
    }),
    { annualCost: 0, annualRevenue: 0, annualRecommendedRevenue: 0, uplift: 0 },
  );

  return (
    <div className="section">
      <h3 className="h3" style={{ marginTop: 14, fontSize: 14 }}>
        Appendix A — Full Fee Detail
      </h3>
      <div className="body" style={{ marginBottom: 10 }}>
        <p>
          The following tables present the full per-fee detail underlying
          the recommended fee schedule, grouped by department and category
          to match the structure of the published fee resolution. For each
          row the appendix presents staff time, annual service volume,
          calculated unit cost, current adopted fee, recommended fee,
          adopted recovery target, calculated recovery, annual revenue
          under current and recommended pricing, and estimated annualized
          fiscal impact.
        </p>
      </div>

      {payload.feeDetailByDept.map((g) => (
        <div className="row" key={g.dept} style={{ marginTop: 16 }}>
          <h3 className="h3" style={{ fontSize: 13, marginBottom: 6 }}>
            {g.deptName}{" "}
            <span className="mono" style={{
              fontSize: 10, color: "var(--ink-3)", marginLeft: 6, fontWeight: 400,
            }}>{g.dept}</span>
          </h3>
          {g.categories.map((c) => (
            <div key={c.category} style={{ marginTop: 10 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>
                {c.category}
              </div>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "8%" }}>Fee #</th>
                    <th>Fee item</th>
                    <th className="num">Hrs</th>
                    <th className="num">Vol/yr</th>
                    <th className="num">Unit cost</th>
                    <th className="num">Annual cost</th>
                    <th className="num">Current fee</th>
                    <th className="num">Annual rev</th>
                    <th className="num">Recommended</th>
                    <th className="num">Target</th>
                    <th className="num">Recovery</th>
                    <th className="num">Annual impact</th>
                  </tr>
                </thead>
                <tbody>
                  {c.rows.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <span className="mono" style={{
                          fontSize: 10, color: "var(--ink-2)",
                        }}>{f.feeNo ?? "—"}</span>
                      </td>
                      <td>
                        <div>{f.name}</div>
                        <div className="mono" style={{
                          fontSize: 9.5, color: "var(--ink-3)", marginTop: 2,
                        }}>
                          {f.subcategory ?? f.id}
                          {f.unit ? ` · ${f.unit}` : ""}
                        </div>
                      </td>
                      <td className="num">{f.hours}</td>
                      <td className="num">{fmt.int(f.volume)}</td>
                      <td className="num">{fmt.dollars(f.unitCost)}</td>
                      <td className="num">{fmt.dollarsK(f.annualCost)}</td>
                      <td className="num">{fmt.dollars(f.fee)}</td>
                      <td className="num">{fmt.dollarsK(f.annualRevenue)}</td>
                      <td className="num">
                        <b style={{ color: "var(--accent)" }}>{fmt.dollars(f.recommended)}</b>
                      </td>
                      <td className="num">{f.target}%</td>
                      <td className="num">{f.recoveryPct.toFixed(0)}%</td>
                      <td className="num" style={{
                        color: f.uplift > 0 ? "var(--pos)" : f.uplift < 0 ? "var(--neg)" : "var(--ink-3)",
                      }}>
                        <b>{f.uplift > 0 ? "+" : ""}{fmt.dollarsK(f.uplift)}</b>
                      </td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td colSpan={5}>
                      <span className="mono" style={{
                        color: "var(--ink-3)", textTransform: "uppercase",
                        letterSpacing: "0.06em", fontSize: 9.5,
                      }}>{c.category} subtotal</span>
                    </td>
                    <td className="num">{fmt.dollarsK(c.subtotal.annualCost)}</td>
                    <td/>
                    <td className="num">{fmt.dollarsK(c.subtotal.annualRevenue)}</td>
                    <td className="num">{fmt.dollarsK(c.subtotal.annualRecommendedRevenue)}</td>
                    <td colSpan={2}/>
                    <td className="num">
                      <b>{c.subtotal.uplift > 0 ? "+" : ""}{fmt.dollarsK(c.subtotal.uplift)}</b>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
          <table style={{ marginTop: 6 }}>
            <tbody>
              <tr className="total">
                <td style={{ width: "32%" }}>
                  <span className="mono" style={{
                    color: "var(--ink-3)", textTransform: "uppercase",
                    letterSpacing: "0.06em", fontSize: 9.5,
                  }}>{g.deptName} total</span>
                </td>
                <td className="num">Annual cost {fmt.dollarsK(g.total.annualCost)}</td>
                <td className="num">Current rev {fmt.dollarsK(g.total.annualRevenue)}</td>
                <td className="num">Recommended rev {fmt.dollarsK(g.total.annualRecommendedRevenue)}</td>
                <td className="num">
                  <b>Net impact {g.total.uplift > 0 ? "+" : ""}{fmt.dollarsK(g.total.uplift)}</b>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}

      <table style={{ marginTop: 14 }}>
        <tbody>
          <tr className="total">
            <td style={{ width: "32%" }}>
              <span className="mono" style={{
                color: "var(--ink-3)", textTransform: "uppercase",
                letterSpacing: "0.06em", fontSize: 9.5,
              }}>Citywide</span>
            </td>
            <td className="num">Annual cost {fmt.dollarsK(totals.annualCost)}</td>
            <td className="num">Current rev {fmt.dollarsK(totals.annualRevenue)}</td>
            <td className="num">Recommended rev {fmt.dollarsK(totals.annualRecommendedRevenue)}</td>
            <td className="num">
              <b>Net impact {totals.uplift > 0 ? "+" : ""}{fmt.dollarsK(totals.uplift)}</b>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Appendix B — Fully Burdened Hourly Rate Detail
// ---------------------------------------------------------------------------

function AppendixB({ payload }: { payload: ExportPayload }) {
  return (
    <div className="section" style={{ marginTop: 22 }}>
      <h3 className="h3" style={{ fontSize: 14 }}>
        Appendix B — Fully Burdened Hourly Rate Detail
      </h3>
      <div className="body" style={{ marginBottom: 10 }}>
        <p>
          The following tables present the calculated Fully Burdened Hourly
          Rate for each direct fee department broken into the functional
          cost buckets that compose it: direct labor (salaries and
          benefits), departmental operating cost (presented by operating
          category and an allocated share of shared development-services
          operating cost), and allocated indirect overhead from the City&apos;s
          Cost Allocation Plan. Hourly rates are derived from annualized
          cost components divided by total productive hours available
          within the department.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 12 }}>Summary by department</h3>
      <table>
        <thead>
          <tr>
            <th>Department</th>
            <th className="num">Pos.</th>
            <th className="num">FTE</th>
            <th className="num">Productive hrs</th>
            <th className="num">Direct $/hr</th>
            <th className="num">Op $/hr</th>
            <th className="num">Overhead $/hr</th>
            <th className="num">FBHR</th>
          </tr>
        </thead>
        <tbody>
          {payload.deptSummaries.map((d) => {
            const productive = d.productiveHours * d.fte;
            return (
              <tr key={d.dept}>
                <td>
                  <b>{deptDisplayName(d.dept)}</b>
                  <span className="mono" style={{
                    fontSize: 10, color: "var(--ink-3)", marginLeft: 6,
                  }}>{d.dept}</span>
                </td>
                <td className="num">{d.positions}</td>
                <td className="num">{d.fte.toFixed(1)}</td>
                <td className="num">{fmt.int(productive)}</td>
                <td className="num">${Math.round(d.directRate)}</td>
                <td className="num">${Math.round(d.operatingRate)}</td>
                <td className="num">${Math.round(d.capRate)}</td>
                <td className="num">
                  <b style={{ color: "var(--accent)" }}>${Math.round(d.fbhr)}</b>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {payload.fbhrDetail.map((d) => (
        <div className="row" key={d.dept} style={{ marginTop: 18 }}>
          <h3 className="h3" style={{ fontSize: 13 }}>
            {d.deptName}{" "}
            <span className="mono" style={{
              fontSize: 10, color: "var(--ink-3)", marginLeft: 6, fontWeight: 400,
            }}>{d.dept}</span>
          </h3>
          <div className="body" style={{ marginBottom: 6 }}>
            <p style={{ marginBottom: 6 }}>
              {d.positions} position{d.positions === 1 ? "" : "s"} ·{" "}
              {d.fte.toFixed(1)} FTE ·{" "}
              {fmt.int(d.productiveHoursPerFte)} productive hours per FTE ·{" "}
              {fmt.int(d.totalProductiveHours)} total productive hours
            </p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Functional cost bucket</th>
                <th className="num">Annual $</th>
                <th className="num">Share</th>
                <th className="num">$ / productive hr</th>
              </tr>
            </thead>
            <tbody>
              {d.buckets.map((b, i) => (
                <tr key={`${b.label}-${i}`}>
                  <td>{b.label}</td>
                  <td className="num">{fmt.dollarsK(b.dollars)}</td>
                  <td className="num" style={{ color: "var(--ink-3)" }}>
                    {d.totalCost > 0 ? `${Math.round((b.dollars / d.totalCost) * 100)}%` : "—"}
                  </td>
                  <td className="num">${b.perHour.toFixed(2)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>
                  <span className="mono" style={{
                    color: "var(--ink-3)", textTransform: "uppercase",
                    letterSpacing: "0.06em", fontSize: 9.5,
                  }}>Total ÷ {fmt.int(d.totalProductiveHours)} hrs</span>
                </td>
                <td className="num">{fmt.dollarsK(d.totalCost)}</td>
                <td className="num">100%</td>
                <td className="num">
                  <b style={{ color: "var(--accent)" }}>${d.fbhr.toFixed(2)}</b>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}

      <div className="body" style={{
        marginTop: 12, fontSize: 11.5, color: "var(--ink-3)",
      }}>
        FBHR components are presented in dollars per productive hour.
        Productive hours represent paid hours net of holidays, leave,
        training, and other non-billable activities, as described in
        Section 5. Departmental operating buckets are derived from the
        City&apos;s adopted budget operating appropriations net of
        line-level exclusions documented in Section 4. Shared
        development-services operating cost is allocated to direct fee
        departments on a productive-hours-share basis.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Appendix C — Peer Comparison Survey
// ---------------------------------------------------------------------------

function AppendixC({ payload }: { payload: ExportPayload }) {
  const peers = payload.cover.peers;
  const groups = payload.peerSurveyByDept;

  if (groups.length === 0) {
    return (
      <div className="section" style={{ marginTop: 22 }}>
        <h3 className="h3" style={{ fontSize: 14 }}>
          Appendix C — Peer Comparison Survey
        </h3>
        <div className="body"><p>Not available.</p></div>
      </div>
    );
  }

  return (
    <div className="section" style={{ marginTop: 22 }}>
      <h3 className="h3" style={{ fontSize: 14 }}>
        Appendix C — Peer Comparison Survey
      </h3>
      <div className="body" style={{ marginBottom: 10 }}>
        <p>
          The comparative fee survey below extends Section 11 to present
          the full per-fee detail across services modeled in this study
          where comparator data is available. Peer values are sourced from
          publicly adopted fee schedules of the comparator jurisdictions
          listed below, as in effect during the study period. Peer fees are
          listed prices and may understate full cost recovery where peer
          jurisdictions subsidize the cost of service from their general
          funds. Rows marked &ldquo;N/A&rdquo; indicate that the
          corresponding peer jurisdiction does not separately publish the
          fee or that its pricing structure is not directly comparable.
        </p>
        <p>
          Comparator jurisdictions:{" "}
          {peers.length > 0 ? peers.join(", ") : "Not available."}
        </p>
      </div>

      {groups.map((g) => (
        <div className="row" key={g.dept} style={{ marginTop: 14 }}>
          <h3 className="h3" style={{ fontSize: 13 }}>
            {g.deptName}{" "}
            <span className="mono" style={{
              fontSize: 10, color: "var(--ink-3)", marginLeft: 6, fontWeight: 400,
            }}>{g.dept}</span>
          </h3>
          <table>
            <thead>
              <tr>
                <th style={{ width: "8%" }}>Fee #</th>
                <th>Fee item</th>
                <th className="num">Our fee</th>
                {peers.map((p) => (
                  <th key={p} className="num" style={{ minWidth: 70 }}>{p}</th>
                ))}
                <th className="num">Peer median</th>
                <th className="num">vs median</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => (
                <PeerSurveyRow key={r.id} row={r} peers={peers}/>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="body" style={{
        marginTop: 12, fontSize: 11.5, color: "var(--ink-3)",
      }}>
        Per-agency values reflect adopted fee schedules as compiled during
        the study period. Where an agency&apos;s fee is not reducible to a
        single dollar amount comparable to ours (for example, deposit
        plus actual time, or formula based on construction valuation),
        the agency&apos;s phrasing is reproduced in lieu of a numeric value
        and is excluded from the median.
      </div>
    </div>
  );
}

function PeerSurveyRow({
  row, peers,
}: {
  row: ExportPayload["peerSurveyByDept"][number]["rows"][number];
  peers: string[];
}) {
  const valueByAgency = new Map(row.values.map((v) => [v.agency, v]));
  return (
    <tr>
      <td>
        <span className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>
          {row.feeNo ?? "—"}
        </span>
      </td>
      <td>
        <div>{row.name}</div>
        <div className="mono" style={{
          fontSize: 9.5, color: "var(--ink-3)", marginTop: 2,
        }}>
          {row.category}
          {row.unit ? ` · ${row.unit}` : ""}
        </div>
        {row.notes.length > 0 && (
          <div style={{
            fontSize: 10, color: "var(--ink-3)", marginTop: 2,
          }}>
            {row.notes[0]}
          </div>
        )}
      </td>
      <td className="num"><b>{fmt.dollars(row.ourFee)}</b></td>
      {peers.map((p) => {
        const v = valueByAgency.get(p);
        if (!v) {
          return <td key={p} className="num" style={{ color: "var(--ink-3)" }}>N/A</td>;
        }
        if (v.value != null) {
          return (
            <td key={p} className="num" title={v.note ?? ""}
              style={{ color: v.comparable ? "var(--ink)" : "var(--ink-3)" }}
            >{fmt.dollars(v.value)}</td>
          );
        }
        return (
          <td key={p} className="num" title={v.note ?? ""}
            style={{ color: "var(--ink-3)", fontSize: 10 }}
          >
            {v.valueText ?? "N/A"}
          </td>
        );
      })}
      <td className="num">
        {row.peerMedian > 0 ? fmt.dollars(row.peerMedian) : <span style={{ color: "var(--ink-3)" }}>—</span>}
      </td>
      <td className="num" style={{
        color: row.varianceVsMedian == null ? "var(--ink-3)" :
          row.varianceVsMedian > 5 ? "var(--neg)" :
          row.varianceVsMedian < -5 ? "var(--warn)" : "var(--pos)",
      }}>
        {row.varianceVsMedian == null
          ? "—"
          : `${row.varianceVsMedian > 0 ? "+" : ""}${Math.round(row.varianceVsMedian)}%`}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Appendix D — Assumptions and Limitations
// ---------------------------------------------------------------------------

function AppendixD({ payload }: { payload: ExportPayload }) {
  const total = payload.reviewFlags.reduce((a, f) => a + f.count, 0);
  return (
    <div className="section" style={{ marginTop: 22 }}>
      <h3 className="h3" style={{ fontSize: 14 }}>
        Appendix D — Assumptions and Limitations
      </h3>

      <h3 className="h3" style={{ marginTop: 12 }}>Study assumptions</h3>
      <table>
        <thead>
          <tr>
            <th style={{ width: "32%" }}>Item</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {payload.assumptions.map((a) => (
            <tr key={a.label}>
              <td style={{ color: "var(--ink-2)" }}>{a.label}</td>
              <td>{a.value || "Not available."}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="h3" style={{ marginTop: 22 }}>Study limitations</h3>
      <div className="body">
        <ul>
          <li>
            Cost of service results reflect a point-in-time analysis based
            on adopted budget appropriations, payroll records, and
            operational data for the fiscal year analyzed. Subsequent
            changes in compensation, staffing structure, contracted
            services, or overhead allocation methodology will affect
            calculated rates.
          </li>
          <li>
            Service-level staff time estimates reflect average effort based
            on operational review and consultation with departmental staff.
            Effort required for an individual project may vary materially
            from the modeled average; the methodology is designed to
            produce defensible average-cost estimates suitable for use in
            establishing a published fee schedule.
          </li>
          <li>
            Annualized fiscal impacts are estimated using projected service
            volumes derived from recent workload experience. Actual revenue
            collected in any given year will vary with permit volume,
            economic conditions, and the service mix presented for
            processing.
          </li>
          <li>
            Recommended fees are calculated at the estimated reasonable
            cost of providing the service, multiplied by the adopted
            recovery target. The study does not establish or recommend
            recovery targets themselves; selection of the appropriate
            recovery target remains a policy determination of the City
            Council.
          </li>
          <li>
            The comparative fee survey is presented for context and is not
            a substitute for cost-based analysis. Peer fees reflect
            adopted listed prices that may be subsidized from the
            comparator jurisdiction&apos;s general fund and may not reflect
            the comparator&apos;s full cost of service.
          </li>
          <li>
            The study is intended to support adoption of a fee schedule
            for the fiscal year analyzed. A comprehensive reevaluation is
            recommended every three to five years; interim inflationary
            adjustments are recommended in intervening years to limit
            recovery drift.
          </li>
        </ul>
      </div>

      {total > 0 && (
        <>
          <h3 className="h3" style={{ marginTop: 18 }}>Outstanding source review items</h3>
          <div className="body" style={{ marginBottom: 10 }}>
            <p>
              {total} source record{total === 1 ? "" : "s"} did not
              auto-map at the time this report was generated. The figures
              throughout the report reflect the current model state;
              outstanding mapping items are listed below for transparency.
            </p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Domain</th>
                <th className="num">Count</th>
                <th>Sample unmapped row</th>
              </tr>
            </thead>
            <tbody>
              {payload.reviewFlags.map((f) => {
                const sample = f.unmapped[0];
                const raw = sample?.raw.filter(Boolean).slice(0, 5).join(" · ");
                return (
                  <tr key={f.domain}>
                    <td><b>{f.label}</b></td>
                    <td className="num">{f.count}</td>
                    <td style={{ color: "var(--ink-3)", fontSize: 10.5 }}>{raw ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Heuristic interpretation helpers — produce consultant-style adjectives /
// sentences sized to the materiality of the underlying numbers.
// ============================================================================

function recoveryTargetSummaryLabel(payload: ExportPayload): string {
  const blended = payload.summary.intendedRecoveryPct;
  return `${Math.round(blended)}% blended cost recovery`;
}

const SOURCE_DOMAINS: { domain: ExportPayload["reviewFlags"][number]["domain"]; label: string }[] = [
  { domain: "positions", label: "Labor" },
  { domain: "operating", label: "Departmental Operating" },
  { domain: "cap",       label: "Cost Allocation Plan" },
  { domain: "services",  label: "Service Catalog" },
  { domain: "fees",      label: "Current Fee Schedule" },
  { domain: "volume",    label: "Annual Volume of Activity" },
];

interface SourceInventoryRow {
  domain: string;
  label: string;
  records: number;
  files: string[];
  validated: string;
  review: number;
}

function buildSourceInventory(payload: ExportPayload): SourceInventoryRow[] {
  const byDomain = new Map<string, { count: number; files: Set<string>; review: number; flagged: number }>();
  for (const { domain } of SOURCE_DOMAINS) {
    byDomain.set(domain, { count: 0, files: new Set(), review: 0, flagged: 0 });
  }
  for (const row of payload.lineage) {
    const bucket = byDomain.get(row.domain);
    if (!bucket) continue;
    bucket.count += 1;
    if (row.lineage.file) bucket.files.add(row.lineage.file);
    if (row.lineage.confidence === "review") bucket.flagged += 1;
  }
  const flagCounts: Record<string, number> = {};
  for (const f of payload.reviewFlags) flagCounts[f.domain] = f.count;

  return SOURCE_DOMAINS.map(({ domain, label }) => {
    const b = byDomain.get(domain)!;
    const reviewCount = (flagCounts[domain] ?? 0) + b.flagged;
    const validated = b.count > 0 ? `${Math.max(0, b.count - b.flagged)}` : "—";
    return {
      domain,
      label,
      records: b.count,
      files: Array.from(b.files).sort(),
      validated,
      review: reviewCount,
    };
  });
}

function deptDisplayName(code: string): string {
  // Defer to the registry's short form for known fee depts; pass
  // through unknown codes unchanged so legacy export rows don't blow
  // up on the registry lookup.
  return (FEE_DEPTS as readonly string[]).includes(code)
    ? deptName(code as DeptCode)
    : code;
}

function signed(v: number): string {
  if (Math.abs(v) < 500) return "$0";
  return `${v > 0 ? "+" : "−"}${fmt.dollarsK(Math.abs(v))}`;
}

/** Render a positive/negative dollar amount in accounting style:
 *  positives unsigned, negatives wrapped in parentheses. Used in
 *  summary tables where a column carries both surplus and subsidy. */
function parens(v: number): string {
  if (Math.abs(v) < 500) return fmt.dollarsK(0);
  if (v < 0) return `(${fmt.dollarsK(Math.abs(v))})`;
  return fmt.dollarsK(v);
}

/** Build the post-table interpretation in Summary of Findings. Generates
 *  one short paragraph per department, weighted by materiality so the
 *  paragraph appears only when there's something policy-relevant to say. */
function deriveFindings(payload: ExportPayload): string[] {
  const out: string[] = [];
  for (const d of payload.deptSummaries) {
    if (d.totalCost <= 0) continue;
    const recovery = (d.currentRevenue / d.totalCost) * 100;
    const gap = recovery - d.target;
    const dept = deptDisplayName(d.dept);
    if (recovery < d.target * 0.5) {
      out.push(
        `${dept} services currently recover substantially below the adopted recovery target. ` +
        `The shortfall reflects historically limited fee adjustments and a labor-intensive ` +
        `service mix that has outpaced existing fee levels.`,
      );
    } else if (recovery < d.target * 0.85) {
      out.push(
        `${dept} services recover ${recovery.toFixed(0)}% of cost against a ${d.target}% target — ` +
        `materially below the adopted recovery objective.`,
      );
    } else if (gap >= -5 && gap <= 5) {
      // Near target — short single line.
      out.push(
        `${dept} services recover close to the adopted ${d.target}% target.`,
      );
    } else if (recovery > 105) {
      out.push(
        `${dept} services currently recover above 100% of calculated cost; the recommended ` +
        `fees adjust downward to align with the adopted recovery target.`,
      );
    }
  }
  // Citywide subsidy framing — only when the subsidy is material.
  const subsidy = payload.summary.annualSubsidy;
  if (subsidy >= 500_000) {
    out.push(
      `On a citywide basis, the General Fund currently subsidizes approximately ` +
      `${fmt.dollarsK(subsidy)} per year in development services activity. Closing the ` +
      `recoverable share of that subsidy is the principal fiscal outcome of adopting ` +
      `the recommended schedule.`,
    );
  }
  return out;
}

/** One-sentence interpretation comparing current recovery to target for a
 *  department. Tone scales with the magnitude of the gap. */
function recoveryNarrative(recovery: number, target: number, dept: string): string {
  const gap = recovery - target;
  if (Math.abs(gap) <= 5) {
    return `Current recovery is near the adopted target, with limited additional fee adjustment required.`;
  }
  if (gap < 0 && recovery < target * 0.6) {
    return (
      `The shortfall is substantial and is the principal driver of ` +
      `recommended fee increases in this section.`
    );
  }
  if (gap < 0) {
    return (
      `${dept} fees have not kept pace with the cost of providing ` +
      `services, producing a material recovery shortfall against ` +
      `policy intent.`
    );
  }
  return (
    `Current fees exceed the adopted recovery target; recommended fees ` +
    `move closer to policy intent through targeted reductions.`
  );
}

/** Identify the most material fee adjustments in a department and call them
 *  out by name. Caps to two items so the paragraph stays readable. */
function adjustmentNarrative(fees: ExportPayload["feeSchedule"]): string {
  const material = [...fees]
    .filter((f) => Math.abs(f.uplift) >= 5000)
    .sort((a, b) => Math.abs(b.uplift) - Math.abs(a.uplift));
  if (material.length === 0) return "Individual fee adjustments are modest.";
  const top = material.slice(0, 2);
  const phrases = top.map((f) => {
    const direction = f.uplift > 0 ? "increase" : "reduction";
    return `${f.name} (${signed(f.uplift)}/yr ${direction})`;
  });
  return `The largest individual adjustments are concentrated in ${phrases.join(" and ")}.`;
}

/** Peer survey outlier commentary. Only fires when there's a clear story:
 *  many fees materially below or above peer median. */
function peerOutlierCommentary(payload: ExportPayload): string[] {
  const withPeer = payload.benchmarks.filter((b) => b.peerMedian > 0);
  if (withPeer.length === 0) return [];
  const wellBelow = withPeer.filter((b) => b.varianceVsMedian < -20);
  const wellAbove = withPeer.filter((b) => b.varianceVsMedian > 20);
  const lines: string[] = [];
  if (wellBelow.length >= 3) {
    lines.push(
      `${wellBelow.length} fees are priced more than 20% below the peer median, ` +
      `suggesting room for upward adjustment without exceeding the regional pricing range.`,
    );
  }
  if (wellAbove.length >= 3) {
    lines.push(
      `${wellAbove.length} fees are priced more than 20% above the peer median. These ` +
      `instances should be evaluated against the calculated cost of service to confirm ` +
      `current levels remain defensible.`,
    );
  }
  if (lines.length === 0) {
    lines.push(
      `Most fees fall within a normal range relative to peer medians; no material ` +
      `outliers were identified.`,
    );
  }
  return lines;
}

// ============================================================================
// Small helpers
// ============================================================================


