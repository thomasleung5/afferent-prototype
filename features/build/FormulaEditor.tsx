import React from "react";
import {
  AddRowButton, CellInput, CellSelect, MiniTable, RemoveIconButton,
  type MiniTableColumn,
} from "@/components/ui";
import type { FeeFormula, FeeFormulaTier } from "@/lib/types";

/** Structured editor for the Service.formula union. Extracted in PR-M2 so
 *  both Fee Schedule and (potentially) any future page that edits fee
 *  structure can use the same component. PR-L6 introduced the editor
 *  inside ServicesTable; PR-M2 moves the canonical edit surface to the
 *  Fee Schedule page since fee structure is a policy concern, not a
 *  catalog concern. */

const FORMULA_KIND_OPTIONS = [
  { value: "none",              label: "(none — flat row)" },
  { value: "tiered-valuation",  label: "Tiered valuation" },
  { value: "percentage",        label: "Percentage" },
  { value: "per-unit",          label: "Per unit" },
  { value: "expression",        label: "Expression (freeform)" },
];

/** Default-shape helper — produces a sane starting formula for each kind
 *  when the user switches via the picker. Keeps the existing formula's
 *  basis/text where the field still applies, so a re-pick doesn't blow
 *  away the analyst's previous typing. */
function defaultFormulaFor(
  kind: FeeFormula["kind"],
  prev: FeeFormula | undefined,
): FeeFormula {
  const prevBasis = prev && "basis" in prev ? prev.basis : "";
  if (kind === "tiered-valuation") {
    return {
      kind: "tiered-valuation",
      basis: prevBasis || "construction valuation",
      tiers: prev?.kind === "tiered-valuation" && prev.tiers.length > 0
        ? prev.tiers
        : [{ baseFee: 0, perUnit: 0, unitSize: 1000 }],
    };
  }
  if (kind === "percentage") {
    return {
      kind: "percentage",
      basis: prevBasis || "construction valuation",
      rate: prev?.kind === "percentage" ? prev.rate : 1,
      ...(prev?.kind === "percentage" && prev.minFee != null ? { minFee: prev.minFee } : {}),
      ...(prev?.kind === "percentage" && prev.maxFee != null ? { maxFee: prev.maxFee } : {}),
    };
  }
  if (kind === "per-unit") {
    return {
      kind: "per-unit",
      unit: prev?.kind === "per-unit" ? prev.unit : "linear foot",
      rate: prev?.kind === "per-unit" ? prev.rate : 0,
      ...(prev?.kind === "per-unit" && prev.minFee != null ? { minFee: prev.minFee } : {}),
    };
  }
  return {
    kind: "expression",
    text: prev?.kind === "expression" ? prev.text : "",
  };
}

/** Editor for the Service.formula union. Renders a kind picker + the
 *  kind-specific fields below it. Switching kinds re-shapes the value
 *  via defaultFormulaFor, preserving whatever sub-fields still apply.
 *  Choosing "(none — flat row)" clears the formula back to undefined. */
export function FormulaEditor({
  value, onChange,
}: {
  value: FeeFormula | undefined;
  onChange: (next: FeeFormula | undefined) => void;
}) {
  const kind = value?.kind ?? "none";
  const handleKindChange = (next: string) => {
    if (next === "none") { onChange(undefined); return; }
    onChange(defaultFormulaFor(next as FeeFormula["kind"], value));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <CellSelect
        value={kind}
        options={FORMULA_KIND_OPTIONS}
        onChange={handleKindChange}
      />
      {value?.kind === "tiered-valuation" && (
        <TieredValuationFields
          value={value}
          onChange={(next) => onChange(next)}
        />
      )}
      {value?.kind === "percentage" && (
        <PercentageFields value={value} onChange={(next) => onChange(next)}/>
      )}
      {value?.kind === "per-unit" && (
        <PerUnitFields value={value} onChange={(next) => onChange(next)}/>
      )}
      {value?.kind === "expression" && (
        <ExpressionFields value={value} onChange={(next) => onChange(next)}/>
      )}
    </div>
  );
}

