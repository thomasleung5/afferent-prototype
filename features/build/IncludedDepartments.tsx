
import { useEffect, useRef, useState } from "react";
import { DataTable, type Column } from "@/components/table";
import { DeptChip, SectionLabel } from "@/components/ui";
import { DEPTS, FEE_DEPTS, deptName } from "@/lib/data/departments";
import { useBuildState } from "@/lib/store";
import type { DeptCode } from "@/lib/types";

interface Row {
  id: string;
  code: DeptCode;
  name: string;
  services: number;
}

/** Departments-as-a-section on the Services page. Lightweight
 *  configuration control — the table shows ONLY active departments;
 *  the "+ Add department" button (DataTable's standard add-row affordance)
 *  opens a small picker of the remaining available codes. Mirrors the
 *  Labor / Operating / Functional Allocation per-dept summary tables
 *  in label, padding, border, and add-row treatment. */
export function IncludedDepartments() {
  const { activeFeeDepts, services, setActiveFeeDepts } = useBuildState();
  const activeSet = new Set(activeFeeDepts);

  const activeCount = activeFeeDepts.length;
  const remaining = FEE_DEPTS.filter((d) => !activeSet.has(d));

  // Render order: keep activeFeeDepts in its stored order (so the table
  // doesn't reshuffle every time the user toggles a row).
  const rows: Row[] = activeFeeDepts.map((code) => ({
    id: code,
    code,
    name: deptName(code),
    services: services.filter((r) => r.dept === code).length,
  }));

  const toggleOff = (code: DeptCode) => {
    setActiveFeeDepts(activeFeeDepts.filter((d) => d !== code));
  };
  const activate = (code: DeptCode) => {
    if (activeSet.has(code)) return;
    setActiveFeeDepts([...activeFeeDepts, code]);
  };

  const cols: Column<Row>[] = [
    {
      key: "active",
      label: "",
      width: "40px",
      align: "center",
      render: (r) => {
        // Refuse to disable the last active dept — every downstream
        // page assumes the study models at least one fee department.
        const isLastActive = activeCount <= 1;
        return (
          <input
            type="checkbox"
            checked
            disabled={isLastActive}
            aria-label={`Remove ${r.name}`}
            title={isLastActive
              ? "At least one department must stay active."
              : "Remove department"}
            onChange={() => toggleOff(r.code)}
            style={{ width: 14, height: 14, accentColor: "var(--accent)" }}
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
          <span style={{ color: "var(--ink)" }}>{r.name}</span>
        </span>
      ),
    },
    {
      key: "services",
      label: "Services",
      width: "110px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{r.services}</span>,
    },
  ];

  // Selector popover state — anchored under the AddRowButton that
  // DataTable renders for `onAdd`. Wraps DataTable in a relative
  // container so the popover can absolute-position over the footer.
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Close the picker once everything is active.
  useEffect(() => {
    if (remaining.length === 0) setOpen(false);
  }, [remaining.length]);

  return (
    <div>
      <SectionLabel right={`${activeCount} ${activeCount === 1 ? "department" : "departments"}`}>
        Included departments
      </SectionLabel>
      <div ref={wrapRef} style={{ position: "relative" }}>
        <DataTable
          cols={cols}
          rows={rows}
          onAdd={remaining.length > 0 ? () => setOpen((o) => !o) : undefined}
          addLabel="Add department"
          emptyState="No departments are active."
        />
        {open && remaining.length > 0 && (
          <div
            role="menu"
            style={{
              position: "absolute",
              left: 16, bottom: 44,
              zIndex: 20,
              width: 320,
              background: "var(--paper)",
              border: "1px solid var(--rule-strong)",
              boxShadow: "0 10px 24px rgba(29,34,54,0.10)",
            }}
          >
            <div
              className="mono"
              style={{
                padding: "8px 14px 6px",
                borderBottom: "1px solid var(--rule)",
                background: "var(--paper-2)",
                fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.12em",
                color: "var(--ink-3)", textTransform: "uppercase",
              }}
            >Add department</div>
            <div style={{ maxHeight: 240, overflowY: "auto" }}>
              {remaining.map((code, i) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => { activate(code); setOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    width: "100%", textAlign: "left",
                    padding: "8px 14px",
                    background: "transparent",
                    border: "none",
                    borderTop: i === 0 ? "none" : "1px solid var(--rule)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "var(--fs-ui)",
                    color: "var(--ink)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--paper-2)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <DeptChip code={code}/>
                  <span>{deptName(code)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
