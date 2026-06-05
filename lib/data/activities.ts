/* Canonical catalog of fee-service activities.
 *
 * Activity describes WHAT KIND OF WORK was performed when the service
 * is delivered (Application, Permit, Inspection, …) — distinct from
 * the pricing unit (Each, Hour, Sq Ft, …) which describes HOW the
 * fee is charged. The Volume table reads `Service.activityLabel` to
 * render its Activity column; reports use it for grouping.
 *
 * `activityLabel` is the user-visible string. `activityType` is hidden
 * categorical metadata reserved for future analytics + reporting
 * (e.g., "which depts spend most time on REVIEW vs ISSUANCE"). */

import type { ActivityType } from "../types";

export interface ActivityOption {
  label: string;
  type: ActivityType;
}

/** Canonical catalog, ordered for the dropdown. */
export const ACTIVITIES: readonly ActivityOption[] = [
  { label: "Application",   type: "INTAKE" },
  { label: "Permit",        type: "ISSUANCE" },
  { label: "Plan Check",    type: "REVIEW" },
  { label: "Inspection",    type: "INSPECTION" },
  { label: "Review",        type: "REVIEW" },
  { label: "Audit",         type: "REVIEW" },
  { label: "Meeting",       type: "MEETING" },
  { label: "Consultation",  type: "MEETING" },
  { label: "Appeal",        type: "ADJUDICATION" },
];

/** Map a legacy free-text activity value to the closest canonical
 *  option (case-insensitive match against the catalog + a small
 *  synonym table), falling back to a CUSTOM entry that preserves the
 *  original text verbatim. Used by storeMigration + AI import. */
export function mapLegacyActivity(raw: string | null | undefined): ActivityOption | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const key = trimmed.toLowerCase();
  const synonym = LEGACY_SYNONYMS[key];
  if (synonym) return synonym;
  const direct = ACTIVITIES.find((a) => a.label.toLowerCase() === key);
  if (direct) return direct;
  return { label: trimmed, type: "CUSTOM" };
}

const LEGACY_SYNONYMS: Record<string, ActivityOption> = {
  "application":   { label: "Application",  type: "INTAKE" },
  "intake":        { label: "Application",  type: "INTAKE" },
  "submittal":     { label: "Application",  type: "INTAKE" },
  "permit":        { label: "Permit",       type: "ISSUANCE" },
  "issuance":      { label: "Permit",       type: "ISSUANCE" },
  "certificate":   { label: "Permit",       type: "ISSUANCE" },
  "plan check":    { label: "Plan Check",   type: "REVIEW" },
  "plan review":   { label: "Plan Check",   type: "REVIEW" },
  "plancheck":     { label: "Plan Check",   type: "REVIEW" },
  "inspection":    { label: "Inspection",   type: "INSPECTION" },
  "review":        { label: "Review",       type: "REVIEW" },
  "audit":         { label: "Audit",        type: "REVIEW" },
  "meeting":       { label: "Meeting",      type: "MEETING" },
  "consultation":  { label: "Consultation", type: "MEETING" },
  "consult":       { label: "Consultation", type: "MEETING" },
  "appeal":        { label: "Appeal",       type: "ADJUDICATION" },
  "hearing":       { label: "Appeal",       type: "ADJUDICATION" },
};
