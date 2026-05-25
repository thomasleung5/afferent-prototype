
import { useEffect, useMemo } from "react";
import { useBuildState } from "@/lib/store";
import { fmt } from "@/lib/format";
import {
  ExportCover, ExportTile, ExportTileGrid, ExportToolbar, PrintStyles,
} from "@/components/ui";
import { capAllocatedFromGl, type GlNode, type GlStepDownModel } from "@/lib/data/capStepDownGl";
import { FEE_DEPTS } from "@/lib/data/departments";
import { basisForPool } from "@/lib/data/capStepDown";
import type { CapExportPayload } from "@/lib/export/capExcel";
import { useAutoPrint, useStoreHydrated } from "@/lib/printing";

export default function CapAllocationExportPage() {
  const hydrated = useStoreHydrated();
  const state = useBuildState();

  const cityName = "Town of Los Altos Hills";
  const fiscal = "FY 2025-26";
  useEffect(() => {
    const prev = document.title;
    document.title = `Cost Allocation Plan — ${cityName} — ${fiscal}`;
    return () => { document.title = prev; };
  }, [cityName, fiscal]);

  const payload = useMemo<CapExportPayload>(() => ({
    cityName,
    fiscal,
    generatedAt: new Date().toISOString(),
    capPools: state.capPools,
    allocationBases: state.allocationBases,
    capCenterTotals: state.capCenterTotals,
    capCenterDisallowed: state.capCenterDisallowed,
    capCenterOrder: state.capCenterOrder,
    model: state.derived.capStepDown,
    fbhrRollup: capAllocatedFromGl(state.derived.capStepDown),
  }), [state]);

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
      <PrintStyles pageMargin="0.55in" extraCss={CAP_EXTRA_CSS}/>
      <Toolbar payload={payload}/>
      <Report payload={payload}/>
    </>
  );
}

const CAP_EXTRA_CSS = `
  @media print {
    .center-block {
      page-break-before: always;
      break-before: page;
    }
    .center-block:first-of-type {
      page-break-before: avoid;
      break-before: avoid;
    }
    .pool-block {
      page-break-before: always;
      break-before: page;
    }
  }
  .report .section-label {
    font-family: var(--ff-mono);
    font-size: 9.5px; font-weight: 700; letter-spacing: 0.14em;
    color: var(--ink-3); text-transform: uppercase;
    background: var(--paper-2);
    padding: 4px 8px;
  }
`;

function Toolbar({ payload }: { payload: CapExportPayload }) {
  return (
    <ExportToolbar
      subtitle={`${payload.cityName} · ${payload.fiscal} cost allocation plan`}
    />
  );
}


function Report({ payload }: { payload: CapExportPayload }) {
  useAutoPrint();
  return (
    <div className="report">
      <Cover payload={payload}/>
      <TableOfContents/>
      <ExecutiveSummary payload={payload}/>
      <PurposeAndMethodology/>
      <ProjectDevelopmentProcess/>
      <DataSourcesAndValidation/>
      <AllocationBasisSummary payload={payload}/>
      <ReadingThePlan/>
      <CostCenters payload={payload}/>
      <CostPools payload={payload}/>
      <AllocationByCenter payload={payload}/>
      <FbhrRollup payload={payload}/>
      <Appendices payload={payload}/>
    </div>
  );
}

// ============================================================================
// Sections
// ============================================================================

function Cover({ payload }: { payload: CapExportPayload }) {
  const totalGross = Object.values(payload.capCenterTotals).reduce((a, v) => a + v, 0);
  const totalDis = Object.values(payload.capCenterDisallowed).reduce((a, v) => a + v, 0);
  const totalNet = Math.max(0, totalGross - totalDis);
  // Published deliverable uses the formal name "Full Cost Allocation
  // Plan". The in-app page (src/pages/build/cap.tsx) uses the
  // operational label "Overhead Cost Allocation" — same artifact,
  // different audience.
  return (
    <ExportCover
      city={payload.cityName}
      title="Full Cost Allocation Plan"
      subtitle="Indirect support service allocation via double-step-down methodology"
      fields={[
        { label: "Fiscal year",            value: payload.fiscal },
        { label: "Net allocable",          value: fmt.dollars(totalNet) },
        { label: "Indirect cost centers",  value: payload.capCenterOrder.length },
        { label: "Cost pools",             value: payload.capPools.length },
        { label: "Generated",              value: new Date(payload.generatedAt).toLocaleString() },
      ]}
    />
  );
}

const TOC_SECTIONS = [
  "Executive Summary",
  "Purpose and Methodology",
  "Project Development Process",
  "Data Sources and Validation",
  "Allocation Basis Summary",
  "Reading the Plan",
  "Indirect Cost Centers",
  "Cost Pools Inventory",
  "Allocation Detail Schedules",
  "Fully Burdened Hourly Rate Roll-up",
  "Appendices",
];

const APPENDIX_SECTIONS = [
  "Appendix A — Allocation Inventory",
  "Appendix B — Allocation Basis Statistics",
  "Appendix C — Provider Department Summaries",
  "Appendix D — Receiver Summaries",
  "Appendix E — Assumptions and Limitations",
];

