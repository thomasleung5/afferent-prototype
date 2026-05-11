"use client";

import { useMemo, useState } from "react";
import {
  DataTable,
  type Column, type FilterGroup,
} from "@/components/table";
import { DrilldownShell, DrilldownColumn, TraceBlock, Formula, SourcePill } from "@/components/ui";
import { fmt } from "@/lib/format";
import { CAP_POOL_BY_DEPT } from "@/lib/data/cap";
import type { CapPool, DeptCode } from "@/lib/types";
import { CapPoolDetail } from "./CapPoolDetail";
import { useBuildState } from "./BuildContext";

const ORDER: DeptCode[] = ["PLAN", "BLDG", "ENG"];

interface Row extends CapPool {
  flag?: boolean;
}

export function CapPoolsTable() {
  const { capPools } = useBuildState();
  const [reviewFilter, setReviewFilter] = useState("ALL");
  const [openId, setOpenId] = useState<string | undefined>();

  const all: Row[] = capPools.map((p) => ({ ...p, flag: p.review === "Review" }));
  const rows = useMemo(() => {
    if (reviewFilter === "REVIEW") return all.filter((r) => r.review === "Review");
    return all;
  }, [all, reviewFilter]);

  const filters: FilterGroup[] = [{
    id: "review", label: "Status",
    options: [
      { value: "ALL",    label: "All",          count: all.length },
      { value: "REVIEW", label: "Needs review", count: all.filter((r) => r.review === "Review").length },
    ],
    value: reviewFilter,
    onChange: setReviewFilter,
  }];

  const cols: Column<Row>[] = [
    {
      key: "center",
      label: "Center",
      width: "minmax(170px, 1.2fr)",
      sortable: true,
      render: (r) => <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{r.center}</span>,
    },
    {
      key: "pool",
      label: "Pool",
      width: "minmax(220px, 2fr)",
      sortable: true,
      render: (r) => (
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{r.pool}</div>
          <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>{r.id}</div>
        </div>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      width: "110px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{fmt.dollarsK(r.amount)}</span>,
    },
    {
      key: "basis",
      label: "Allocation basis",
      width: "minmax(240px, 1.8fr)",
      render: (r) => <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{r.basis}</span>,
    },
    {
      key: "recoverability",
      label: "Recoverability",
      width: "180px",
      sortable: true,
      render: (r) => <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{r.recoverability}</span>,
    },
    {
      key: "review",
      label: "Status",
      width: "100px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="mono" style={{
          display: "inline-block",
          fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
          padding: "2px 7px",
          textTransform: "uppercase",
          color: r.review === "Reviewed" ? "var(--pos)" : "var(--warn)",
          border: `1px solid ${r.review === "Reviewed" ? "var(--pos)" : "var(--warn)"}`,
          background: r.review === "Reviewed" ? "var(--pos-tint)" : "var(--warn-tint)",
        }}>{r.review}</span>
      ),
    },
  ];

  return (
    <DataTable
      title="Indirect cost pools"
      eyebrow="Inputs · One basis per pool, mixed bases not allowed"
      cols={cols}
      rows={rows}
      filters={filters}
      defaultSort={{ key: "amount", dir: "desc" }}
      stickySort={(a, b) => (a.flag ? 0 : 1) - (b.flag ? 0 : 1)}
      openId={openId}
      onRowClick={(r) => setOpenId(openId === r.id ? undefined : r.id)}
      renderDrilldown={(r) => {
        const byDept = ORDER.map((d) => ({
          dept: d,
          amount: (CAP_POOL_BY_DEPT[d] ?? []).find((x) => x.poolId === r.id)?.allocated ?? 0,
        }));
        const totalToDirect = byDept.reduce((a, b) => a + b.amount, 0);
        return (
          <DrilldownShell>
            <DrilldownColumn marker="①" title="Source · pool definition">
              <TraceBlock label="Pool ID"><span className="mono">{r.id}</span></TraceBlock>
              <TraceBlock label="Center">{r.center}</TraceBlock>
              <TraceBlock label="Receiving">{r.receiving}</TraceBlock>
              <TraceBlock label="Total amount"><b className="num">{fmt.dollars(r.amount)}</b></TraceBlock>
              <div style={{ marginTop: 10 }}>
                <SourcePill tone={r.review === "Reviewed" ? "fact" : "policy"}>
                  {r.review.toUpperCase()}
                </SourcePill>
              </div>
            </DrilldownColumn>

            <DrilldownColumn marker="②" title="Allocation method">
              <TraceBlock label="Basis">{r.basis}</TraceBlock>
              <TraceBlock label="Recoverability">{r.recoverability}</TraceBlock>
              <div style={{
                padding: "10px 14px", marginTop: 12,
                background: "var(--paper)", border: "1px solid var(--rule)",
                fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>pool amount</span>
                  <b>{fmt.dollars(r.amount)}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>step-down to direct</span>
                  <b>{fmt.dollars(totalToDirect)}</b>
                </div>
                <div style={{
                  borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6,
                  display: "flex", justifyContent: "space-between",
                }}>
                  <span>retained on indirect</span>
                  <b>{fmt.dollars(Math.max(0, r.amount - totalToDirect))}</b>
                </div>
              </div>
            </DrilldownColumn>

            <DrilldownColumn marker="③" title="Step-down → direct depts">
              <div style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}>
                {byDept.map((b, i) => {
                  const pct = totalToDirect > 0 ? Math.round((b.amount / totalToDirect) * 100) : 0;
                  return (
                    <div key={b.dept} style={{
                      display: "grid", gridTemplateColumns: "80px 70px 1fr",
                      gap: 12, padding: "7px 12px",
                      borderBottom: i < byDept.length - 1 ? "1px solid var(--rule)" : "none",
                      alignItems: "baseline", fontSize: 12.5,
                    }}>
                      <span className="mono" style={{ color: "var(--ink-2)" }}>{b.dept}</span>
                      <span className="num" style={{ color: "var(--ink-3)", textAlign: "right" }}>{pct}%</span>
                      <span className="num" style={{ textAlign: "right", fontWeight: 500 }}>
                        {fmt.dollars(b.amount)}
                      </span>
                    </div>
                  );
                })}
                <div style={{
                  display: "grid", gridTemplateColumns: "80px 70px 1fr",
                  gap: 12, padding: "8px 12px",
                  background: "var(--paper-2)", borderTop: "2px solid var(--ink)",
                  fontSize: 12, fontWeight: 600,
                }}>
                  <span className="mono" style={{
                    color: "var(--ink-3)", textTransform: "uppercase",
                    letterSpacing: "0.06em", fontSize: 10,
                  }}>Total</span>
                  <span className="num" style={{ textAlign: "right" }}>100%</span>
                  <span className="num" style={{ textAlign: "right" }}>{fmt.dollars(totalToDirect)}</span>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <Formula>allocated $ = pool × driver_share</Formula>
              </div>
            </DrilldownColumn>
          </DrilldownShell>
        );
      }}
      footerNote={`${rows.length} pools · click a row to see basis, recoverability, and step-down`}
    />
  );
}
