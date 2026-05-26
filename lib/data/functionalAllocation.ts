/* Seed Functional Allocation buckets for PLAN / BLDG / ENG.
 *
 * Recoverability assumptions follow NBS-style starter ranges and are
 * intended to be edited by the analyst on the Functional Allocation
 * page. Direct hours are not seeded here — they're populated from the
 * dept's productive-hours total when the store hydrates, then split
 * across buckets by the analyst.
 *
 * This module is loaded by PR-FA2 (store slice) and is not referenced
 * elsewhere yet. Existing FBHR math is unaffected. */

import type { FunctionalAllocationBucket } from "@/lib/types";

export const FUNCTIONAL_ALLOCATION_SEED: FunctionalAllocationBucket[] = [
  // ---------- Planning ----------
  {
    id: "fa-plan-current",
    dept: "PLAN",
    name: "Current Planning — Direct Services",
    description:
      "Discretionary review, entitlement processing, environmental review, " +
      "hearing support, applicant coordination on active project files.",
    recoverabilityPct: 100,
    directHours: 0,
    source: "seed",
  },
  {
    id: "fa-plan-counter",
    dept: "PLAN",
    name: "Public Counter / General Assistance",
    description:
      "Walk-in inquiries, general zoning questions, pre-application " +
      "advice not tied to a billable applicant of record.",
    recoverabilityPct: 50,
    directHours: 0,
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
    directHours: 0,
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
    directHours: 0,
    source: "seed",
  },

  // ---------- Building ----------
  {
    id: "fa-bldg-plancheck",
    dept: "BLDG",
    name: "Plan Check",
    description:
      "Building code review of construction documents, structural " +
      "review, energy and accessibility review.",
    recoverabilityPct: 100,
    directHours: 0,
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
    directHours: 0,
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
    directHours: 0,
    source: "seed",
  },
  {
    id: "fa-bldg-counter",
    dept: "BLDG",
    name: "General Counter",
    description:
      "Walk-in code questions, owner-builder guidance, and general " +
      "permit information not tied to a billable applicant of record.",
    recoverabilityPct: 50,
    directHours: 0,
    source: "seed",
  },

  // ---------- Engineering ----------
  {
    id: "fa-eng-landdev",
    dept: "ENG",
    name: "Land Development Review",
    description:
      "Engineering review of grading, drainage, frontage improvements, " +
      "and subdivision improvement plans on private development.",
    recoverabilityPct: 100,
    directHours: 0,
    source: "seed",
  },
  {
    id: "fa-eng-cip",
    dept: "ENG",
    name: "CIP / Capital Projects",
    description:
      "Design and delivery of City capital projects. Funded through CIP " +
      "appropriations, not through user fees.",
    recoverabilityPct: 0,
    directHours: 0,
    source: "seed",
  },
  {
    id: "fa-eng-ency",
    dept: "ENG",
    name: "Encroachment Permitting",
    description:
      "Review and inspection of work in the public right-of-way.",
    recoverabilityPct: 100,
    directHours: 0,
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
    directHours: 0,
    source: "seed",
  },
];
