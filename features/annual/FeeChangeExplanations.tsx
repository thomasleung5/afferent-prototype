import { useMemo } from "react";
import { DataTable, type Column } from "@/components/table";
import { DeptChip, SectionLabel } from "@/components/ui";
import { StatusRow } from "@/features/_shared/StatusRow";
import { deriveFeeChangeExplanations, type FeeChangeExplanation } from "@/lib/data/annual";
import { fmt } from "@/lib/format";
import { createBuildSnapshot, useBuildState } from "@/lib/store";

function signedDollars(value: number, compact = false): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  const body = compact ? fmt.dollarsK(Math.abs(value)) : fmt.dollars(Math.abs(value));
  return `${sign}${body}`;
}

function effectTone(value: number): string {
  if (value > 0.5) return "var(--neg)";
  if (value < -0.5) return "var(--pos)";
  return "var(--ink-3)";
}

const compareSelectStyle: React.CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  border: "1px solid var(--rule)",
  background: "var(--paper)",
  color: "var(--ink)",
  fontFamily: "inherit",
  fontSize: 12.5,
  padding: "5px 26px 5px 10px",
  minWidth: 240,
  // Caret rendered via background image so we don't introduce a new
  // icon for one control. Matches the styling pattern used by other
  // Afferent dropdowns.
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 6' fill='none'><path d='M1 1 L4 5 L7 1' stroke='%236f6e74' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 9px center",
  backgroundSize: "8px 6px",
};

function versionLabel(iso: string): string {
  const d = new Date(iso);
  const date = Number.isNaN(d.getTime())
    ? "Unknown date"
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return date;
}

export function FeeChangeExplanations() {
  const state = useBuildState();
  const selectedVersion = useMemo(
    () => state.versions.find((v) => v.id === state.comparisonVersionId) ?? state.versions[0],
    [state.versions, state.comparisonVersionId],
  );
  const currentSnapshot = useMemo(() => createBuildSnapshot(state), [state]);
  const rows = useMemo(
    () => deriveFeeChangeExplanations(currentSnapshot, selectedVersion)
      .filter((e) => Math.abs(e.unitDelta) >= 0.5),
    [currentSnapshot, selectedVersion],
  );

  const annualChange = rows.reduce((a, e) => a + e.annualDelta, 0);
  const increasingFees = rows.filter((e) => e.unitDelta > 0).length;

  const cols: Column<FeeChangeExplanation>[] = [
    {
      key: "name",
      label: "Fee",
      width: "minmax(240px, 1.8fr)",
      sortable: true,
      render: (r) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>{r.name}</span>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)", letterSpacing: "0.05em" }}>
            {r.primaryDriver}
          </span>
        </div>
      ),
    },
    {
      key: "dept",
      label: "Dept",
      width: "70px",
      sortable: true,
      render: (r) => <DeptChip code={r.dept}/>,
    },
    {
      key: "unitDelta",
      label: "Fee change",
      width: "115px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="num" style={{ color: effectTone(r.unitDelta), fontWeight: 600 }}>
          {signedDollars(r.unitDelta)}
        </span>
      ),
    },
    {
      key: "hoursEffect",
      label: "Hours",
      width: "90px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num" style={{ color: effectTone(r.hoursEffect) }}>{signedDollars(r.hoursEffect)}</span>,
    },
    {
      key: "directRateEffect",
      label: "Direct",
      width: "90px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num" style={{ color: effectTone(r.directRateEffect) }}>{signedDollars(r.directRateEffect)}</span>,
    },
    {
      key: "operatingRateEffect",
      label: "Operating",
      width: "95px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num" style={{ color: effectTone(r.operatingRateEffect) }}>{signedDollars(r.operatingRateEffect)}</span>,
    },
    {
      key: "capRateEffect",
      label: "CAP",
      width: "85px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num" style={{ color: effectTone(r.capRateEffect) }}>{signedDollars(r.capRateEffect)}</span>,
    },
    {
      key: "policyEffect",
      label: "Policy",
      width: "85px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num" style={{ color: effectTone(r.policyEffect) }}>{signedDollars(r.policyEffect)}</span>,
    },
    {
      key: "annualDelta",
      label: "Annual",
      width: "100px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="num" style={{ color: effectTone(r.annualDelta), fontWeight: 600 }}>
          {signedDollars(r.annualDelta, true)}
        </span>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StatusRow items={[
        { label: "Baseline", value: selectedVersion ? `v${selectedVersion.versionNumber}` : "None" },
        {
          label: "Explained movement",
          value: signedDollars(annualChange, true),
          tone: annualChange > 0 ? "neg" : annualChange < 0 ? "pos" : undefined,
        },
        { label: "Fees increasing", value: `${increasingFees}` },
      ]}/>

      <SectionLabel right={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
          <span>{rows.length} material change{rows.length === 1 ? "" : "s"}</span>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span className="mono" style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
              textTransform: "uppercase", color: "var(--ink-3)",
            }}>Compare to</span>
            <select
              value={selectedVersion?.id ?? ""}
              onChange={(e) => state.setComparisonVersion(e.target.value || null)}
              style={compareSelectStyle}
            >
              {state.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.versionNumber} · {v.label} · {versionLabel(v.createdAt)}
                </option>
              ))}
            </select>
          </label>
        </span>
      }>
        Fee increase explanations
      </SectionLabel>

      <DataTable
        cols={cols}
        rows={rows}
        defaultSort={{ key: "annualDelta", dir: "desc" }}
        minWidth={1050}
        emptyState={
          selectedVersion
            ? "No material fee movement against the selected baseline."
            : "Save a packet version to establish a comparison baseline."
        }
      />
    </div>
  );
}
