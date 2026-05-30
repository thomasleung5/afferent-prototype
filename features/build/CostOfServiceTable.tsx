
import { useEffect, useMemo, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import {
  DataTable, deriveDeptFilter, applyFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import {
  DeptChip, InlineLinkRow, SectionLabel,
} from "@/components/ui";
import { fmt } from "@/lib/format";
import type { DeptCode } from "@/lib/types";
import type { ServiceCost } from "@/lib/calc";
import { useBuildState } from "@/lib/store";
import { FunctionalBucketSupport } from "./FunctionalBucketSupport";

interface Row extends ServiceCost {
  rate: number;
  annual: number;
}

export function CostOfServiceTable() {
  const { derived, services } = useBuildState();
  const [dept, setDept] = useState("ALL");
  const [openId, setOpenId] = useState<string | undefined>();

  // Service lookup so the Fee # column can pull feeNo (lives on
  // Service, not on the derived ServiceCost row).
  const svcById = useMemo(
    () => new Map(services.map((s) => [s.id, s])),
    [services],
  );

  const all: Row[] = useMemo(() => derived.costs.map((c) => ({
    ...c,
    rate: derived.fbhr[c.dept]?.fbhr ?? 0,
    annual: c.annualCost,
  })), [derived]);
  const rows = useMemo(() => applyFilter(all, "dept", dept), [all, dept]);

  // ?serviceId=... means we were cross-navigated here from another tab.
  // Drop any dept filter that would hide the row, open its drilldown,
  // scroll into view, and flash briefly so the user sees where they
  // landed. Same pattern as BenchmarkTable.
  const { serviceId, dept: searchDept } = useSearch({ from: "/build/costs" });
  useEffect(() => {
    if (!serviceId) return;
    if (!all.some((r) => r.id === serviceId)) return;
    setDept("ALL");
    setOpenId(serviceId);
    const handle = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(serviceId)}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("row-flash");
      window.setTimeout(() => el.classList.remove("row-flash"), 1700);
    }, 30);
    return () => window.clearTimeout(handle);
  }, [serviceId, all]);

  // ?dept=... cross-nav from Functional Allocation. Pre-filters the
  // table to the dept the user was viewing upstream. Only fires when
  // there's no serviceId (a row-targeted nav wins over a dept filter).
  useEffect(() => {
    if (serviceId || !searchDept) return;
    setDept(searchDept);
  }, [searchDept, serviceId]);

  const filters: FilterGroup[] = [{
    id: "dept", label: "Dept",
    options: deriveDeptFilter(all),
    value: dept, onChange: setDept,
  }];

  const cols: Column<Row>[] = [
    {
      key: "feeNo",
      label: "Fee #",
      width: "90px",
      sortable: true,
      sortKey: (r) => svcById.get(r.id)?.feeNo ?? "",
      render: (r) => {
        const feeNo = svcById.get(r.id)?.feeNo;
        return (
          <span className="num" style={{
            color: feeNo ? "var(--ink-2)" : "var(--ink-4)",
          }}>{feeNo ?? "—"}</span>
        );
      },
    },
    {
      key: "name",
      label: "Service",
      width: "minmax(260px, 2fr)",
      sortable: true,
      render: (r) => (
        <div>
          <div style={{ fontSize: "var(--t-l7)" }}>{r.name}</div>
          <div className="mono" style={{ fontSize: "var(--t-l4)", color: "var(--ink-4)", marginTop: 2 }}>{r.id}</div>
        </div>
      ),
    },
    {
      key: "dept",
      label: "Dept",
      width: "80px",
      sortable: true,
      render: (r) => <DeptChip code={r.dept}/>,
    },
    {
      key: "hours",
      label: "Hours",
      width: "70px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{r.hours}</span>,
    },
    {
      key: "rate",
      label: "FBHR",
      width: "100px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">${Math.round(r.rate)}</span>,
    },
    {
      key: "unitCost",
      label: "Total cost",
      width: "110px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{fmt.dollars(r.unitCost)}</span>,
    },
    {
      key: "volume",
      label: "Vol/yr",
      width: "80px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{r.volume}</span>,
    },
    {
      key: "annual",
      label: "Annual",
      width: "110px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="num">{fmt.dollarsK(r.annual)}</span>
      ),
    },
  ];

  return (
    <div>
      <SectionLabel right={`${all.length} services`}>
        Cost of service
      </SectionLabel>
      <DataTable
      cols={cols}
      rows={rows}
      filters={filters}
      defaultSort={{ key: "feeNo", dir: "asc" }}
      openId={openId}
      onRowClick={(r) => setOpenId(openId === r.id ? undefined : r.id)}
      drilldownIndicator
      renderDrilldown={(r) => (
        <div style={{
          padding: "16px 20px",
          background: "var(--paper-2)",
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          <div className="mono" style={{
            fontSize: "var(--t-l4)",
            color: "var(--ink-3)", textTransform: "uppercase",
            letterSpacing: "0.08em", fontWeight: 600,
          }}>
            Functional allocation support — {r.dept}
          </div>
          <FunctionalBucketSupport
            dept={r.dept as DeptCode}
            service={{ name: r.name, hours: r.hours }}
          />
          <InlineLinkRow
            style={{ marginTop: 0, paddingTop: 4 }}
            links={[
              { to: "/build/services",              search: { serviceId: r.id },
                text: "View service →" },
              { to: "/build/functional-allocation", search: { dept: r.dept as DeptCode },
                text: "View functional allocation →" },
              { to: "/build/feestudy",              search: { serviceId: r.id },
                text: "View fee schedule →" },
            ]}
          />
        </div>
      )}
      />
    </div>
  );
}