function TableOfContents() {
  return (
    <section className="section" style={{ marginBottom: 32 }}>
      <div className="eyebrow">Contents</div>
      <h2 className="h2">Table of contents</h2>
      <ol style={{
        margin: 0, padding: 0, listStyle: "none",
        fontSize: 12.5, lineHeight: 1.85,
      }}>
        {TOC_SECTIONS.map((label, i) => (
          <li key={label} style={{
            display: "flex", alignItems: "baseline", gap: 12,
            borderBottom: "1px dotted var(--rule)",
            padding: "3px 0",
          }}>
            <span className="mono" style={{
              fontSize: 10, color: "var(--ink-3)", minWidth: 28,
            }}>{(i + 1).toString().padStart(2, "0")}</span>
            <span>{label}</span>
          </li>
        ))}
        {APPENDIX_SECTIONS.map((label) => (
          <li key={label} style={{
            display: "flex", alignItems: "baseline", gap: 12,
            borderBottom: "1px dotted var(--rule)",
            padding: "3px 0",
          }}>
            <span className="mono" style={{
              fontSize: 10, color: "var(--ink-3)", minWidth: 28,
            }}>—</span>
            <span style={{ color: "var(--ink-2)" }}>{label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ExecutiveSummary({ payload }: { payload: CapExportPayload }) {
  const totalGross = Object.values(payload.capCenterTotals).reduce((a, v) => a + v, 0);
  const totalDis = Object.values(payload.capCenterDisallowed).reduce((a, v) => a + v, 0);
  const totalNet = Math.max(0, totalGross - totalDis);
  const indirectNodes = payload.model.nodes.filter((n) => n.role === "indirect");
  const directNodes = payload.model.nodes.filter((n) => n.role === "direct");

  const providerOutgoing = computeProviderOutgoing(payload);
  const largestProvider = [...providerOutgoing.entries()]
    .sort((a, b) => b[1] - a[1])[0];

  const receiverTotals = Object.entries(payload.model.directTotals)
    .map(([key, v]) => {
      const node = payload.model.nodes.find((n) => n.key === key);
      return { name: node?.name ?? key, amount: v };
    })
    .sort((a, b) => b.amount - a.amount);
  const largestReceiver = receiverTotals[0];

  return (
    <section className="section section-break" style={{ marginBottom: 32 }}>
      <div className="eyebrow">Section 1</div>
      <h2 className="h2">Executive summary</h2>

      <div className="body body-lede">
        <p style={{ marginTop: 0 }}>
          This Full Cost Allocation Plan identifies and allocates indirect
          administrative and support service costs to departments, divisions,
          programs, and funds that receive support from central service
          functions throughout the organization.
        </p>
        <p>
          The purpose of the Cost Allocation Plan is to establish a
          reasonable and equitable distribution of shared administrative and
          operational support costs, improve visibility into the full cost of
          operations, support budgeting and financial planning efforts, and
          provide a defensible basis for indirect cost recovery analyses.
        </p>
        <p>
          The Plan distinguishes between direct costs — expenditures that
          can be attributed to a single program, service, or operating
          department — and indirect costs, which represent shared
          administrative and operational support functions provided by
          central service departments that benefit multiple programs and
          operating departments across the organization.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 18 }}>Plan at a glance</h3>
      <ExportTileGrid columns={3} marginTop={8}>
        <ExportTile size="compact" label="Total Allocable Cost" value={fmt.dollars(totalNet)}/>
        <ExportTile size="compact" label="Cost Pools" value={String(payload.capPools.length)}/>
        <ExportTile size="compact" label="Receiving Departments" value={String(directNodes.length)} last/>
        <ExportTile size="compact" label="Allocation Bases" value={String(payload.allocationBases.length)}/>
        <ExportTile
          size="compact"
          label="Largest Support Function"
          value={largestProvider ? largestProvider[0] : "Not available"}
          sub={largestProvider ? fmt.dollars(largestProvider[1]) : undefined}
        />
        <ExportTile
          size="compact"
          label="Largest Receiver"
          value={largestReceiver ? largestReceiver.name : "Not available"}
          sub={largestReceiver ? fmt.dollars(largestReceiver.amount) : undefined}
          last
        />
        <ExportTile size="compact" label="Indirect Cost Centers" value={String(indirectNodes.length)}/>
        <ExportTile size="compact" label="Gross Expenses" value={fmt.dollars(totalGross)}/>
        <ExportTile size="compact" label="Disallowed" value={totalDis > 0 ? fmt.dollars(totalDis) : "—"} last/>
      </ExportTileGrid>

      <div className="body footnote">
        Largest support function reflects total outgoing allocations from a
        single indirect cost center. Largest receiver reflects total indirect
        cost received by a single direct department under the double-step-down
        methodology described in Section 2.
      </div>
    </section>
  );
}

function PurposeAndMethodology() {
  return (
    <section className="section section-break" style={{ marginBottom: 32 }}>
      <div className="eyebrow">Section 2</div>
      <h2 className="h2">Purpose and methodology</h2>

      <div className="body body-lede">
        <p style={{ marginTop: 0 }}>
          A Cost Allocation Plan distributes indirect support service costs
          to departments and programs that benefit from those services.
          Indirect costs represent shared administrative and operational
          support functions that cannot be directly assigned to a single
          program or service. The Plan establishes a reasonable and
          equitable methodology for assigning the full cost of those
          functions to the departments, divisions, programs, and funds that
          receive support.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 16 }}>Defined terms</h3>
      <div className="body">
        <ul>
          <li>
            <b>Direct costs</b> — expenditures that can be attributed to a
            single program, service, or operating department in their
            entirety.
          </li>
          <li>
            <b>Indirect costs</b> — shared administrative and operational
            support service expenditures that benefit multiple programs or
            operating departments and cannot be directly assigned without
            allocation.
          </li>
          <li>
            <b>Central service departments</b> — organizational units that
            provide shared administrative or operational support to other
            departments (for example, Finance, Human Resources, City
            Attorney, Information Technology, Facilities, City Clerk).
          </li>
          <li>
            <b>Receiving departments</b> — operating departments, programs,
            divisions, or funds that receive indirect support services from
            central service departments under the Plan.
          </li>
          <li>
            <b>Allocable cost pool</b> — a logically grouped portion of a
            central service department&apos;s expenditures distributed using
            a single allocation basis. A central service department may
            publish one or more pools to reflect functional sub-activities.
          </li>
          <li>
            <b>Allocation basis</b> — the statistical denominator (driver)
            used to distribute a pool to receiving departments. Bases are
            selected to reasonably approximate the level of support
            received.
          </li>
          <li>
            <b>Allocable vs. non-allocable expenditures</b> — certain
            expenditures, including capital outlay, debt service,
            pass-through transactions, and grant-funded items, may be
            excluded from allocation calculations.
          </li>
          <li>
            <b>Incoming vs. outgoing allocations</b> — incoming allocations
            represent indirect cost received by a department from upstream
            central service departments; outgoing allocations represent
            indirect cost distributed by a central service department to
            other departments.
          </li>
        </ul>
      </div>

      <h3 className="h3" style={{ marginTop: 14 }}>Benefit-received principle</h3>
      <div className="body">
        <p>
          Allocation bases were selected to establish a reasonable nexus
          between the support service provided by a central service
          department and the operational activity of the receiving
          department. Each pool is distributed using a basis that
          reasonably approximates the level of support received by each
          department, supporting the defensibility of the resulting full
          cost allocation.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 14 }}>Double-step-down methodology</h3>
      <div className="body">
        <p>
          The double-step-down methodology recognizes that central service
          departments often provide support to one another before
          ultimately supporting operational departments. Under this
          methodology, support costs are first distributed among central
          service departments and then fully allocated to receiving
          departments and programs.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 12 }}>Phase 1 — First Allocation</h3>
      <div className="body">
        <p>
          For each indirect cost center in step-down order, First Incoming
          equals the sum of upstream centers&rsquo; Phase 1 contributions.
          Each pool distributes <b>(own eligible + pool-weight × First
          Incoming)</b> via its receiver schedule with no receiver
          exclusions.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 10 }}>Phase 2 — Second Allocation</h3>
      <div className="body">
        <p>
          After Phase 1 completes, for each center in step order Second
          Incoming equals Total Received less First Incoming. Each pool
          distributes <b>(pool-weight × Second Incoming)</b> via its
          schedule with the cost center itself and any upstream cost
          centers excluded; surviving allocation percentages renormalize to
          100%. The methodology completes in a single pass with no further
          iteration.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 14 }}>Allocation process diagram</h3>
      <div style={{
        marginTop: 6,
        padding: "14px 16px",
        background: "var(--paper-2)",
        border: "1px solid var(--rule)",
      }}>
        <DiagramRow label="Central service departments" sub="Finance · Human Resources · City Attorney · Facilities · IT · City Clerk · …"/>
        <DiagramArrow/>
        <DiagramRow label="Allocation bases" sub="FTE · payroll transactions · accounting transactions · agenda items · square footage · vehicles · contracts · …"/>
        <DiagramArrow/>
        <DiagramRow label="Receiving departments and programs" sub="Operating departments, divisions, programs, and funds that benefit from indirect support services"/>
      </div>
    </section>
  );
}

