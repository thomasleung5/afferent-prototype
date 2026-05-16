import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, DeptChip, SectionLabel, StatusPill, type PillKind } from "@/components/ui";
import { DataTable, type Column } from "@/components/table";
import { StatusRow, type StatusItem } from "@/features/_shared/StatusRow";
import { fmt } from "@/lib/format";
import {
  MONITORING_SUMMARY,
  DEPT_HEALTH,
  DRIFT_DRIVERS,
  RECOVERY_ALERTS,
  STAFF_ACTIONS,
  RECOVERY_TREND,
  type DeptHealth,
  type DriftDriver,
  type RecoveryAlert,
  type Trend,
  type RecoveryStatus,
  type AlertSeverity,
} from "@/lib/data/monitoring";
import { DEPTS } from "@/lib/data/departments";
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

  const summaryItems: StatusItem[] = [
    { label: "Citywide recovery", value: `${MONITORING_SUMMARY.citywideRecovery}%`, tone: "neg" },
    { label: "Policy target",     value: `${MONITORING_SUMMARY.policyTarget}%` },
    { label: "Revenue drift",     value: `${fmt.dollarsK(MONITORING_SUMMARY.revenueDrift)}/yr`, tone: "neg" },
    { label: "Subsidy exposure",  value: `${fmt.dollarsK(MONITORING_SUMMARY.subsidyExposure)}/yr`, tone: "warn" },
    { label: "Fees below target", value: `${MONITORING_SUMMARY.feesBelowTarget}` },
    { label: "Last model update", value: MONITORING_SUMMARY.lastModelUpdate },
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
          textDecoration: "underline", textUnderlineOffset: 3,
        }}>
          {r.action} →
        </Link>
      ) : (
        <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{r.action}</span>
      ),
    },
  ];

  const alertCounts = useMemo(() => ({
    ALL:   RECOVERY_ALERTS.length,
    high:  RECOVERY_ALERTS.filter((a) => a.severity === "high").length,
    stale: RECOVERY_ALERTS.filter((a) => a.severity === "stale").length,
    below: RECOVERY_ALERTS.filter((a) => a.severity === "below").length,
    ready: RECOVERY_ALERTS.filter((a) => a.severity === "ready").length,
  }), []);

  const filteredAlerts = useMemo(
    () => alertFilter === "ALL"
      ? RECOVERY_ALERTS
      : RECOVERY_ALERTS.filter((a) => a.severity === alertFilter),
    [alertFilter],
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
        subtitle="Track cost recovery drift, subsidy exposure, and fee actions after adoption."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export brief</Btn>}
      />

      {/* 1. Summary metric strip */}
      <StatusRow items={summaryItems}/>

      {/* 2. Revenue health by department */}
      <div>
        <SectionLabel right={`${DEPT_HEALTH.length} departments · live model`}>
          Revenue health by department
        </SectionLabel>
        <DataTable
          cols={deptCols}
          rows={DEPT_HEALTH.map((d) => ({ ...d, id: d.dept }))}
          defaultSort={{ key: "drift", dir: "asc" }}
          footerNote="Recovery compares current revenue to cost of service at each department's policy target."
        />
      </div>

      {/* 3. Drift drivers */}
      <div>
        <SectionLabel right="Since FY 2025–26 adoption">
          What changed since adoption
        </SectionLabel>
        <DataTable
          cols={driverCols}
          rows={DRIFT_DRIVERS}
          defaultSort={{ key: "annualImpact", dir: "desc" }}
          footerNote="Drivers are ranked by annual gap impact. Links jump to the Build Model section that owns the input."
        />
      </div>

      {/* 4. Recovery alerts */}
      <div>
        <SectionLabel right={`${filteredAlerts.length} of ${RECOVERY_ALERTS.length} alerts`}>
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
      <div>
        <SectionLabel right={`${STAFF_ACTIONS.length} actions ranked by impact`}>
          Recommended staff actions
        </SectionLabel>
        <div style={{
          background: "var(--paper)", border: "1px solid var(--rule)",
        }}>
          {STAFF_ACTIONS.map((a, i) => (
            <div key={a.id} style={{
              display: "grid",
              gridTemplateColumns: "minmax(220px, 1.3fr) minmax(220px, 1.8fr) 140px minmax(180px, 1.2fr)",
              columnGap: 28,
              padding: "14px 16px",
              alignItems: "center",
              borderBottom: i < STAFF_ACTIONS.length - 1 ? "1px solid var(--rule)" : "none",
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
                    textDecoration: "underline", textUnderlineOffset: 3,
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

      {/* 6. Recovery trend (subtle, table-like) */}
      <div>
        <SectionLabel right="Last four quarters">
          Citywide recovery trend
        </SectionLabel>
        <div style={{
          background: "var(--paper)", border: "1px solid var(--rule)",
          padding: "14px 16px",
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${RECOVERY_TREND.length}, 1fr)`,
            gap: 0,
          }}>
            {RECOVERY_TREND.map((p, i) => {
              const prev = i > 0 ? RECOVERY_TREND[i - 1].recovery : null;
              const delta = prev != null ? p.recovery - prev : 0;
              return (
                <div key={p.q} style={{
                  padding: "8px 14px",
                  borderLeft: i > 0 ? "1px solid var(--rule)" : "none",
                  display: "flex", flexDirection: "column", gap: 4,
                }}>
                  <div className="mono" style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
                    color: "var(--ink-3)", textTransform: "uppercase",
                  }}>{p.q}</div>
                  <div className="num display" style={{
                    fontSize: 22, fontWeight: 600, lineHeight: 1.1, letterSpacing: "-0.01em",
                  }}>{p.recovery}%</div>
                  {prev != null && (
                    <div className="num" style={{
                      fontSize: 11, color: delta < 0 ? "var(--neg)" : delta > 0 ? "var(--pos)" : "var(--ink-3)",
                    }}>
                      {delta > 0 ? "+" : ""}{delta} pts
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Page>
  );
}
