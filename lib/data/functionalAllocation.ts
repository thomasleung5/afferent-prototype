/* Seed Functional Allocation buckets for PLAN / BLDG / ENG.
 *
 * Two analyst inputs per bucket:
 *   - hoursSharePct: share of the dept's productive hours assigned to
 *     this bucket. Σ across a dept's buckets should sum to 100%.
 *   - recoverabilityPct: fee-recoverable portion of the bucket's
 *     activity. Follows NBS-style starter ranges.
 *
 * Direct hours are derived per-render (deptProductiveHours ×
 * hoursSharePct / 100) so the splits stay reconciled to the
 * authoritative productive-hours roster without persisted duplication.
 *
 * Loaded by PR-FA2 (store slice). Existing FBHR math is unaffected. */

import type { FunctionalAllocationBucket } from "@/lib/types";

export const FUNCTIONAL_ALLOCATION_SEED: FunctionalAllocationBucket[] = [
  // ---------- Planning (Σ shares = 100%) ----------
  {
    id: "fa-plan-current",
    dept: "PLAN",
    name: "Current Planning",
    description:
      "Discretionary review, entitlement processing, environmental review, " +
      "hearing support, applicant coordination on active project files.",
    recoverabilityPct: 100,
    hoursSharePct: 50,
    rateBasisHours: true,
    source: "seed",
  },
  {
    id: "fa-plan-counter",
    dept: "PLAN",
    name: "Public Counter",
    description:
      "Walk-in inquiries, general zoning questions, pre-application " +
      "advice not tied to a billable applicant of record.",
    recoverabilityPct: 50,
    hoursSharePct: 20,
    rateBasisHours: true,
    source: "seed",
  },
  {
    id: "fa-plan-longrange",
    dept: "PLAN",
    name: "Long Range Planning",
    description:
      "General Plan maintenance, zoning ordinance updates, housing " +
      "element work — public-benefit activity not appropriately " +
      "recovered through user fees.",
    recoverabilityPct: 0,
    hoursSharePct: 20,
    rateBasisHours: false,
    source: "seed",
  },
  {
    id: "fa-plan-code",
    dept: "PLAN",
    name: "Code Enforcement",
    description:
      "Investigation and resolution of zoning code violations. Partially " +
      "recoverable where statute permits cost recovery from the responsible " +
      "party; the unrecoverable share covers public-protection activity.",
    recoverabilityPct: 35,
    hoursSharePct: 10,
    rateBasisHours: true,
    source: "seed",
  },

  // ---------- Building (Σ shares = 100%) ----------
  {
    id: "fa-bldg-plancheck",
    dept: "BLDG",
    name: "Plan Check",
    description:
      "Building code review of construction documents, structural " +
      "review, energy and accessibility review.",
    recoverabilityPct: 100,
    hoursSharePct: 30,
    rateBasisHours: true,
    source: "seed",
  },
  {
    id: "fa-bldg-permit",
    dept: "BLDG",
    name: "Permit Issuance",
    description:
      "Permit intake, fee calculation, issuance, and permit-record " +
      "administration.",
    recoverabilityPct: 100,
    hoursSharePct: 15,
    rateBasisHours: true,
    source: "seed",
  },
  {
    id: "fa-bldg-inspect",
    dept: "BLDG",
    name: "Inspections",
    description:
      "Field inspections through project completion, including " +
      "scheduling and inspection-record administration.",
    recoverabilityPct: 100,
    hoursSharePct: 40,
    rateBasisHours: true,
    source: "seed",
  },
  {
    id: "fa-bldg-counter",
    dept: "BLDG",
    name: "Public Counter",
    description:
      "Walk-in code questions, owner-builder guidance, and general " +
      "permit information not tied to a billable applicant of record.",
    recoverabilityPct: 50,
    hoursSharePct: 15,
    rateBasisHours: true,
    source: "seed",
  },

  // ---------- Engineering (Σ shares = 100%) ----------
  {
    id: "fa-eng-landdev",
    dept: "ENG",
    name: "Land Development Review",
    description:
      "Engineering review of grading, drainage, frontage improvements, " +
      "and subdivision improvement plans on private development.",
    recoverabilityPct: 100,
    hoursSharePct: 40,
    rateBasisHours: true,
    source: "seed",
  },
  {
    id: "fa-eng-cip",
    dept: "ENG",
    name: "CIP / Infrastructure",
    description:
      "Design and delivery of City capital projects. Funded through CIP " +
      "appropriations, not through user fees.",
    recoverabilityPct: 0,
    hoursSharePct: 25,
    rateBasisHours: false,
    source: "seed",
  },
  {
    id: "fa-eng-ency",
    dept: "ENG",
    name: "Encroachment Permits",
    description:
      "Review and inspection of work in the public right-of-way.",
    recoverabilityPct: 100,
    hoursSharePct: 20,
    rateBasisHours: true,
    source: "seed",
  },
  {
    id: "fa-eng-traffic",
    dept: "ENG",
    name: "Traffic Review",
    description:
      "Traffic impact analysis, signal warrant studies, and traffic " +
      "control review on private projects. Mixed-funded: the share " +
      "tied to private project review is recovered through fees; the " +
      "share supporting citywide traffic planning is not.",
    recoverabilityPct: 50,
    hoursSharePct: 15,
    rateBasisHours: true,
    source: "seed",
  },
];
