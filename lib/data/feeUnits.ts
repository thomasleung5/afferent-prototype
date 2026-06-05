/* Standard catalog of fee-pricing units.
 *
 * `unitLabel` is the user-visible string rendered in tables, forms,
 * and reports. `unitType` is hidden categorical metadata used by
 * future analytics + grouping. Any free-form label entered by an
 * analyst (or carried in from a parser/seed row that doesn't match
 * the catalog) gets `unitType: "CUSTOM"` so the system can still
 * round-trip the value without losing data. */

import type { UnitType } from "../types";

export interface FeeUnitOption {
  label: string;
  type: UnitType;
}

/** Canonical 17-entry catalog, ordered for the dropdown. */
export const FEE_UNITS: readonly FeeUnitOption[] = [
  { label: "Each",                 type: "COUNT" },
  { label: "Project",              type: "PROJECT" },
  { label: "Application",          type: "COUNT" },
  { label: "Permit",               type: "COUNT" },
  { label: "Inspection",           type: "COUNT" },
  { label: "Plan Check",           type: "COUNT" },
  { label: "Plan Sheet",           type: "COUNT" },
  { label: "Meeting",              type: "COUNT" },
  { label: "Appeal",               type: "COUNT" },
  { label: "Hour",                 type: "TIME" },
  { label: "Sq Ft",                type: "AREA" },
  { label: "Linear Ft",            type: "LENGTH" },
  { label: "Acre",                 type: "LAND" },
  { label: "Parcel",               type: "LAND" },
  { label: "Lot",                  type: "LAND" },
  { label: "Per $1,000 Valuation", type: "VALUATION" },
  { label: "Deposit",              type: "DEPOSIT" },
];

/** Map a legacy free-text unit value (e.g. "each", "per meeting",
 *  "per $1,000 valuation") to the closest canonical option, falling
 *  back to a CUSTOM entry that preserves the original text verbatim.
 *  Used by storeMigration + AI import to upgrade pre-catalog data. */
export function mapLegacyUnit(raw: string | null | undefined): FeeUnitOption | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.toLowerCase().replace(/^per\s+/i, "").trim();
  const synonym = LEGACY_SYNONYMS[normalized];
  if (synonym) return synonym;
  // Try a direct case-insensitive label match against the catalog.
  const direct = FEE_UNITS.find((u) => u.label.toLowerCase() === trimmed.toLowerCase());
  if (direct) return direct;
  // Unmapped — preserve the original wording as a CUSTOM entry.
  return { label: trimmed, type: "CUSTOM" };
}

/** Legacy-string → canonical mapping. Lookup key is the value AFTER
 *  stripping a leading "per " prefix and lowercasing (so "per Meeting"
 *  and "meeting" both resolve). */
const LEGACY_SYNONYMS: Record<string, FeeUnitOption> = {
  "each":                  { label: "Each",                 type: "COUNT" },
  "project":               { label: "Project",              type: "PROJECT" },
  "application":           { label: "Application",          type: "COUNT" },
  "permit":                { label: "Permit",               type: "COUNT" },
  "inspection":            { label: "Inspection",           type: "COUNT" },
  "plan check":            { label: "Plan Check",           type: "COUNT" },
  "plan sheet":            { label: "Plan Sheet",           type: "COUNT" },
  "sheet":                 { label: "Plan Sheet",           type: "COUNT" },
  "meeting":               { label: "Meeting",              type: "COUNT" },
  "appeal":                { label: "Appeal",               type: "COUNT" },
  "hour":                  { label: "Hour",                 type: "TIME" },
  "hr":                    { label: "Hour",                 type: "TIME" },
  "sq ft":                 { label: "Sq Ft",                type: "AREA" },
  "sqft":                  { label: "Sq Ft",                type: "AREA" },
  "square foot":           { label: "Sq Ft",                type: "AREA" },
  "linear ft":             { label: "Linear Ft",            type: "LENGTH" },
  "lineal ft":             { label: "Linear Ft",            type: "LENGTH" },
  "linear foot":           { label: "Linear Ft",            type: "LENGTH" },
  "acre":                  { label: "Acre",                 type: "LAND" },
  "parcel":                { label: "Parcel",               type: "LAND" },
  "lot":                   { label: "Lot",                  type: "LAND" },
  "$1,000 valuation":      { label: "Per $1,000 Valuation", type: "VALUATION" },
  "$1000 valuation":       { label: "Per $1,000 Valuation", type: "VALUATION" },
  "1000 valuation":        { label: "Per $1,000 Valuation", type: "VALUATION" },
  "deposit":               { label: "Deposit",              type: "DEPOSIT" },
};
