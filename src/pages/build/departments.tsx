import { Page, PageHeader } from "@/components/layout";
import { DataTable, type Column } from "@/components/table";
import {
  DeptChip, NodeEyebrow, SectionLabel,
} from "@/components/ui";
import { DEPTS, FEE_DEPTS, deptName } from "@/lib/data/departments";
import { useBuildState } from "@/lib/store";
import type { DeptCode } from "@/lib/types";

interface Row {
  id: string;
  code: DeptCode;
  name: string;
  active: boolean;
  services: number;
  laborRoles: number;
  operatingLines: number;
  functionalBuckets: number;
}

export default function DepartmentsPage() {
  const {
    activeFeeDepts, services, productiveHours, operating,
    functionalAllocation, setActiveFeeDepts,
  } = useBuildState();
  const activeSet = new Set(activeFeeDepts);

  const rows: Row[] = FEE_DEPTS.map((code) => ({
    id: code,
    code,
    name: deptName(code),
    active: activeSet.has(code),
    services: services.filter((r) => r.dept === code).length,
    laborRoles: productiveHours.filter((r) => r.dept === code).length,
    operatingLines: operating.filter((r) => r.dept === code).length,
    functionalBuckets: functionalAllocation.filter((r) => r.dept === code).length,
  }));

  const activeCount = activeFeeDepts.length;
  const toggle = (code: DeptCode, checked: boolean) => {
    const next = checked
      ? [...activeFeeDepts, code]
      : activeFeeDepts.filter((d) => d !== code);
    setActiveFeeDepts(next);
  };

  const cols: Column<Row>[] = [
    {
      key: "active",
      label: "",
      width: "56px",
      align: "center",
      render: (r) => {
        const isLastActive = r.active && activeCount <= 1;
        return (
          <input
            type="checkbox"
            checked={r.active}
            disabled={isLastActive}
            aria-label={`${r.active ? "Disable" : "Enable"} ${r.name}`}
            title={isLastActive
              ? "At least one fee department must stay active."
              : r.active ? "Disable fee department" : "Enable fee department"}
            onChange={(e) => toggle(r.code, e.currentTarget.checked)}
            style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
          />
        );
      },
    },
    {
      key: "name",
      label: "Department",
      width: "minmax(240px, 1.8fr)",
      sortable: true,
      sortKey: (r) => DEPTS[r.code].name,
      render: (r) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <DeptChip code={r.code}/>
          <span style={{ fontWeight: 500 }}>{r.name}</span>
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      width: "120px",
      sortable: true,
      sortKey: (r) => r.active ? 1 : 0,
      render: (r) => (
        <span className="mono" style={{
          fontSize: "var(--t-l4)",
          letterSpacing: "0.08em",
          color: r.active ? "var(--accent)" : "var(--ink-3)",
          textTransform: "uppercase",
        }}>
          {r.active ? "Active" : "Available"}
        </span>
      ),
    },
    {
      key: "services",
      label: "Services",
      width: "100px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{r.services}</span>,
    },
    {
      key: "laborRoles",
      label: "Roles",
      width: "90px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{r.laborRoles}</span>,
    },
    {
      key: "operatingLines",
      label: "Costs",
      width: "90px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{r.operatingLines}</span>,
    },
    {
      key: "functionalBuckets",
      label: "Functions",
      width: "100px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{r.functionalBuckets}</span>,
    },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="departments"/>}
        title="Departments"
        subtitle="Fee departments active in this study."
      />

      <div style={{ marginTop: 4 }}>
        <SectionLabel right={`${activeCount} active · ${FEE_DEPTS.length} available`}>
          Fee departments
        </SectionLabel>
        <div style={{ marginTop: 10 }}>
          <DataTable
            cols={cols}
            rows={rows}
            emptyState="No departments are available."
          />
        </div>
      </div>
    </Page>
  );
}