function TieredValuationFields({
  value, onChange,
}: {
  value: Extract<FeeFormula, { kind: "tiered-valuation" }>;
  onChange: (next: FeeFormula) => void;
}) {
  const patchTier = (i: number, patch: Partial<FeeFormulaTier>) => {
    const next = value.tiers.map((t, idx) => idx === i ? { ...t, ...patch } : t);
    onChange({ ...value, tiers: next });
  };
  const removeTier = (i: number) =>
    onChange({ ...value, tiers: value.tiers.filter((_, idx) => idx !== i) });
  const addTier = () =>
    onChange({ ...value, tiers: [...value.tiers, { baseFee: 0, perUnit: 0, unitSize: 1000 }] });
  const tierCols: MiniTableColumn[] = [
    { key: "upTo",     label: "Up to",    width: "1fr" },
    { key: "baseFee",  label: "Base fee", width: "1fr" },
    { key: "perUnit",  label: "+ per",    width: "1fr" },
    { key: "unitSize", label: "per",      width: "70px" },
    { key: "remove",   label: "",         width: "22px" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <FormulaSubField label="Basis">
        <CellInput
          value={value.basis}
          onChange={(v) => onChange({ ...value, basis: String(v) })}
          placeholder="e.g. construction valuation"
        />
      </FormulaSubField>
      <MiniTable
        columns={tierCols}
        rows={value.tiers}
        rowKey={(_, i) => `tier-${i}`}
        outerBackground="var(--paper-2)"
        density="compact"
        renderCell={(col, t, i) => {
          if (col.key === "upTo") {
            return (
              <CellInput
                type="integer"
                value={t.upTo ?? ""}
                onChange={(v) => patchTier(i, { upTo: v === "" ? undefined : Number(v) })}
                placeholder="(no cap)"
                fontSize={12}
              />
            );
          }
          if (col.key === "baseFee") {
            return (
              <CellInput
                type="currency"
                value={t.baseFee}
                onChange={(v) => patchTier(i, { baseFee: Number(v) || 0 })}
                prefix="$"
                fontSize={12}
              />
            );
          }
          if (col.key === "perUnit") {
            return (
              <CellInput
                type="number"
                value={t.perUnit ?? 0}
                onChange={(v) => patchTier(i, { perUnit: Number(v) || 0 })}
                step={0.1} min={0}
                fontSize={12}
              />
            );
          }
          if (col.key === "unitSize") {
            return (
              <CellInput
                type="integer"
                value={t.unitSize ?? 1000}
                onChange={(v) => patchTier(i, { unitSize: Number(v) || 1 })}
                fontSize={12}
              />
            );
          }
          if (col.key === "remove") {
            return (
              <RemoveIconButton
                title="Remove tier"
                onClick={(e) => { e.stopPropagation(); removeTier(i); }}
              />
            );
          }
          return null;
        }}
        footerSlot={(
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              padding: "10px 16px",
              borderTop: "1px solid var(--rule-strong)",
              background: "var(--paper-2)",
            }}
          >
            <AddRowButton label="Add tier" onClick={addTier}/>
          </div>
        )}
      />
    </div>
  );
}

function PercentageFields({
  value, onChange,
}: {
  value: Extract<FeeFormula, { kind: "percentage" }>;
  onChange: (next: FeeFormula) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <FormulaSubField label="Basis">
        <CellInput
          value={value.basis}
          onChange={(v) => onChange({ ...value, basis: String(v) })}
          placeholder="e.g. construction valuation"
        />
      </FormulaSubField>
      <FormulaSubField label="Rate (%)">
        <CellInput
          type="number"
          value={value.rate}
          onChange={(v) => onChange({ ...value, rate: Number(v) || 0 })}
          step={0.1} min={0} suffix="%"
          fontSize={12}
        />
      </FormulaSubField>
      <FormulaSubField label="Min fee">
        <CellInput
          type="currency"
          value={value.minFee ?? ""}
          onChange={(v) => onChange({ ...value, minFee: v === "" ? undefined : Number(v) })}
          prefix="$" placeholder="(none)"
          fontSize={12}
        />
      </FormulaSubField>
      <FormulaSubField label="Max fee">
        <CellInput
          type="currency"
          value={value.maxFee ?? ""}
          onChange={(v) => onChange({ ...value, maxFee: v === "" ? undefined : Number(v) })}
          prefix="$" placeholder="(none)"
          fontSize={12}
        />
      </FormulaSubField>
    </div>
  );
}

function PerUnitFields({
  value, onChange,
}: {
  value: Extract<FeeFormula, { kind: "per-unit" }>;
  onChange: (next: FeeFormula) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <FormulaSubField label="Unit">
        <CellInput
          value={value.unit}
          onChange={(v) => onChange({ ...value, unit: String(v) })}
          placeholder="e.g. linear foot"
        />
      </FormulaSubField>
      <FormulaSubField label="Rate">
        <CellInput
          type="currency"
          value={value.rate}
          onChange={(v) => onChange({ ...value, rate: Number(v) || 0 })}
          prefix="$"
          fontSize={12}
        />
      </FormulaSubField>
      <FormulaSubField label="Min fee">
        <CellInput
          type="currency"
          value={value.minFee ?? ""}
          onChange={(v) => onChange({ ...value, minFee: v === "" ? undefined : Number(v) })}
          prefix="$" placeholder="(none)"
          fontSize={12}
        />
      </FormulaSubField>
    </div>
  );
}

function ExpressionFields({
  value, onChange,
}: {
  value: Extract<FeeFormula, { kind: "expression" }>;
  onChange: (next: FeeFormula) => void;
}) {
  return (
    <textarea
      value={value.text}
      onChange={(e) => onChange({ ...value, text: e.target.value })}
      onClick={(e) => e.stopPropagation()}
      placeholder="e.g. greater of $500 or 0.5% of valuation"
      rows={2}
      style={{
        width: "100%", resize: "vertical",
        padding: "4px 6px", fontSize: 12, lineHeight: 1.4,
        fontFamily: "inherit", color: "var(--ink)",
        background: "var(--paper-2)", border: "1px solid var(--rule)",
        outline: "none",
      }}
    />
  );
}

/** Tiny label+value row used inside FormulaEditor's kind-specific blocks.
 *  Narrower label column than the outer panel's Field so the editor
 *  reads as a sub-form, not a peer of the outer fields. */
function FormulaSubField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 8, alignItems: "baseline" }}>
      <span className="mono" style={{
        fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.1em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>{label}</span>
      <div>{children}</div>
    </div>
  );
}

