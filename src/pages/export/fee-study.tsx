
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useBuildState } from "@/lib/store";
import { useActiveFiscalYear, useActiveJurisdiction } from "@/lib/active";
import {
  buildExportPayload, type ExportPayload,
} from "@/lib/export/buildPayload";
import { exportFeeStudyXlsx, downloadBlob } from "@/lib/export/excel";
import { fmt } from "@/lib/format";
import { Btn, Icon } from "@/components/ui";

export default function FeeStudyExportPage() {
  const state = useBuildState();
  const jurisdiction = useActiveJurisdiction();
  const fiscalYear = useActiveFiscalYear();
  const payload = useMemo<ExportPayload>(() => buildExportPayload({
    positions:    state.positions,
    operating:    state.operating,
    capPools:     state.capPools,
    workload:     state.workload,
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

  return (
    <>
      <PrintStyles/>
      <Toolbar payload={payload}/>
      <Report payload={payload}/>
    </>
  );
}

/** Print stylesheet — kept inline so the route is self-contained. */
function PrintStyles() {
  return (
    <style>{`
      @page { size: letter portrait; margin: 0.7in 0.7in 0.8in 0.7in; }
      @media print {
        body { background: white !important; }
        .no-print { display: none !important; }
        .report { padding: 0 !important; }
        .section { break-inside: avoid; }
        .section-break { break-before: page; }
        .row { break-inside: avoid; }
        table { break-inside: auto; }
        thead { display: table-header-group; }
        tr, td, th { break-inside: avoid; }
      }
      .report {
        max-width: 7.4in;
        margin: 0 auto;
        background: white;
        padding: 40px 32px 56px;
        color: var(--ink);
        font-family: var(--ff-ui), "IBM Plex Sans", system-ui, sans-serif;
      }
      .report h1, .report h2, .report h3 { letter-spacing: -0.01em; }
      .report .eyebrow {
        font-family: var(--ff-mono);
        font-size: 10px; font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--ink-3);
      }
      .report .title { font-size: 30px; font-weight: 600; line-height: 1.1; }
      .report .h2 { font-size: 18px; font-weight: 600; margin: 0 0 12px; }
      .report .h3 { font-size: 13px; font-weight: 600; margin: 0 0 8px; }
      .report .body { font-size: 12.5px; color: var(--ink-2); line-height: 1.6; }
      .report .body p { margin: 0 0 10px; }
      .report .body p:last-child { margin-bottom: 0; }
      .report .body ul { margin: 6px 0 10px; padding-left: 20px; }
      .report .body li { margin-bottom: 4px; }
      .report table { width: 100%; border-collapse: collapse; font-size: 11px; }
      .report th, .report td { padding: 6px 8px; text-align: left; vertical-align: top; }
      .report th {
        font-family: var(--ff-mono);
        font-size: 9.5px; font-weight: 700; letter-spacing: 0.08em;
        text-transform: uppercase; color: var(--ink-3);
        border-bottom: 1px solid var(--rule-strong);
        background: var(--paper-2);
      }
      .report td { border-bottom: 1px solid var(--rule); }
      .report td.num, .report th.num { text-align: right; font-variant-numeric: tabular-nums; }
      .report .total td {
        border-top: 1.5px solid var(--ink);
        border-bottom: none;
        background: var(--paper-2);
        font-weight: 600;
      }
      .report .mono { font-family: var(--ff-mono); }
    `}</style>
  );
}

function Toolbar({ payload }: { payload: ExportPayload }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="no-print" style={{
      position: "sticky", top: 0, zIndex: 20,
      background: "var(--paper)",
      borderBottom: "1px solid var(--rule)",
      padding: "10px 24px",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div className="mono" style={{
          fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>Export · Print preview</div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {payload.cover.cityName} · {payload.cover.fiscal} fee study
        </div>
      </div>
      <div style={{ flex: 1 }}/>
      <Btn kind="ghost" onClick={() => window.close()}>Close</Btn>
      <Btn
        kind="ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const blob = await exportFeeStudyXlsx(payload);
            downloadBlob(blob, `${slugCity(payload.cover.cityName)}-fee-study.xlsx`);
          } finally { setBusy(false); }
        }}
      >
        <Icon name="download" size={13}/> {busy ? "Generating…" : "Excel"}
      </Btn>
      <Btn kind="primary" onClick={() => window.print()}>
        <Icon name="download" size={13}/> Print / Save PDF
      </Btn>
    </div>
  );
}

function slugCity(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Auto-fire window.print on first load if the URL has ?print=1. */
function useAutoPrint() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("print") === "1") {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, []);
}

function Report({ payload }: { payload: ExportPayload }) {
  useAutoPrint();
  return (
    <div className="report">
      <Cover payload={payload}/>
      <TableOfContents/>
      <ExecutiveSummary payload={payload}/>
      <BackgroundAndObjectives payload={payload}/>
      <LegalFramework payload={payload}/>
      <Methodology payload={payload}/>
      <SummaryOfFindings payload={payload}/>
      <DepartmentAnalysis payload={payload}/>
      <RecommendedFeeSchedule payload={payload}/>
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
    <section className="section section-break" style={{
      paddingTop: 80, paddingBottom: 48,
      borderBottom: "1px solid var(--rule)",
      marginBottom: 48,
    }}>
      <div className="eyebrow">{payload.cover.cityName}</div>
      <div className="title display" style={{ fontSize: 32, marginTop: 8 }}>
        Development Services Fee Study
      </div>
      <div style={{ fontSize: 14, color: "var(--ink-2)", marginTop: 14, lineHeight: 1.5 }}>
        Cost of Service · Cost Recovery Policy · Recommended Fee Schedule
      </div>

      <div style={{
        marginTop: 48,
        display: "grid", gridTemplateColumns: "140px 1fr",
        gap: "8px 16px", fontSize: 12.5,
      }}>
        <Label>Fiscal year</Label>
        <Value>{payload.cover.fiscal}</Value>
        <Label>Prepared by</Label>
        <Value>Finance Department · Afferent</Value>
        <Label>Peer cities</Label>
        <Value>
          {payload.cover.peers.length > 0 ? payload.cover.peers.join(" · ") : "—"}
        </Value>
        <Label>Generated</Label>
        <Value>
          {new Date(payload.cover.generatedAt).toLocaleDateString(undefined, {
            month: "long", day: "numeric", year: "numeric",
          })}
        </Value>
      </div>
    </section>
  );
}

const TOC_SECTIONS = [
  "Executive Summary",
  "Background and Study Objectives",
  "Legal Framework and Cost Recovery Policy",
  "Study Methodology",
  "Summary of Findings",
  "Department Analysis",
  "Recommended Fee Schedule",
  "Peer Comparison Survey",
  "Recommendations and Next Steps",
  "Appendices",
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

      <div style={{
        marginTop: 22,
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0,
        border: "1px solid var(--rule)",
      }}>
        <Tile label="Services modeled" value={s.services.toString()}/>
        <Tile label="FTE" value={s.fte.toFixed(1)}/>
        <Tile label="Current recovery"
              value={`${s.recoveryPct.toFixed(0)}%`}
              tone={s.recoveryPct >= 80 ? "pos" : s.recoveryPct >= 50 ? "warn" : "neg"}/>
        <Tile label="Annual gap" value={fmt.dollarsK(s.recoveryGap)} tone="neg" last/>
        <Tile label="Policy-intended recovery"
              value={`${s.intendedRecoveryPct.toFixed(0)}%`}/>
        <Tile label="Annual subsidy" value={fmt.dollarsK(s.annualSubsidy)} tone="warn"/>
        <Tile label="Potential uplift" value={fmt.dollarsK(s.potentialUplift)} tone="pos"/>
        <Tile label="Total annual cost" value={fmt.dollarsK(s.totalCost)} last/>
      </div>
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
    <div className="body" style={{
      marginTop: 14, paddingTop: 10,
      borderTop: "1px dashed var(--rule)",
      fontSize: 11.5, color: "var(--ink-3)",
    }}>
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
// § 4 — Study Methodology
// ============================================================================

function Methodology({ payload }: { payload: ExportPayload }) {
  const productiveHours = payload.assumptions.find(
    (a) => a.label === "Productive hours/yr (default)",
  )?.value ?? "1,720";
  return (
    <section className="section section-break" style={{ marginBottom: 40 }}>
      <div className="eyebrow">Section 4</div>
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
// § 5 — Summary of Findings
// ============================================================================

function SummaryOfFindings({ payload }: { payload: ExportPayload }) {
  const s = payload.summary;
  const findings = deriveFindings(payload);
  return (
    <section className="section section-break" style={{ marginBottom: 40 }}>
      <div className="eyebrow">Section 5</div>
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
          The table below summarizes estimated annual service costs, current
          fee revenues, current recovery levels, and projected recovery under
          the recommended fee schedule.
        </p>
      </div>

      <table style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th>Department</th>
            <th className="num">Annual cost</th>
            <th className="num">Current revenue</th>
            <th className="num">Current recovery</th>
            <th className="num">Policy target</th>
            <th className="num">Annual subsidy</th>
          </tr>
        </thead>
        <tbody>
          {payload.deptSummaries.map((d) => {
            const recovery = d.totalCost > 0 ? (d.currentRevenue / d.totalCost) * 100 : 0;
            return (
              <tr key={d.dept}>
                <td>
                  <b>{deptDisplayName(d.dept)}</b>
                  <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginLeft: 6 }}>
                    {d.dept}
                  </span>
                </td>
                <td className="num">{fmt.dollarsK(d.totalCost)}</td>
                <td className="num">{fmt.dollarsK(d.currentRevenue)}</td>
                <td className="num"><b>{recovery.toFixed(0)}%</b></td>
                <td className="num" style={{ color: "var(--ink-3)" }}>{d.target}%</td>
                <td className="num">{fmt.dollarsK(Math.max(0, d.totalCost - d.currentRevenue))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="body" style={{ marginTop: 14 }}>
        {findings.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </section>
  );
}

// ============================================================================
// § 6 — Department Analysis
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
      <div className="eyebrow">Section 6</div>
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
  const recommendedRevenue = fees.reduce(
    (a, f) => a + (f.recommended * f.volume), 0,
  );
  const projectedRecoveryPct = dept.totalCost > 0
    ? (recommendedRevenue / dept.totalCost) * 100
    : 0;
  const recovery = dept.totalCost > 0 ? (dept.currentRevenue / dept.totalCost) * 100 : 0;
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
        <p>
          The department&apos;s Fully Burdened Hourly Rate is approximately{" "}
          <b>${Math.round(dept.fbhr)} per hour</b>, comprised of approximately{" "}
          ${Math.round(dept.directRate)} in direct labor,{" "}
          ${Math.round(dept.operatingRate)} in departmental operating costs,
          and ${Math.round(dept.capRate)} in allocated indirect overhead per
          productive hour. {driverNarrative}
        </p>
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
// § 7 — Recommended Fee Schedule
// ============================================================================

function RecommendedFeeSchedule({ payload }: { payload: ExportPayload }) {
  return (
    <section className="section section-break" style={{ marginBottom: 40 }}>
      <div className="eyebrow">Section 7</div>
      <h2 className="h2">Recommended fee schedule</h2>

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
// § 8 — Peer Comparison Survey
// ============================================================================

function PeerComparisonSurvey({ payload }: { payload: ExportPayload }) {
  if (payload.benchmarks.length === 0 || payload.cover.peers.length === 0) {
    return null;
  }
  const outliers = peerOutlierCommentary(payload);
  return (
    <section className="section section-break" style={{ marginBottom: 40 }}>
      <div className="eyebrow">Section 8</div>
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
// § 9 — Recommendations and Next Steps
// ============================================================================

function RecommendationsAndNextSteps() {
  return (
    <section className="section section-break" style={{ marginBottom: 40 }}>
      <div className="eyebrow">Section 9</div>
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
// § 10 — Appendices
// ============================================================================

function Appendices({ payload }: { payload: ExportPayload }) {
  return (
    <section className="section section-break" style={{ marginBottom: 24 }}>
      <div className="eyebrow">Section 10</div>
      <h2 className="h2">Appendices</h2>

      <h3 className="h3" style={{ marginTop: 14 }}>Appendix A · Cost of service detail</h3>
      <CostOfServiceTable payload={payload}/>

      <h3 className="h3" style={{ marginTop: 22 }}>Appendix B · Department FBHR composition</h3>
      <DeptFbhrTable payload={payload}/>

      <h3 className="h3" style={{ marginTop: 22 }}>Appendix C · Study assumptions</h3>
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
              <td>{a.value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ReviewFlagsAppendix payload={payload}/>
    </section>
  );
}

function CostOfServiceTable({ payload }: { payload: ExportPayload }) {
  const totalCost = payload.costOfService.reduce((a, c) => a + c.annualCost, 0);
  const totalRev = payload.costOfService.reduce((a, c) => a + c.annualRevenue, 0);
  return (
    <table>
      <thead>
        <tr>
          <th>Service</th>
          <th>Dept</th>
          <th className="num">Hours</th>
          <th className="num">FBHR</th>
          <th className="num">Unit cost</th>
          <th className="num">Volume</th>
          <th className="num">Annual cost</th>
          <th className="num">Annual revenue</th>
        </tr>
      </thead>
      <tbody>
        {payload.costOfService.map((r) => (
          <tr key={r.id}>
            <td>{r.name}</td>
            <td><span className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>{r.dept}</span></td>
            <td className="num">{r.hours}</td>
            <td className="num">${Math.round(r.fbhr)}</td>
            <td className="num">{fmt.dollars(r.unitCost)}</td>
            <td className="num">{fmt.int(r.volume)}</td>
            <td className="num"><b>{fmt.dollarsK(r.annualCost)}</b></td>
            <td className="num">{fmt.dollarsK(r.annualRevenue)}</td>
          </tr>
        ))}
        <tr className="total">
          <td colSpan={6}>
            <span className="mono" style={{
              color: "var(--ink-3)", textTransform: "uppercase",
              letterSpacing: "0.06em", fontSize: 9.5,
            }}>Citywide</span>
          </td>
          <td className="num">{fmt.dollarsK(totalCost)}</td>
          <td className="num">{fmt.dollarsK(totalRev)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function DeptFbhrTable({ payload }: { payload: ExportPayload }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Department</th>
          <th className="num">Positions</th>
          <th className="num">FTE</th>
          <th className="num">Direct $/hr</th>
          <th className="num">Op $/hr</th>
          <th className="num">Overhead $/hr</th>
          <th className="num">FBHR</th>
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
            <td className="num">{d.positions}</td>
            <td className="num">{d.fte.toFixed(1)}</td>
            <td className="num">${Math.round(d.directRate)}</td>
            <td className="num">${Math.round(d.operatingRate)}</td>
            <td className="num">${Math.round(d.capRate)}</td>
            <td className="num">
              <b style={{ color: "var(--accent)" }}>${Math.round(d.fbhr)}</b>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReviewFlagsAppendix({ payload }: { payload: ExportPayload }) {
  const total = payload.reviewFlags.reduce((a, f) => a + f.count, 0);
  if (total === 0) return null;
  return (
    <>
      <h3 className="h3" style={{ marginTop: 22 }}>Appendix D · Outstanding review items</h3>
      <div className="body" style={{ marginBottom: 10 }}>
        <p>
          {total} import row{total === 1 ? "" : "s"} did not auto-map at the
          time this report was generated. The figures throughout the report
          reflect the current model state; outstanding mapping items are
          listed below for transparency.
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

function deptDisplayName(code: string): string {
  switch (code) {
    case "PLAN":  return "Planning";
    case "BLDG":  return "Building";
    case "ENG":   return "Engineering";
    case "PARKS": return "Parks & Recreation";
    case "PD":    return "Police Services";
    case "FIRE":  return "Fire Prevention";
    default: return code;
  }
}

function signed(v: number): string {
  if (Math.abs(v) < 500) return "$0";
  return `${v > 0 ? "+" : "−"}${fmt.dollarsK(Math.abs(v))}`;
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

function Tile({
  label, value, tone, last,
}: { label: string; value: string; tone?: "pos" | "neg" | "warn"; last?: boolean }) {
  const color =
    tone === "pos" ? "var(--pos)" :
    tone === "neg" ? "var(--neg)" :
    tone === "warn" ? "var(--warn)" :
    "var(--ink)";
  return (
    <div style={{
      padding: "12px 14px",
      borderRight: last ? "none" : "1px solid var(--rule)",
      borderBottom: "1px solid var(--rule)",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div className="mono" style={{
        fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>{label}</div>
      <div className="num" style={{
        fontSize: 20, fontWeight: 600, color, letterSpacing: "-0.01em",
      }}>{value}</div>
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div className="mono" style={{
      fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
      color: "var(--ink-3)", textTransform: "uppercase",
    }}>{children}</div>
  );
}

function Value({ children }: { children: ReactNode }) {
  return <div style={{ color: "var(--ink-2)" }}>{children}</div>;
}
