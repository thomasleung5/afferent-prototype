import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, DeptChip, SectionLabel, StatusPill, type PillKind } from "@/components/ui";
import { DataTable, type Column } from "@/components/table";
import { StatusRow, type StatusItem } from "@/features/_shared/StatusRow";
import { fmt } from "@/lib/format";
import {
  deriveMonitoringData,
  type DeptHealth,
  type DriftDriver,
  type RecoveryAlert,
  type Trend,
  type RecoveryStatus,
  type AlertSeverity,
} from "@/lib/data/monitoring";
import { DEPTS } from "@/lib/data/departments";
import { useBuildState } from "@/lib/store";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

const TREND_GLYPH: Record<Trend, { glyph: string; color: string; label: string }> = {
  up:   { glyph: "▲", color: "var(--pos)",  label: "improving" },
  down: { glyph: "▼", color: "var(--neg)",  label: "declining" },
  flat: { glyph: "▬", color: "var(--ink-3)", label: "flat" },
};

const STATUS_PILL: Record<RecoveryStatus, { kind: PillKind; label: string }> = {
  below:    { kind: "bad",  label: "Below target" },
  watch:    { kind: "warn", label: "Watch" },
  "on-track": { kind: "ok", label: "On track" },
};

const SEVERITY_PILL: Record<AlertSeverity, { kind: PillKind; label: string }> = {
  high:  { kind: "bad",   label: "High priority" },
  stale: { kind: "warn",  label: "Stale assumption" },
  below: { kind: "review", label: "Below target" },
  ready: { kind: "info",  label: "Ready" },
};

type AlertFilter = "ALL" | AlertSeverity;

