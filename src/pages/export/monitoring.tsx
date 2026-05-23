import { useCallback, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import {
  Btn, ExportCover, ExportToolbar, Icon, PrintStyles,
} from "@/components/ui";
import { fmt } from "@/lib/format";
import { useActiveJurisdiction } from "@/lib/active";
import type { Jurisdiction } from "@/lib/data/jurisdictions";
import { useBuildState } from "@/lib/store";
import {
  deriveMonitoringData, type MonitoringData,
} from "@/lib/data/monitoring";
import { buildCsv, downloadCsv } from "@/lib/export/csv";
import { slugCity, useAutoPrint } from "@/lib/printing";

export default function RevenueMonitoringExportPage() {
  const { derived, policyTargets, imports } = useBuildState();
  const jurisdiction = useActiveJurisdiction();
  const monitoring = useMemo(
    () => deriveMonitoringData({
      comparisons: derived.comparisons,
      impact: derived.impact,
      deptRollup: derived.deptRollup,
      policyTargets,
      imports,
    }),
    [derived.comparisons, derived.impact, derived.deptRollup, policyTargets, imports],
  );

  return (
    <>
      <PrintStyles/>
      <Toolbar monitoring={monitoring} jurisdiction={jurisdiction}/>
      <Report monitoring={monitoring} jurisdiction={jurisdiction}/>
    </>
  );
}

function Toolbar({
  monitoring, jurisdiction,
}: { monitoring: MonitoringData; jurisdiction: Jurisdiction }) {
  const exportCsv = useCallback(() => {
    const { summary, deptHealth, driftDrivers, recoveryAlerts, staffActions } = monitoring;
    const csv = buildCsv([
      ["Section", "Field", "Value"],
      ["Summary", "Citywide recovery", `${summary.citywideRecovery}%`],
      ["Summary", "Policy target", `${summary.policyTarget}%`],
      ["Summary", "Revenue drift", `${fmt.dollars(summary.revenueDrift)}/yr`],
      ["Summary", "Subsidy exposure", `${fmt.dollars(summary.subsidyExposure)}/yr`],
      ["Summary", "Fees below target", String(summary.feesBelowTarget)],
      ["Summary", "Last model update", summary.lastModelUpdate],
      null,
      ["Dept health", "Dept", "Target · Current · Drift · Status"],
      ...deptHealth.map((d) => [
        "Dept health",
        d.dept,
        `${d.target}% · ${d.current}% · ${d.drift > 0 ? "+" : ""}${d.drift} pts · ${d.status}`,
      ]),
      null,
      ["Drift drivers", "Driver", "Area · Annual impact · Evidence"],
      ...driftDrivers.map((r) => [
        "Drift drivers",
        r.driver,
        `${r.area} · ${fmt.dollars(r.annualImpact)} gap · ${r.evidence}`,
      ]),
      null,
      ["Recovery alerts", "Alert", "Dept · Impact · Trigger · Action · Severity"],
      ...recoveryAlerts.map((a) => [
        "Recovery alerts",
        a.alert,
        `${a.dept} · +${fmt.dollars(a.impact)} · ${a.trigger} · ${a.action} · ${a.severity}`,
      ]),
      null,
      ["Staff actions", "Title", "Rationale · Next step · Fiscal impact"],
      ...staffActions.map((a) => [
        "Staff actions",
        a.title,
        `${a.rationale} · ${a.nextStep} · ${fmt.dollars(a.fiscalImpact)}`,
      ]),
    ]);
    downloadCsv(csv, `${slugCity(jurisdiction.name)}-monitoring-brief.csv`);
  }, [monitoring, jurisdiction.name]);

  return (
    <ExportToolbar
      subtitle={`${jurisdiction.name} · Revenue monitoring brief`}
      extraActions={(
        <Btn kind="ghost" onClick={exportCsv}>
          <Icon name="download" size={13}/> CSV
        </Btn>
      )}
    />
  );
}

function Report({
  monitoring, jurisdiction,
}: { monitoring: MonitoringData; jurisdiction: Jurisdiction }) {
  useAutoPrint();
  return (
    <div className="report">
      <Cover jurisdiction={jurisdiction}/>
      <SummarySection monitoring={monitoring}/>
      <DeptHealthSection monitoring={monitoring}/>
      <DriftDriversSection monitoring={monitoring}/>
      <RecoveryAlertsSection monitoring={monitoring}/>
      <StaffActionsSection monitoring={monitoring}/>
    </div>
  );
}

function Cover({ jurisdiction }: { jurisdiction: Jurisdiction }) {
  return (
    <ExportCover
      city={jurisdiction.name}
      title="Revenue Monitoring Brief"
      subtitle="Cost recovery drift and post-adoption fee actions."
      fields={[
        { label: "Generated", value: new Date().toLocaleString() },
      ]}
    />
  );
}

function SummarySection({ monitoring }: { monitoring: MonitoringData }) {
  const s = monitoring.summary;
  return (
    <section className="section" style={{ marginBottom: 32 }}>
      <div className="eyebrow">Section 1</div>
      <h2 className="h2">Summary</h2>
      <div style={{
        marginTop: 12,
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0,
        border: "1px solid var(--rule)",
      }}>
        <Tile label="Citywide recovery" value={`${s.citywideRecovery}%`}/>
        <Tile label="Policy target"     value={`${s.policyTarget}%`}/>
        <Tile label="Revenue drift"     value={`${fmt.dollarsK(s.revenueDrift)}/yr`} last
              tone={s.revenueDrift < 0 ? "neg" : "pos"}/>
        <Tile label="Subsidy exposure"  value={`${fmt.dollarsK(s.subsidyExposure)}/yr`} tone="warn"/>
        <Tile label="Fees below target" value={String(s.feesBelowTarget)}/>
        <Tile label="Last model update" value={s.lastModelUpdate} last/>
      </div>
    </section>
  );
}

function DeptHealthSection({ monitoring }: { monitoring: MonitoringData }) {
  if (monitoring.deptHealth.length === 0) return null;
  return (
    <section className="section" style={{ marginBottom: 32 }}>
      <div className="eyebrow">Section 2</div>
      <h2 className="h2">Department health</h2>
      <table>
        <thead>
          <tr>
            <th>Dept</th>
            <th className="num">Target</th>
            <th className="num">Current</th>
            <th className="num">Drift</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {monitoring.deptHealth.map((d) => (
            <tr key={d.dept}>
              <td><span className="mono">{d.dept}</span></td>
              <td className="num">{d.target}%</td>
              <td className="num"><b>{d.current}%</b></td>
              <td className="num" style={{
                color: d.drift < 0 ? "var(--neg)" : d.drift > 0 ? "var(--pos)" : "var(--ink-3)",
              }}>{d.drift > 0 ? "+" : ""}{d.drift} pts</td>
              <td>{d.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function DriftDriversSection({ monitoring }: { monitoring: MonitoringData }) {
  if (monitoring.driftDrivers.length === 0) return null;
  return (
    <section className="section section-break" style={{ marginBottom: 32 }}>
      <div className="eyebrow">Section 3</div>
      <h2 className="h2">Drift drivers</h2>
      <table>
        <thead>
          <tr>
            <th>Driver</th>
            <th>Affected area</th>
            <th className="num">Annual impact</th>
            <th>Evidence</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {monitoring.driftDrivers.map((r) => (
            <tr key={r.id}>
              <td>
                <div>{r.driver}</div>
                <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-3)", marginTop: 2 }}>{r.id}</div>
              </td>
              <td>{r.area}</td>
              <td className="num" style={{ color: "var(--neg)" }}>
                <b>+{fmt.dollarsK(r.annualImpact)}</b> gap
              </td>
              <td>{r.evidence}</td>
              <td>{r.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function RecoveryAlertsSection({ monitoring }: { monitoring: MonitoringData }) {
  if (monitoring.recoveryAlerts.length === 0) return null;
  return (
    <section className="section section-break" style={{ marginBottom: 32 }}>
      <div className="eyebrow">Section 4</div>
      <h2 className="h2">Recovery alerts</h2>
      <table>
        <thead>
          <tr>
            <th>Alert</th>
            <th>Dept</th>
            <th className="num">Impact</th>
            <th>Trigger</th>
            <th>Recommended action</th>
            <th>Severity</th>
          </tr>
        </thead>
        <tbody>
          {monitoring.recoveryAlerts.map((a) => (
            <tr key={a.id}>
              <td>
                <div>{a.alert}</div>
                <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-3)", marginTop: 2 }}>{a.id}</div>
              </td>
              <td><span className="mono">{a.dept}</span></td>
              <td className="num" style={{ color: "var(--neg)" }}>
                <b>+{fmt.dollarsK(a.impact)}</b>
              </td>
              <td>{a.trigger}</td>
              <td>{a.action}</td>
              <td><span className="mono">{a.severity}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function StaffActionsSection({ monitoring }: { monitoring: MonitoringData }) {
  if (monitoring.staffActions.length === 0) return null;
  return (
    <section className="section" style={{ marginBottom: 24 }}>
      <div className="eyebrow">Section 5</div>
      <h2 className="h2">Staff actions</h2>
      <table>
        <thead>
          <tr>
            <th>Action</th>
            <th>Rationale</th>
            <th>Next step</th>
            <th className="num">Fiscal impact</th>
          </tr>
        </thead>
        <tbody>
          {monitoring.staffActions.map((a) => (
            <tr key={a.id}>
              <td><b>{a.title}</b></td>
              <td>{a.rationale}</td>
              <td>{a.nextStep}</td>
              <td className="num">{fmt.dollarsK(a.fiscalImpact)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

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
        fontSize: 18, fontWeight: 600, color, letterSpacing: "-0.01em",
      }}>{value}</div>
    </div>
  );
}