function DiagramRow({ label, sub }: { label: string; sub?: string }) {
  return (
    <div style={{
      padding: "8px 12px",
      border: "1px solid var(--rule)",
      background: "var(--paper)",
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</div>
      {sub && (
        <div className="mono" style={{
          fontSize: 10, color: "var(--ink-3)", marginTop: 2,
          letterSpacing: "0.02em",
        }}>{sub}</div>
      )}
    </div>
  );
}

function DiagramArrow() {
  return (
    <div style={{
      textAlign: "center",
      fontFamily: "var(--ff-mono)",
      color: "var(--ink-3)",
      fontSize: 12,
      padding: "4px 0",
    }}>↓</div>
  );
}

function CostCenters({ payload }: { payload: CapExportPayload }) {
  const poolCountByKey = new Map<string, number>();
  for (const pl of payload.capPools) {
    poolCountByKey.set(pl.centerGlCode, (poolCountByKey.get(pl.centerGlCode) ?? 0) + 1);
  }
  const meta = pdfCenterMeta(payload);
  let totalGross = 0, totalDis = 0;
  return (
    <section className="section section-break" style={{ marginBottom: 32 }}>
      <div className="eyebrow">Section 7</div>
      <h2 className="h2">Indirect cost centers</h2>
      <div className="body" style={{ marginBottom: 12, maxWidth: 600 }}>
        Net Allocable Expenses = Total Expenses − Disallowed Expenses. Centers
        are listed in step-down order — earlier rows close first under the
        sequential methodology.
      </div>
      <table>
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Code</th>
            <th>Center</th>
            <th className="num">Total Expenses</th>
            <th className="num">Disallowed</th>
            <th className="num">Net Allocable</th>
            <th className="num">Pools</th>
          </tr>
        </thead>
        <tbody>
          {payload.capCenterOrder.map((key, i) => {
            const gross = payload.capCenterTotals[key] ?? 0;
            const dis = payload.capCenterDisallowed[key] ?? 0;
            const net = Math.max(0, gross - dis);
            const m = meta.get(key);
            const gl = m?.glCode;
            const name = m?.name ?? key;
            totalGross += gross; totalDis += dis;
            return (
              <tr key={key}>
                <td className="num mono dim">{String(i + 1).padStart(2, "0")}</td>
                <td><span className="mono" style={{ fontSize: 10, color: gl ? "var(--ink-2)" : "var(--ink-4)" }}>{gl ?? "—"}</span></td>
                <td>{name}</td>
                <td className="num">{fmt.dollars(gross)}</td>
                <td className="num">{dis > 0 ? fmt.dollars(dis) : <span className="dim">—</span>}</td>
                <td className="num"><b>{fmt.dollars(net)}</b></td>
                <td className="num">{poolCountByKey.get(key) ?? 0}</td>
              </tr>
            );
          })}
          <tr className="total">
            <td/>
            <td/>
            <td>Total</td>
            <td className="num">{fmt.dollars(totalGross)}</td>
            <td className="num">{fmt.dollars(totalDis)}</td>
            <td className="num">{fmt.dollars(Math.max(0, totalGross - totalDis))}</td>
            <td/>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

/** Center identity key → {name, glCode} pair used by every step-order
 *  iteration in this file. glCode is undefined for synth `seed:center:*`
 *  keys. Reads from the engine's indirect-node list (which carries the
 *  display name from capCenterSources). */
function pdfCenterMeta(payload: CapExportPayload): Map<string, { name: string; glCode?: string }> {
  const m = new Map<string, { name: string; glCode?: string }>();
  for (const nn of payload.model.nodes) {
    if (nn.role !== "indirect") continue;
    m.set(nn.key, {
      name: nn.name,
      glCode: nn.glCode.startsWith("seed:") ? undefined : nn.glCode,
    });
  }
  return m;
}

function ProjectDevelopmentProcess() {
  return (
    <section className="section section-break" style={{ marginBottom: 32 }}>
      <div className="eyebrow">Section 3</div>
      <h2 className="h2">Project development process</h2>
      <div className="body body-lede">
        <p style={{ marginTop: 0 }}>
          The Cost Allocation Plan was developed through a structured
          analytical process intended to produce a reasonable and equitable
          distribution of indirect support service costs to receiving
          departments. The principal project tasks are summarized below.
        </p>
        <ul style={{ margin: "8px 0 10px", paddingLeft: 18 }}>
          <li>Organizational analysis and review of central service department functions.</li>
          <li>Identification of indirect cost centers eligible for allocation.</li>
          <li>Expenditure analysis to confirm allocable versus non-allocable cost components.</li>
          <li>Development of allocable cost pools within each central service department.</li>
          <li>Selection of allocation bases that reasonably approximate benefit received.</li>
          <li>Collection of allocation statistics from financial, payroll, and operational systems.</li>
          <li>Staff interviews and validation of allocation assumptions with departmental subject-matter staff.</li>
          <li>Allocation modeling under the double-step-down methodology.</li>
          <li>Quality control review of pool routing, basis denominators, and conservation of allocable dollars.</li>
          <li>Report development, internal review, and finalization.</li>
        </ul>
        <p>
          The allocation model and supporting assumptions were reviewed with
          departmental staff and refined through iterative validation to
          ensure the resulting allocations reasonably reflected
          organizational support relationships and estimated benefit
          received.
        </p>
      </div>
    </section>
  );
}

function DataSourcesAndValidation() {
  return (
    <section className="section section-break" style={{ marginBottom: 32 }}>
      <div className="eyebrow">Section 4</div>
      <h2 className="h2">Data sources and validation</h2>

      <div className="body body-lede">
        <p style={{ marginTop: 0 }}>
          The Cost Allocation Plan is based primarily on budgeted
          expenditures and operational data provided by the organization.
          Consultants relied on available financial records, staffing
          information, workload statistics, allocation metrics, and staff
          interviews to develop allocation methodologies and cost
          distributions.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 14 }}>Source data domains</h3>
      <table>
        <thead>
          <tr>
            <th>Data domain</th>
            <th>Typical use in the Plan</th>
          </tr>
        </thead>
        <tbody>
          {DATA_DOMAINS.map((d) => (
            <tr key={d.label}>
              <td><b>{d.label}</b></td>
              <td style={{ color: "var(--ink-2)" }}>{d.use}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="h3" style={{ marginTop: 16 }}>Validation approach</h3>
      <div className="body">
        <ul>
          <li>
            Reconciliation of central service department expenditures to
            adopted budget appropriations for the fiscal year analyzed.
          </li>
          <li>
            Confirmation that disallowed expenditures (capital outlay,
            debt service, pass-throughs, grant-funded items) have been
            excluded from each cost pool&apos;s net allocable amount.
          </li>
          <li>
            Verification that allocation basis denominators reflect the
            published statistical source documents for the fiscal year
            analyzed.
          </li>
          <li>
            Review of pool assignments and allocation bases with
            departmental staff to confirm reasonableness against
            operational experience.
          </li>
          <li>
            Conservation check that every dollar of allocable cost flows
            to either a receiving department or an excluded
            public-benefit pool.
          </li>
        </ul>
      </div>

      <div className="body" style={{
        marginTop: 8, fontSize: 11.5, color: "var(--ink-3)",
      }}>
        The analysis reflects the organizational structure and available
        data at the time of the study. Allocation methodologies and
        resulting costs should be periodically reviewed and updated as
        staffing, operations, systems, or service relationships materially
        change.
      </div>
    </section>
  );
}

const DATA_DOMAINS: { label: string; use: string }[] = [
  { label: "Adopted budget appropriations",  use: "Central service department gross and net allocable expenditures." },
  { label: "Staffing and FTE data",          use: "Full-time-equivalent counts used as a benefit-received basis for several pools." },
  { label: "Payroll and benefit data",       use: "Direct labor composition supporting central service expenditure totals." },
  { label: "General ledger / account structure", use: "Routing of expenditures by central service cost center and account category." },
  { label: "Allocation statistics",          use: "Per-receiver basis units used by the step-down engine to distribute pool dollars." },
  { label: "Workload metrics",               use: "Volumetric drivers for functional pools (e.g., transactions, requests, items processed)." },
  { label: "Square footage data",            use: "Basis for Facilities, building use, and shared occupancy pools." },
  { label: "Agenda item counts",             use: "Basis for City Clerk and governance support pools." },
  { label: "Accounting transactions",        use: "Basis for accounts payable, general accounting, and finance support pools." },
  { label: "Payroll transactions",           use: "Basis for payroll processing and benefits administration pools." },
  { label: "Contract counts",                use: "Basis for procurement and contract administration pools." },
  { label: "Public records requests",        use: "Basis for City Clerk records and PRA support pools." },
  { label: "Equipment and vehicle inventories", use: "Basis for fleet, equipment replacement, and shared asset pools." },
  { label: "Staff questionnaires and interviews", use: "Qualitative validation of allocation assumptions and pool composition." },
];

function AllocationBasisSummary({ payload }: { payload: CapExportPayload }) {
  return (
    <section className="section section-break" style={{ marginBottom: 32 }}>
      <div className="eyebrow">Section 5</div>
      <h2 className="h2">Allocation basis summary</h2>
      <div className="body body-lede" style={{ marginBottom: 12 }}>
        <p style={{ marginTop: 0 }}>
          Allocation bases were selected to reasonably approximate the level
          of support or benefit received by each department, division,
          program, or fund. The table below summarizes the allocation basis
          assigned to each cost pool together with the basis source.
        </p>
      </div>
      <table>
        <thead>
          <tr>
            <th>Cost pool</th>
            <th>Function</th>
            <th>Allocation basis</th>
            <th>Basis source</th>
          </tr>
        </thead>
        <tbody>
          {payload.capPools.map((pl) => {
            const { basis } = basisForPool(pl, payload.allocationBases);
            const basisRecord = pl.basisId
              ? payload.allocationBases.find((b) => b.id === pl.basisId)
              : undefined;
            const source = basisRecord?.source && basisRecord.source.trim()
              ? basisRecord.source
              : "Not available";
            return (
              <tr key={pl.id}>
                <td><b>{pl.pool}</b></td>
                <td style={{ color: "var(--ink-2)" }}>{pl.center}</td>
                <td>
                  <span className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>{basis}</span>
                </td>
                <td style={{ color: "var(--ink-2)" }}>{source}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3 className="h3" style={{ marginTop: 18 }}>Allocation basis catalog</h3>
      <table>
        <thead>
          <tr>
            <th>Basis</th>
            <th>Driver key</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {payload.allocationBases.map((b) => (
            <tr key={b.id}>
              <td><b>{b.name}</b></td>
              <td><span className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>{b.driverKey}</span></td>
              <td style={{ color: "var(--ink-2)" }}>{b.source && b.source.trim() ? b.source : "Not available"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ReadingThePlan() {
  return (
    <section className="section section-break" style={{ marginBottom: 32 }}>
      <div className="eyebrow">Section 6</div>
      <h2 className="h2">Reading the plan</h2>
      <div className="body body-lede">
        <p style={{ marginTop: 0 }}>
          The remainder of the Plan presents the allocation inventory, the
          per-center allocation detail schedules, and supporting summary
          views. The orientation notes below describe how to navigate the
          schedules that follow.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 12 }}>Allocation inventory</h3>
      <div className="body">
        <p>
          The Indirect Cost Centers (Section 7) and Cost Pools Inventory
          (Section 8) together constitute the allocation inventory. The
          inventory identifies every central service department included
          in the Plan, its net allocable expenditures, and the cost pools
          published within each center.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 10 }}>Allocation detail schedules</h3>
      <div className="body">
        <p>
          The Allocation Detail Schedules (Section 9) illustrate how
          allocable costs are distributed to receiving departments based
          on the selected allocation basis. Each indirect cost center is
          presented on its own page, beginning with a Costs to be
          Allocated summary block followed by per-pool allocation
          schedules showing each receiver, the allocation percentage, and
          the first-pass and second-pass dollar distributions.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 10 }}>Allocation summaries</h3>
      <div className="body">
        <p>
          Provider Department Summaries (Appendix C) and Receiver
          Summaries (Appendix D) provide consolidated views of the
          allocation results. Provider summaries report each central
          service department&apos;s incoming and outgoing allocations and
          top receivers; receiver summaries report each operating
          department&apos;s total indirect cost received and the largest
          providers of support.
        </p>
      </div>

      <h3 className="h3" style={{ marginTop: 10 }}>Reading conventions</h3>
      <div className="body">
        <ul>
          <li>
            <b>Provider department</b> — the central service department
            distributing indirect support cost out of one of its cost
            pools.
          </li>
          <li>
            <b>Receiving department</b> — the department, program, or fund
            that receives an allocation of indirect support cost under a
            pool&apos;s schedule.
          </li>
          <li>
            <b>Incoming allocation</b> — indirect cost flowing into a
            department from one or more upstream central service
            departments.
          </li>
          <li>
            <b>Outgoing allocation</b> — indirect cost distributed by a
            central service department to receiving departments through
            its own pools.
          </li>
          <li>
            <b>First-pass allocation</b> — the first-phase distribution
            under the double-step-down methodology; includes a
            department&apos;s own eligible cost plus any upstream first
            incoming.
          </li>
          <li>
            <b>Second-pass allocation</b> — the second-phase distribution
            of post-first-pass incoming, with the cost center itself and
            upstream centers excluded from the receiver set.
          </li>
          <li>
            <b>Direct billed vs. allocated</b> — directly attributable
            costs are not redistributed by the Plan; only indirect support
            service costs flow through the step-down model.
          </li>
        </ul>
      </div>
    </section>
  );
}

function CostPools({ payload }: { payload: CapExportPayload }) {
  const meta = pdfCenterMeta(payload);
  let totalEligible = 0;
  return (
    <section className="section section-break" style={{ marginBottom: 32 }}>
      <div className="eyebrow">Section 8</div>
      <h2 className="h2">Cost pools inventory</h2>
      <div className="body" style={{ marginBottom: 12, maxWidth: 600 }}>
        Functional overhead pools. Each pool&rsquo;s net allocable amount is
        distributed via its allocation basis schedule.
      </div>
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Center</th>
            <th>Pool</th>
            <th>Basis</th>
            <th className="num">Net allocable</th>
          </tr>
        </thead>
        <tbody>
          {payload.capPools.map((pl) => {
            const { basis } = basisForPool(pl, payload.allocationBases);
            const gl = meta.get(pl.centerGlCode)?.glCode;
            totalEligible += pl.amount;
            return (
              <tr key={pl.id}>
                <td><span className="mono" style={{ fontSize: 10, color: gl ? "var(--ink-2)" : "var(--ink-4)" }}>{gl ?? "—"}</span></td>
                <td style={{ color: "var(--ink-2)" }}>{pl.center}</td>
                <td><b>{pl.pool}</b></td>
                <td><span className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>{basis}</span></td>
                <td className="num"><b>{fmt.dollars(pl.amount)}</b></td>
              </tr>
            );
          })}
          <tr className="total">
            <td colSpan={4}>Total net allocable</td>
            <td className="num">{fmt.dollars(totalEligible)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function AllocationByCenter({ payload }: { payload: CapExportPayload }) {
  const stepIndex = new Map<string, number>();
  payload.model.stepOrder.forEach((k, i) => stepIndex.set(k, i));
  const meta = pdfCenterMeta(payload);
  const poolsByCenterKey = new Map<string, CapExportPayload["capPools"]>();
  for (const pl of payload.capPools) {
    const list = poolsByCenterKey.get(pl.centerGlCode) ?? [];
    list.push(pl);
    poolsByCenterKey.set(pl.centerGlCode, list);
  }
  for (const list of poolsByCenterKey.values()) {
    list.sort((a, b) => a.pool.localeCompare(b.pool));
  }

  return (
    <section className="section section-break" style={{ marginBottom: 24 }}>
      <div className="eyebrow">Section 9</div>
      <h2 className="h2">Allocation detail schedules</h2>
      <div className="body" style={{ marginBottom: 14, maxWidth: 600 }}>
        Each cost center is reported together with all of its pools&rsquo;
        per-receiver allocation schedules. The <b>Costs to be Allocated</b>
        summary precedes each center&rsquo;s pool detail blocks so the
        Departmental + Incoming totals can be cross-checked against the
        First/Second column subtotals on the pool pages.
      </div>
      {payload.model.stepOrder.map((centerKey, idx) => {
        const m = meta.get(centerKey);
        if (!m) return null;
        const centerPools = poolsByCenterKey.get(centerKey) ?? [];
        return (
          <CenterBlock
            key={centerKey}
            centerKey={centerKey}
            centerName={m.name}
            centerPools={centerPools}
            stepIndex={stepIndex}
            payload={payload}
            indexLabel={String(idx + 1).padStart(2, "0")}
          />
        );
      })}
    </section>
  );
}

function CenterBlock({
  centerKey, centerName, centerPools, stepIndex, payload, indexLabel,
}: {
  centerKey: string;
  centerName: string;
  centerPools: CapExportPayload["capPools"];
  stepIndex: Map<string, number>;
  payload: CapExportPayload;
  indexLabel: string;
}) {
  const targetStep = stepIndex.get(centerKey) ?? -1;
  const meta = pdfCenterMeta(payload);

  const departmental = centerPools
    .reduce((a, pl) => a + pl.amount, 0);

  const sources = new Map<string, { first: number; second: number }>();
  for (const n of payload.model.nodes) {
    if (n.role === "indirect") sources.set(n.key, { first: 0, second: 0 });
  }
  for (const sp of payload.capPools) {
    const srcStep = stepIndex.get(sp.centerGlCode) ?? -1;
    const isUpstream = srcStep !== -1 && targetStep !== -1 && srcStep < targetStep;
    const r1 = payload.model.firstAllocation[sp.id]?.[centerKey] ?? 0;
    const r2 = payload.model.secondAllocation[sp.id]?.[centerKey] ?? 0;
    const first = isUpstream ? r1 : 0;
    const second = isUpstream ? r2 : (r1 + r2);
    const cur = sources.get(sp.centerGlCode) ?? { first: 0, second: 0 };
    cur.first += first;
    cur.second += second;
    sources.set(sp.centerGlCode, cur);
  }
  const sourceRows = [...sources.entries()]
    .map(([key, v]) => ({ key, name: meta.get(key)?.name ?? key, ...v }))
    .sort((a, b) => (stepIndex.get(a.key) ?? 999) - (stepIndex.get(b.key) ?? 999));
  const totalFirst = sourceRows.reduce((a, r) => a + r.first, 0);
  const totalSecond = sourceRows.reduce((a, r) => a + r.second, 0);

  // Skip centers with no eligible $ AND no incoming AND no pools — purely
  // structural placeholders won't have anything to print.
  if (centerPools.length === 0
      && departmental < 0.5
      && totalFirst < 0.5
      && totalSecond < 0.5) {
    return null;
  }

  return (
    <div className="center-block" style={{
      breakBefore: "page",
      paddingTop: 8,
      marginBottom: 24,
    }}>
      <div style={{
        borderBottom: "2px solid var(--ink)",
        paddingBottom: 8,
        marginBottom: 14,
      }}>
        <div className="mono" style={{
          fontSize: 9.5, fontWeight: 600, letterSpacing: "0.14em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>Center {indexLabel} · Step {indexLabel}</div>
        <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>
          {meta.get(centerKey)?.glCode && (
            <span className="mono" style={{
              fontSize: 14, color: "var(--ink-3)", marginRight: 10,
              letterSpacing: "0.02em",
            }}>{meta.get(centerKey)!.glCode}</span>
          )}
          {centerName}
        </div>
      </div>

      {(departmental >= 0.5 || totalFirst >= 0.5 || totalSecond >= 0.5) && (
        <div className="row" style={{ marginBottom: 18 }}>
          <h3 className="h3">Costs to be Allocated</h3>
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th className="num">First</th>
                <th className="num">Second</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><b>Departmental Expenditures</b></td>
                <td className="num"><b>{fmt.dollars(departmental)}</b></td>
                <td className="num dim">—</td>
                <td className="num"><b>{fmt.dollars(departmental)}</b></td>
              </tr>
              {sourceRows.map((r) => {
                const isSelf = r.key === centerKey;
                const total = r.first + r.second;
                const allZero = r.first < 0.5 && r.second < 0.5;
                const sourceGl = meta.get(r.key)?.glCode;
                return (
                  <tr key={r.key}>
                    <td style={{ color: allZero ? "var(--ink-4)" : "var(--ink-2)" }}>
                      {sourceGl && (
                        <span className="mono dim" style={{
                          fontSize: 10, marginRight: 6, letterSpacing: "0.02em",
                        }}>{sourceGl}</span>
                      )}
                      {r.name}{isSelf && <span className="mono dim" style={{ marginLeft: 6, fontSize: 9 }}>(SELF)</span>}
                    </td>
                    <td className="num" style={{ color: r.first < 0.5 ? "var(--ink-4)" : undefined }}>
                      {r.first < 0.5 ? "—" : fmt.dollars(r.first)}
                    </td>
                    <td className="num" style={{ color: r.second < 0.5 ? "var(--ink-4)" : undefined }}>
                      {r.second < 0.5 ? "—" : fmt.dollars(r.second)}
                    </td>
                    <td className="num" style={{ color: allZero ? "var(--ink-4)" : undefined }}>
                      {allZero ? "—" : fmt.dollars(total)}
                    </td>
                  </tr>
                );
              })}
              <tr className="total">
                <td>Total Incoming</td>
                <td className="num">{fmt.dollars(totalFirst)}</td>
                <td className="num">{fmt.dollars(totalSecond)}</td>
                <td className="num">{fmt.dollars(totalFirst + totalSecond)}</td>
              </tr>
              <tr className="total">
                <td>Total Costs to be Allocated</td>
                <td className="num">{fmt.dollars(departmental + totalFirst)}</td>
                <td className="num">{fmt.dollars(totalSecond)}</td>
                <td className="num"><b>{fmt.dollars(departmental + totalFirst + totalSecond)}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {centerPools.length > 0 && (
        <>
          <h3 className="h3" style={{ marginTop: 16 }}>
            Pool allocation detail ({centerPools.length} pool{centerPools.length === 1 ? "" : "s"})
          </h3>
          {centerPools.map((pl) => (
            <PoolBlock key={pl.id} pool={pl} model={payload.model} bases={payload.allocationBases}/>
          ))}
        </>
      )}
    </div>
  );
}

function PoolBlock({
  pool, model, bases,
}: {
  pool: CapExportPayload["capPools"][number];
  model: GlStepDownModel;
  bases: CapExportPayload["allocationBases"];
}) {
  const { basis } = basisForPool(pool, bases);
  const eligibleAmount = pool.amount;

  const indirectNodes = model.nodes
    .filter((n) => n.role === "indirect")
    .sort((a, b) => a.glCode.localeCompare(b.glCode));
  const directNodes = model.nodes
    .filter((n) => n.role === "direct")
    .sort((a, b) => a.glCode.localeCompare(b.glCode));

  // Derive the per-receiver percent from the engine's Phase 1 distribution.
  // firstAllocation = pool.amount × pct, so pct = first / Σ first across
  // every receiver this pool reached. Mirrors what was published in the
  // source schedule without needing the schedule reattached to the pool.
  const firstByNode = model.firstAllocation[pool.id] ?? {};
  const firstTotal = Object.values(firstByNode).reduce((a, v) => a + v, 0);
  const rowFor = (node: GlNode) => {
    const first = firstByNode[node.key] ?? 0;
    const second = model.secondAllocation[pool.id]?.[node.key] ?? 0;
    const pct = firstTotal > 0 ? (first / firstTotal) * 100 : 0;
    return { node, pct, first, second, total: first + second };
  };
  const allocableRows = indirectNodes.map(rowFor).filter((r) => r.first > 0.5 || r.second > 0.5);
  const receivingRows = directNodes.map(rowFor).filter((r) => r.first > 0.5 || r.second > 0.5);
  const allRows = [...allocableRows, ...receivingRows];
  const totalFirst = allRows.reduce((a, r) => a + r.first, 0);
  const totalSecond = allRows.reduce((a, r) => a + r.second, 0);

  const centerNode = model.nodes.find(
    (n) => n.role === "indirect" && n.key === pool.centerGlCode,
  );
  const centerGl = centerNode && !centerNode.glCode.startsWith("seed:")
    ? centerNode.glCode : undefined;
  return (
    <div className="pool-block row" style={{ marginBottom: 22 }}>
      <h3 className="h3" style={{ marginBottom: 4 }}>
        {centerGl && (
          <span className="mono" style={{
            fontSize: 11, color: "var(--ink-3)", marginRight: 8,
            letterSpacing: "0.02em", fontWeight: 400,
          }}>{centerGl}</span>
        )}
        {pool.center} · {pool.pool}
      </h3>
      <div style={{
        fontSize: 11, color: "var(--ink-3)", marginBottom: 8,
        display: "flex", gap: 14,
      }}>
        <span>Allocable: <b style={{ color: "var(--ink-2)" }}>{fmt.dollars(eligibleAmount)}</b></span>
        <span>Basis: <span className="mono">{basis}</span></span>
        <span>First Pool: <b style={{ color: "var(--ink-2)" }}>{fmt.dollars(totalFirst)}</b></span>
        <span>Second Pool: <b style={{ color: "var(--ink-2)" }}>{fmt.dollars(totalSecond)}</b></span>
        <span>Total: <b style={{ color: "var(--accent)" }}>{fmt.dollars(totalFirst + totalSecond)}</b></span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Budget Unit</th>
            <th className="num">Pct</th>
            <th className="num">Gross</th>
            <th className="num">First</th>
            <th className="num">Second</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {allocableRows.length > 0 && (
            <tr><td colSpan={6} className="section-label">Allocable Budget Units</td></tr>
          )}
          {allocableRows.map((r) => <ScheduleRow key={r.node.key} {...r}/>)}
          {receivingRows.length > 0 && (
            <tr><td colSpan={6} className="section-label">Receiving Budget Units</td></tr>
          )}
          {receivingRows.map((r) => <ScheduleRow key={r.node.key} {...r}/>)}
          <tr className="total">
            <td>Total</td>
            <td className="num">{(allRows.reduce((a, r) => a + r.pct, 0)).toFixed(3)}%</td>
            <td className="num">{fmt.dollars(totalFirst)}</td>
            <td className="num">{fmt.dollars(totalFirst)}</td>
            <td className="num">{fmt.dollars(totalSecond)}</td>
            <td className="num"><b style={{ color: "var(--accent)" }}>{fmt.dollars(totalFirst + totalSecond)}</b></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ScheduleRow({
  node, pct, first, second, total,
}: {
  node: GlNode; pct: number; first: number; second: number; total: number;
}) {
  return (
    <tr>
      <td>
        <span className="mono dim" style={{ fontSize: 9.5, marginRight: 6 }}>
          {node.glCode.startsWith("seed:") ? "—" : node.glCode}
        </span>
        {node.name}
      </td>
      <td className="num" style={{ color: pct <= 0 ? "var(--ink-4)" : undefined }}>
        {pct <= 0 ? "—" : `${pct.toFixed(3)}%`}
      </td>
      <td className="num" style={{ color: first < 0.5 ? "var(--ink-4)" : undefined }}>
        {first < 0.5 ? "—" : fmt.dollars(first)}
      </td>
      <td className="num" style={{ color: first < 0.5 ? "var(--ink-4)" : undefined }}>
        {first < 0.5 ? "—" : fmt.dollars(first)}
      </td>
      <td className="num" style={{ color: second < 0.5 ? "var(--ink-4)" : undefined }}>
        {second < 0.5 ? "—" : fmt.dollars(second)}
      </td>
      <td className="num" style={{ color: total < 0.5 ? "var(--ink-4)" : "var(--ink)", fontWeight: 600 }}>
        {total < 0.5 ? "—" : fmt.dollars(total)}
      </td>
    </tr>
  );
}

function FbhrRollup({ payload }: { payload: CapExportPayload }) {
  // Only surface fee depts the jurisdiction actually routes CAP $ to.
  // Hides empty PARKS/PD/FIRE rows on jurisdictions that don't model them.
  const activeDepts = FEE_DEPTS.filter((d) => (payload.fbhrRollup[d] ?? 0) > 0.5);
  const total = activeDepts.reduce((a, d) => a + (payload.fbhrRollup[d] ?? 0), 0);
  return (
    <section className="section section-break" style={{ marginBottom: 32 }}>
      <div className="eyebrow">Section 10</div>
      <h2 className="h2">Fully Burdened Hourly Rate roll-up</h2>
      <div className="body body-lede" style={{ marginBottom: 12 }}>
        Allocated indirect support service dollars feeding the Fully
        Burdened Hourly Rate calculation for each fee-supported operating
        department. Equals the sum of receiving-department totals classified
        to the corresponding fee department under the double-step-down
        methodology.
      </div>
      <table>
        <thead>
          <tr>
            <th>Fee Department</th>
            <th className="num">Allocated overhead $</th>
            <th className="num">% of total</th>
          </tr>
        </thead>
        <tbody>
          {activeDepts.map((d) => {
            const v = payload.fbhrRollup[d] ?? 0;
            return (
              <tr key={d}>
                <td><b>{d}</b></td>
                <td className="num">{fmt.dollars(v)}</td>
                <td className="num">{total > 0 ? `${(100 * v / total).toFixed(1)}%` : "—"}</td>
              </tr>
            );
          })}
          <tr className="total">
            <td>Total</td>
            <td className="num">{fmt.dollars(total)}</td>
            <td className="num">100.0%</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

// ============================================================================
// Appendices
// ============================================================================

function Appendices({ payload }: { payload: CapExportPayload }) {
  return (
    <section className="section section-break" style={{ marginBottom: 24 }}>
      <div className="eyebrow">Section 11</div>
      <h2 className="h2">Appendices</h2>
      <AppendixA payload={payload}/>
      <AppendixB payload={payload}/>
      <AppendixC payload={payload}/>
      <AppendixD payload={payload}/>
      <AppendixE/>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Appendix A — Allocation Inventory
// ---------------------------------------------------------------------------

function AppendixA({ payload }: { payload: CapExportPayload }) {
  const poolsByCenterKey = new Map<string, CapExportPayload["capPools"]>();
  for (const pl of payload.capPools) {
    const list = poolsByCenterKey.get(pl.centerGlCode) ?? [];
    list.push(pl);
    poolsByCenterKey.set(pl.centerGlCode, list);
  }
  const meta = pdfCenterMeta(payload);
  const receiverCount = (poolId: string): number => {
    const first = payload.model.firstAllocation[poolId] ?? {};
    const second = payload.model.secondAllocation[poolId] ?? {};
    const set = new Set<string>();
    for (const k of Object.keys(first)) if ((first[k] ?? 0) > 0.5) set.add(k);
    for (const k of Object.keys(second)) if ((second[k] ?? 0) > 0.5) set.add(k);
    return set.size;
  };
  return (
    <div className="section" style={{ marginTop: 12 }}>
      <h3 className="h3" style={{ fontSize: 14 }}>Appendix A — Allocation Inventory</h3>
      <div className="body" style={{ marginBottom: 10 }}>
        <p style={{ marginTop: 0 }}>
          The allocation inventory enumerates every indirect cost center
          included in the Plan, the cost pools published within each
          center, the allocation basis assigned to each pool, the net
          allocable expenditures of the pool, and the count of receiving
          departments to which the pool distributes.
        </p>
      </div>
      <table>
        <thead>
          <tr>
            <th>Indirect cost center</th>
            <th>Cost pool</th>
            <th>Pool description</th>
            <th>Allocation basis</th>
            <th className="num">Net allocable</th>
            <th className="num">Receivers</th>
          </tr>
        </thead>
        <tbody>
          {payload.capCenterOrder.map((centerKey) => {
            const pools = poolsByCenterKey.get(centerKey) ?? [];
            const centerName = meta.get(centerKey)?.name ?? centerKey;
            if (pools.length === 0) {
              return (
                <tr key={centerKey}>
                  <td><b>{centerName}</b></td>
                  <td colSpan={5} style={{ color: "var(--ink-3)" }}>Not available</td>
                </tr>
              );
            }
            return pools.map((pl, i) => {
              const { basis } = basisForPool(pl, payload.allocationBases);
              const desc = pl.recoverability && pl.recoverability.trim()
                ? pl.recoverability
                : "Not available";
              return (
                <tr key={pl.id}>
                  <td>{i === 0 ? <b>{centerName}</b> : <span className="dim">{centerName}</span>}</td>
                  <td><b>{pl.pool}</b></td>
                  <td style={{ color: "var(--ink-2)" }}>{desc}</td>
                  <td><span className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>{basis}</span></td>
                  <td className="num">{fmt.dollars(pl.amount)}</td>
                  <td className="num">{receiverCount(pl.id)}</td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Appendix B — Allocation Basis Statistics
// ---------------------------------------------------------------------------

function AppendixB({ payload }: { payload: CapExportPayload }) {
  const usage = new Map<string, { count: number; allocable: number }>();
  for (const pl of payload.capPools) {
    const { basis } = basisForPool(pl, payload.allocationBases);
    const cur = usage.get(basis) ?? { count: 0, allocable: 0 };
    cur.count += 1;
    cur.allocable += pl.amount;
    usage.set(basis, cur);
  }
  const rows = payload.allocationBases.map((b) => {
    const u = usage.get(b.driverKey) ?? { count: 0, allocable: 0 };
    return {
      name: b.name,
      driverKey: b.driverKey,
      source: b.source && b.source.trim() ? b.source : "Not available",
      note: b.methodologyNote && b.methodologyNote.trim() ? b.methodologyNote : "Not available",
      poolsUsing: u.count,
      allocable: u.allocable,
    };
  }).sort((a, b) => b.allocable - a.allocable);

  return (
    <div className="section" style={{ marginTop: 22 }}>
      <h3 className="h3" style={{ fontSize: 14 }}>Appendix B — Allocation Basis Statistics</h3>
      <div className="body" style={{ marginBottom: 10 }}>
        <p style={{ marginTop: 0 }}>
          The following table summarizes each allocation basis defined in
          the Plan, the source of the underlying allocation statistics, the
          number of cost pools distributed on the basis, and the
          aggregate net allocable cost distributed using the basis.
          Per-receiver basis units (for example, FTE counts, transaction
          counts, square footage, agenda items) underlie the per-pool
          distributions shown in the allocation detail schedules in
          Section 9.
        </p>
      </div>
      <table>
        <thead>
          <tr>
            <th>Allocation basis</th>
            <th>Driver key</th>
            <th>Basis source</th>
            <th>Methodology note</th>
            <th className="num">Pools using</th>
            <th className="num">Net allocable distributed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.driverKey + r.name}>
              <td><b>{r.name}</b></td>
              <td><span className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>{r.driverKey}</span></td>
              <td style={{ color: "var(--ink-2)" }}>{r.source}</td>
              <td style={{ color: "var(--ink-2)" }}>{r.note}</td>
              <td className="num">{r.poolsUsing}</td>
              <td className="num">{r.allocable > 0 ? fmt.dollars(r.allocable) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="body" style={{
        marginTop: 8, fontSize: 11.5, color: "var(--ink-3)",
      }}>
        Per-receiver basis unit schedules supporting each distribution are
        applied by the allocation engine and are reflected in the
        first-pass and second-pass dollar columns of the per-pool
        schedules in Section 9. Where source statistical schedules are not
        available for a basis, the table reports the basis source as
        &ldquo;Not available.&rdquo;
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Appendix C — Provider Department Summaries
// ---------------------------------------------------------------------------

function AppendixC({ payload }: { payload: CapExportPayload }) {
  const indirectNodes = payload.model.nodes.filter((n) => n.role === "indirect");
  const stepIndex = stepIndexMap(payload);

  const rows = indirectNodes
    .map((node) => {
      const centerName = node.name;
      const pools = payload.capPools.filter((pl) => pl.centerGlCode === node.key);
      const departmental = pools.reduce((a, pl) => a + pl.amount, 0);

      let outgoing = 0;
      const receiverByKey = new Map<string, number>();
      for (const pl of pools) {
        const first = payload.model.firstAllocation[pl.id] ?? {};
        const second = payload.model.secondAllocation[pl.id] ?? {};
        for (const [k, v] of Object.entries(first)) {
          if (k === node.key) continue;
          outgoing += v;
          receiverByKey.set(k, (receiverByKey.get(k) ?? 0) + v);
        }
        for (const [k, v] of Object.entries(second)) {
          if (k === node.key) continue;
          outgoing += v;
          receiverByKey.set(k, (receiverByKey.get(k) ?? 0) + v);
        }
      }

      const targetStep = stepIndex.get(node.key) ?? -1;
      let incoming = 0;
      for (const sp of payload.capPools) {
        const srcStep = stepIndex.get(sp.centerGlCode) ?? -1;
        const isUpstream = srcStep !== -1 && targetStep !== -1 && srcStep < targetStep;
        if (!isUpstream) continue;
        const r1 = payload.model.firstAllocation[sp.id]?.[node.key] ?? 0;
        const r2 = payload.model.secondAllocation[sp.id]?.[node.key] ?? 0;
        incoming += r1 + r2;
      }

      const topReceivers = [...receiverByKey.entries()]
        .map(([k, v]) => {
          const n = payload.model.nodes.find((x) => x.key === k);
          return { name: n?.name ?? k, amount: v };
        })
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3);

      const bases = Array.from(new Set(pools.map((pl) => basisForPool(pl, payload.allocationBases).basis)));

      return {
        center: centerName,
        departmental,
        incoming,
        outgoing,
        bases,
        topReceivers,
        anyActivity: departmental > 0.5 || incoming > 0.5 || outgoing > 0.5,
      };
    })
    .filter((r) => r.anyActivity);

  return (
    <div className="section" style={{ marginTop: 22 }}>
      <h3 className="h3" style={{ fontSize: 14 }}>Appendix C — Provider Department Summaries</h3>
      <div className="body" style={{ marginBottom: 10 }}>
        <p style={{ marginTop: 0 }}>
          Provider summaries report each central service department&apos;s
          departmental allocable expenditures, incoming allocations from
          upstream central service departments, outgoing allocations
          distributed to receiving departments, allocation bases used, and
          top receiving departments under the Plan.
        </p>
      </div>
      <table>
        <thead>
          <tr>
            <th>Provider department</th>
            <th className="num">Departmental allocable</th>
            <th className="num">Incoming</th>
            <th className="num">Outgoing</th>
            <th>Bases used</th>
            <th>Top receivers</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.center}>
              <td><b>{r.center}</b></td>
              <td className="num">{fmt.dollars(r.departmental)}</td>
              <td className="num">{r.incoming > 0.5 ? fmt.dollars(r.incoming) : "—"}</td>
              <td className="num">{r.outgoing > 0.5 ? fmt.dollars(r.outgoing) : "—"}</td>
              <td>
                {r.bases.length > 0
                  ? r.bases.map((b) => (
                      <span key={b} className="mono" style={{
                        fontSize: 10, color: "var(--ink-2)", marginRight: 6,
                      }}>{b}</span>
                    ))
                  : <span style={{ color: "var(--ink-3)" }}>Not available</span>}
              </td>
              <td style={{ color: "var(--ink-2)" }}>
                {r.topReceivers.length > 0
                  ? r.topReceivers.map((t, i) => (
                      <div key={t.name} style={{
                        display: "flex", justifyContent: "space-between",
                        marginTop: i === 0 ? 0 : 1,
                      }}>
                        <span>{t.name}</span>
                        <span className="num mono dim" style={{ fontSize: 10, marginLeft: 8 }}>
                          {fmt.dollars(t.amount)}
                        </span>
                      </div>
                    ))
                  : <span style={{ color: "var(--ink-3)" }}>Not available</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Appendix D — Receiver Summaries
// ---------------------------------------------------------------------------

function AppendixD({ payload }: { payload: CapExportPayload }) {
  const directNodes = payload.model.nodes.filter((n) => n.role === "direct");
  const totalReceivedAll = Object.values(payload.model.directTotals)
    .reduce((a, v) => a + v, 0);

  const meta = pdfCenterMeta(payload);
  const rows = directNodes
    .map((node) => {
      const total = payload.model.directTotals[node.key] ?? 0;

      const byProviderKey = new Map<string, number>();
      for (const pl of payload.capPools) {
        const r1 = payload.model.firstAllocation[pl.id]?.[node.key] ?? 0;
        const r2 = payload.model.secondAllocation[pl.id]?.[node.key] ?? 0;
        const amt = r1 + r2;
        if (amt < 0.5) continue;
        byProviderKey.set(pl.centerGlCode, (byProviderKey.get(pl.centerGlCode) ?? 0) + amt);
      }
      const byProvider = new Map<string, number>();
      for (const [key, amt] of byProviderKey) {
        byProvider.set(meta.get(key)?.name ?? key, amt);
      }
      const topProviders = [...byProvider.entries()]
        .map(([name, amt]) => ({ name, amount: amt }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3);

      return {
        name: node.name,
        total,
        topProviders,
        share: totalReceivedAll > 0 ? (total / totalReceivedAll) * 100 : 0,
      };
    })
    .filter((r) => r.total > 0.5)
    .sort((a, b) => b.total - a.total);

  return (
    <div className="section" style={{ marginTop: 22 }}>
      <h3 className="h3" style={{ fontSize: 14 }}>Appendix D — Receiver Summaries</h3>
      <div className="body" style={{ marginBottom: 10 }}>
        <p style={{ marginTop: 0 }}>
          Receiver summaries report the total indirect support service
          cost received by each operating department under the Plan,
          identify the central service departments providing the largest
          shares of support, and show each receiver&apos;s share of total
          allocated indirect support cost across the organization.
        </p>
      </div>
      <table>
        <thead>
          <tr>
            <th>Receiving department</th>
            <th className="num">Total indirect received</th>
            <th className="num">Share of total</th>
            <th>Largest providers of support</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td><b>{r.name}</b></td>
              <td className="num">{fmt.dollars(r.total)}</td>
              <td className="num">{r.share.toFixed(1)}%</td>
              <td style={{ color: "var(--ink-2)" }}>
                {r.topProviders.length > 0
                  ? r.topProviders.map((t, i) => (
                      <div key={t.name} style={{
                        display: "flex", justifyContent: "space-between",
                        marginTop: i === 0 ? 0 : 1,
                      }}>
                        <span>{t.name}</span>
                        <span className="num mono dim" style={{ fontSize: 10, marginLeft: 8 }}>
                          {fmt.dollars(t.amount)}
                        </span>
                      </div>
                    ))
                  : <span style={{ color: "var(--ink-3)" }}>Not available</span>}
              </td>
            </tr>
          ))}
          <tr className="total">
            <td>Total</td>
            <td className="num">{fmt.dollars(totalReceivedAll)}</td>
            <td className="num">100.0%</td>
            <td/>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Appendix E — Assumptions and Limitations
// ---------------------------------------------------------------------------

function AppendixE() {
  return (
    <div className="section" style={{ marginTop: 22 }}>
      <h3 className="h3" style={{ fontSize: 14 }}>Appendix E — Assumptions and Limitations</h3>
      <div className="body body-lede">
        <ul>
          <li>
            This Cost Allocation Plan is based on budgeted expenditure
            data and operational statistics available at the time of
            analysis. Subsequent changes in adopted appropriations,
            staffing structure, allocation statistics, or organizational
            structure will affect the results of the allocation.
          </li>
          <li>
            Allocation methodologies are intended to reasonably
            approximate the distribution of indirect support services
            based on estimated benefit received. Bases were selected to
            provide a defensible nexus between the support service
            provided and the operational activity of receiving
            departments.
          </li>
          <li>
            Certain expenditures, including capital outlay, debt service,
            pass-through transactions, and other non-allocable costs, may
            be excluded from allocation calculations. Each pool&apos;s net
            allocable amount reflects the allocable portion of the
            underlying expenditures after such exclusions.
          </li>
          <li>
            The Plan is intended as an internal financial management and
            planning tool and should be periodically updated to reflect
            organizational and operational changes. A comprehensive
            update is generally appropriate when material changes occur
            in staffing, organizational structure, financial systems, or
            shared service relationships.
          </li>
          <li>
            Final budgetary, reimbursement, and policy applications of
            the Plan remain management and governing body decisions. The
            Plan supports such decisions by providing a defensible basis
            for the full cost of operations but does not itself
            constitute a budgetary or reimbursement action.
          </li>
          <li>
            Where source statistical schedules are not yet attached to a
            basis or pool, the Plan reports the affected fields as
            &ldquo;Not available.&rdquo; Such items do not affect the
            engine&apos;s calculation of the allocation but are noted
            for transparency.
          </li>
        </ul>
      </div>
    </div>
  );
}

// ============================================================================
// Small helpers
// ============================================================================

function computeProviderOutgoing(payload: CapExportPayload): Map<string, number> {
  const meta = pdfCenterMeta(payload);
  const out = new Map<string, number>();
  for (const pl of payload.capPools) {
    const first = payload.model.firstAllocation[pl.id] ?? {};
    const second = payload.model.secondAllocation[pl.id] ?? {};
    const selfKey = pl.centerGlCode;
    let total = 0;
    for (const [k, v] of Object.entries(first)) {
      if (k === selfKey) continue;
      total += v;
    }
    for (const [k, v] of Object.entries(second)) {
      if (k === selfKey) continue;
      total += v;
    }
    const label = meta.get(pl.centerGlCode)?.name ?? pl.center;
    out.set(label, (out.get(label) ?? 0) + total);
  }
  return out;
}

/** Center identity key → step-order index. stepOrder is NodeKey[] so the
 *  identity key IS the key — every consumer that needs step ordering
 *  reads pl.centerGlCode against this map. */
function stepIndexMap(payload: CapExportPayload): Map<string, number> {
  const m = new Map<string, number>();
  payload.model.stepOrder.forEach((k, i) => m.set(k, i));
  return m;
}