export default function RevenueMonitoringPage() {
  const [alertFilter, setAlertFilter] = useState<AlertFilter>("ALL");
  const { derived, policyTargets, imports } = useBuildState();
  const monitoring = useMemo(
    () => deriveMonitoringData({
      comparisons: derived.comparisons,
      impact: derived.impact,
      policyTargets,
      imports,
    }),
    [derived.comparisons, derived.impact, policyTargets, imports],
  );
  const { summary, deptHealth, driftDrivers, recoveryAlerts, staffActions } = monitoring;

  const recoveryTone = summary.citywideRecovery >= summary.policyTarget ? "pos"
    : summary.citywideRecovery >= summary.policyTarget * 0.85 ? "warn"
    : "neg";
  const summaryItems: StatusItem[] = [
    { label: "Citywide recovery", value: `${summary.citywideRecovery}%`, tone: recoveryTone },
    { label: "Policy target",     value: `${summary.policyTarget}%` },
    { label: "Revenue drift",     value: `${fmt.dollarsK(summary.revenueDrift)}/yr`, tone: summary.revenueDrift < 0 ? "neg" : "pos" },
    { label: "Subsidy exposure",  value: `${fmt.dollarsK(summary.subsidyExposure)}/yr`, tone: "warn" },
    { label: "Fees below target", value: `${summary.feesBelowTarget}` },
    { label: "Last model update", value: summary.lastModelUpdate },
  ];

  const deptCols: Column<DeptHealth & { id: string }>[] = [
    {
      key: "dept",
      label: "Department",
      width: "minmax(220px, 1.5fr)",
      sortable: true,
      render: (r) => (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <DeptChip code={r.dept}/>
          <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>
            {DEPTS[r.dept].name.replace(" Administration", "")}
          </span>
        </div>
      ),
    },
    {
      key: "target",
      label: "Target recovery",
      width: "130px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{r.target}%</span>,
    },
    {
      key: "current",
      label: "Current recovery",
      width: "140px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="num" style={{
          fontSize: 14, fontWeight: 600, letterSpacing: "-0.005em",
        }}>{r.current}%</span>
      ),
    },
    {
      key: "drift",
      label: "Drift",
      width: "90px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="num" style={{
          color: r.drift < 0 ? "var(--neg)" : r.drift > 0 ? "var(--pos)" : "var(--ink-3)",
          fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.005em",
        }}>
          {r.drift > 0 ? "+" : ""}{r.drift} pts
        </span>
      ),
    },
    {
      key: "subsidy",
      label: "Subsidy exposure",
      width: "140px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="num" style={{
          color: "var(--neg)", fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.005em",
        }}>
          {fmt.dollarsK(r.subsidy)}/yr
        </span>
      ),
    },
    {
      key: "trend",
      label: "Trend",
      width: "100px",
      align: "left",
      render: (r) => {
        const t = TREND_GLYPH[r.trend];
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--ink-3)" }}>
            <span style={{ color: t.color, fontSize: 9 }}>{t.glyph}</span>
            {t.label}
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      width: "150px",
      align: "right",
      render: (r) => {
        const s = STATUS_PILL[r.status];
        return (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <StatusPill kind={s.kind}>{s.label}</StatusPill>
          </div>
        );
      },
    },
  ];

  const driverCols: Column<DriftDriver>[] = [
    {
      key: "driver",
      label: "Driver",
      width: "minmax(220px, 1.6fr)",
      render: (r) => (
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{r.driver}</div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 3 }}>{r.id}</div>
        </div>
      ),
    },
    {
      key: "area",
      label: "Affected area",
      width: "minmax(140px, 1fr)",
      render: (r) => <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{r.area}</span>,
    },
    {
      key: "annualImpact",
      label: "Annual impact",
      width: "130px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="num" style={{
          color: "var(--neg)", fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.005em",
        }}>
          +{fmt.dollarsK(r.annualImpact)} gap
        </span>
      ),
    },
    {
      key: "evidence",
      label: "Evidence",
      width: "minmax(220px, 1.6fr)",
      render: (r) => <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{r.evidence}</span>,
    },
    {
      key: "action",
      label: "Action",
      width: "minmax(170px, 1.1fr)",
      render: (r) => r.actionHref ? (
        <Link to={r.actionHref} style={{
          fontSize: 12, color: "var(--accent)",
          display: "inline-block",
          borderBottom: "1px solid var(--accent)",
          paddingBottom: 1,
          textDecoration: "none",
        }}>
          {r.action} →
        </Link>
      ) : (
        <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{r.action}</span>
      ),
    },
  ];

  const alertCounts = useMemo(() => ({
    ALL:   recoveryAlerts.length,
    high:  recoveryAlerts.filter((a) => a.severity === "high").length,
    stale: recoveryAlerts.filter((a) => a.severity === "stale").length,
    below: recoveryAlerts.filter((a) => a.severity === "below").length,
    ready: recoveryAlerts.filter((a) => a.severity === "ready").length,
  }), [recoveryAlerts]);

  const filteredAlerts = useMemo(
    () => alertFilter === "ALL"
      ? recoveryAlerts
      : recoveryAlerts.filter((a) => a.severity === alertFilter),
    [recoveryAlerts, alertFilter],
  );

  const alertCols: Column<RecoveryAlert>[] = [
    {
      key: "alert",
      label: "Alert",
      width: "minmax(280px, 2fr)",
      render: (r) => (
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{r.alert}</div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 3 }}>{r.id}</div>
        </div>
      ),
    },
    {
      key: "dept",
      label: "Dept",
      width: "70px",
      render: (r) => <DeptChip code={r.dept}/>,
    },
    {
      key: "impact",
      label: "Impact",
      width: "100px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="num" style={{
          color: "var(--neg)", fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.005em",
        }}>
          +{fmt.dollarsK(r.impact)}
        </span>
      ),
    },
    {
      key: "trigger",
      label: "Trigger",
      width: "minmax(180px, 1.3fr)",
      render: (r) => <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{r.trigger}</span>,
    },
    {
      key: "action",
      label: "Recommended action",
      width: "minmax(200px, 1.4fr)",
      render: (r) => <span style={{ fontSize: 12.5 }}>{r.action}</span>,
    },
    {
      key: "status",
      label: "Status",
      width: "150px",
      align: "right",
      render: (r) => {
        const s = SEVERITY_PILL[r.severity];
        return (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <StatusPill kind={s.kind}>{s.label}</StatusPill>
          </div>
        );
      },
    },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="Operations · Revenue monitoring"
        title="Revenue Monitoring"
        subtitle="Cost recovery drift and post-adoption fee actions."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export brief</Btn>}
      />

      {/* 1. Summary metric strip */}
      <StatusRow items={summaryItems}/>

      {/* 2. Revenue health by department */}
      <div>
        <SectionLabel right={`${deptHealth.length} departments`}>
          Revenue health by department
        </SectionLabel>
        <DataTable
          cols={deptCols}
          rows={deptHealth.map((d) => ({ ...d, id: d.dept }))}
          defaultSort={{ key: "drift", dir: "asc" }}
        />
      </div>

      {/* 3. Drift drivers */}
      <div>
        <SectionLabel right="Where the citywide gap concentrates">
          Recovery drivers
        </SectionLabel>
        <DataTable
          cols={driverCols}
          rows={driftDrivers}
          defaultSort={{ key: "annualImpact", dir: "desc" }}
        />
      </div>

      {/* 4. Recovery alerts */}
      <div>
        <SectionLabel right={`${filteredAlerts.length} of ${recoveryAlerts.length} alerts`}>
          Recovery alerts
        </SectionLabel>
        <DataTable
          cols={alertCols}
          rows={filteredAlerts}
          defaultSort={{ key: "impact", dir: "desc" }}
          filters={[{
            id: "severity",
            label: "Queue",
            options: [
              { value: "ALL",   label: "All",                  count: alertCounts.ALL },
              { value: "high",  label: "High priority",        count: alertCounts.high },
              { value: "stale", label: "Stale assumptions",    count: alertCounts.stale },
              { value: "below", label: "Below target",         count: alertCounts.below },
              { value: "ready", label: "Ready for annual update", count: alertCounts.ready },
            ],
            value: alertFilter,
            onChange: (v) => setAlertFilter(v as AlertFilter),
          }]}
        />
      </div>

      {/* 5. Recommended staff actions */}
      {staffActions.length > 0 && (
        <div>
          <SectionLabel right={`${staffActions.length} action${staffActions.length === 1 ? "" : "s"} ranked by impact`}>
            Recommended staff actions
          </SectionLabel>
          <div style={{
            background: "var(--paper)", border: "1px solid var(--rule)",
          }}>
            {staffActions.map((a, i) => (
              <div key={a.id} style={{
                display: "grid",
                gridTemplateColumns: "minmax(220px, 1.3fr) minmax(220px, 1.8fr) 140px minmax(180px, 1.2fr)",
                columnGap: 28,
                padding: "14px 16px",
                alignItems: "center",
                borderBottom: i < staffActions.length - 1 ? "1px solid var(--rule)" : "none",
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{a.title}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 3 }}>{a.id}</div>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
                  {a.rationale}
                </div>
                <div className="num" style={{
                  fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.005em",
                  color: "var(--pos)", textAlign: "right",
                }}>
                  +{fmt.dollarsK(a.fiscalImpact)}/yr
                </div>
                <div>
                  {a.nextHref ? (
                    <Link to={a.nextHref} style={{
                      fontSize: 12, color: "var(--accent)",
                      display: "inline-block",
                      borderBottom: "1px solid var(--accent)",
                      paddingBottom: 1,
                      textDecoration: "none",
                    }}>
                      {a.nextStep} →
                    </Link>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{a.nextStep}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Page>
  );
}
