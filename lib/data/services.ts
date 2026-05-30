import type { Service } from "../types";

/* Source: final draft Development Services Fee Study, March 30, 2026.
 * Tables 2, 4, 7; Appendices A.1–A.3.
 *
 * Each row carries fee-schedule metadata fields (feeNo,
 * category, subcategory, unit, plus rowKind + legalAuthority where the
 * row isn't a flat fee) on top of the numeric fee / volume / hours. */

export const SERVICES: Service[] = [
  // ---------- Planning (FBHR $301) — category: "Planning & Zoning" ----------
  { id: "plan-sdh",   feeNo: "PLN-1",  category: "Planning & Zoning", subcategory: "Discretionary Permits",   activity: "Application", unit: "each", name: "Site Development Hearing Review",                dept: "PLAN", volume: 19, hours: 51,   cost: 15369, fee: 4160,  peer: 13800, target: 100, source: "seed" },
  { id: "plan-fth",   feeNo: "PLN-2",  category: "Planning & Zoning", subcategory: "Discretionary Permits",   activity: "Application", unit: "each", name: "Site Development — Fast Track Hearing",          dept: "PLAN", volume: 17, hours: 61,   cost: 18383, fee: 4880,  peer: 16500, target: 100, source: "seed" },
  { id: "plan-minor", feeNo: "PLN-3",  category: "Planning & Zoning", subcategory: "Administrative Permits",  activity: "Application", unit: "each", name: "Site Development — Minor Admin Review",          dept: "PLAN", volume: 8,  hours: 31,   cost: 9342,  fee: 1560,  peer: 8200,  target: 100, source: "seed" },
  { id: "plan-major", feeNo: "PLN-4",  category: "Planning & Zoning", subcategory: "Administrative Permits",  activity: "Application", unit: "each", name: "Site Development — Major Admin Review",          dept: "PLAN", volume: 3,  hours: 36,   cost: 10849, fee: 3010,  peer: 9600,  target: 100, source: "seed" },
  { id: "plan-pch",   feeNo: "PLN-5",  category: "Planning & Zoning", subcategory: "Discretionary Permits",   activity: "Application", unit: "each", name: "Site Development — Planning Commission Hearing", dept: "PLAN", volume: 3,  hours: 71,   cost: 21396, fee: 7125,  peer: 19200, target: 100, source: "seed" },
  { id: "plan-cup",   feeNo: "PLN-6",  category: "Planning & Zoning", subcategory: "Discretionary Permits",   activity: "Application", unit: "each", name: "Conditional Use Permit — Additional/Hearing",    dept: "PLAN", volume: 2,  hours: 81,   cost: 24410, fee: 6000,  peer: 21500, target: 100, source: "seed" },
  { id: "plan-cup2",  feeNo: "PLN-7",  category: "Planning & Zoning", subcategory: "Discretionary Permits",   activity: "Application", unit: "each",        name: "CUP Renewal / Amendment — Additional/Hearing",   dept: "PLAN", volume: 2,  hours: 81,   cost: 24410, fee: 6000,  peer: 21500, target: 100, source: "seed" },
  { id: "plan-cdp",   feeNo: "PLN-8",  category: "Planning & Zoning", subcategory: "Discretionary Permits",   activity: "Application", unit: "each", name: "Conditional Development Permit",                 dept: "PLAN", volume: 2,  hours: 19,   cost: 5726,  fee: 2180,  peer: 5100,  target: 100, source: "seed" },
  { id: "plan-fence", feeNo: "PLN-9",  category: "Planning & Zoning", subcategory: "Administrative Permits",  activity: "Permit",      unit: "each", name: "Fence Permit — Administrative",                  dept: "PLAN", volume: 30, hours: 5,    cost: 1507,  fee: 520,   peer: 1350,  target: 100, source: "seed" },
  { id: "plan-oak",   feeNo: "PLN-10", category: "Planning & Zoning", subcategory: "Administrative Permits",  activity: "Permit",      unit: "each", name: "Oak Tree Removal",                               dept: "PLAN", volume: 32, hours: 3,    cost: 904,   fee: 250,   peer: 780,   target: 100, source: "seed" },
  { id: "plan-preap", feeNo: "PLN-11", category: "Planning & Zoning", subcategory: "Pre-Application Services", activity: "Meeting",    unit: "per meeting", name: "Pre-Application — Formal Meeting",       dept: "PLAN", volume: 46, hours: 2,    cost: 603,   fee: 520,   peer: 560,   target: 100, source: "seed" },
  { id: "plan-adu",   feeNo: "PLN-12", category: "Planning & Zoning", subcategory: "Pre-Application Services", activity: "Meeting",    unit: "per meeting", name: "Pre-Application — ADU Formal Meeting",   dept: "PLAN", volume: 21, hours: 2,    cost: 603,   fee: 410,   peer: 560,   target: 100, source: "seed" },
  { id: "plan-mod",   feeNo: "PLN-13", category: "Planning & Zoning", subcategory: "Administrative Permits",  activity: "Permit",      unit: "each", name: "Permit Modification",                            dept: "PLAN", volume: 4,  hours: 9,    cost: 2712,  fee: 1450,  peer: 2450,  target: 100, source: "seed" },
  { id: "plan-wlss",  feeNo: "PLN-14", category: "Planning & Zoning", subcategory: "Administrative Permits",  activity: "Permit",      unit: "each", name: "Wireless Facility Modification — Admin",         dept: "PLAN", volume: 3,  hours: 6,    cost: 1808,  fee: 2180,  peer: 1720,  target: 100, source: "seed" },
  { id: "plan-mvar",  feeNo: "PLN-15", category: "Planning & Zoning", subcategory: "Discretionary Permits",   activity: "Permit",      unit: "each", name: "Minor Variance — Planning Commission",           dept: "PLAN", volume: 4,  hours: 19,   cost: 5726,  fee: 5200,  peer: 5250,  target: 100, source: "seed" },
  { id: "plan-site",  feeNo: "PLN-16", category: "Planning & Zoning", subcategory: "Pre-Application Services", activity: "Application", unit: "each", name: "Site Analysis — Minimum Processing",             dept: "PLAN", volume: 6,  hours: 2,    cost: 603,   fee: 260,   peer: 560,   target: 100, source: "seed" },

  // ---------- Building (FBHR $362) — category: "Building & Safety" ----------
  { id: "bldg-apr",   feeNo: "BLD-1", category: "Building & Safety", subcategory: "Plan Check",     activity: "Plan check", unit: "each", name: "Additional Plan Review — Minimum Processing", dept: "BLDG", volume: 144, hours: 1.5,  cost: 543,   fee: 350,   peer: 510,   target: 100, source: "seed" },
  { id: "bldg-ext",   feeNo: "BLD-2", category: "Building & Safety", subcategory: "Administrative", activity: "Permit",     unit: "each", name: "Extension of Building Permit",                dept: "BLDG", volume: 59,  hours: 1,    cost: 362,   fee: 180,   peer: 340,   target: 100, source: "seed" },
  { id: "bldg-tco",   feeNo: "BLD-3", category: "Building & Safety", subcategory: "Administrative", activity: "Permit",     unit: "each", name: "Temporary Certificate of Occupancy",          dept: "BLDG", volume: 10,  hours: 1,    cost: 362,   fee: 500,   peer: 345,   target: 100, source: "seed" },
  { id: "bldg-pc",    feeNo: "BLD-4", category: "Building & Safety", subcategory: "Plan Check",     activity: "Plan check", unit: "each", name: "Plan Check Administrative Fee (new)",         dept: "BLDG", volume: 110, hours: 3,    cost: 1086,  fee: 280,   peer: 970,   target: 100, source: "seed" },
  // bldg-sfr: tiered formula by construction valuation — fee 13500 is the
  // typical $1.5M SFR worked example used as the audit anchor. The tier
  // schedule below reproduces it (see lib/types.ts FeeFormulaTier).
  {
    id: "bldg-sfr", feeNo: "BLD-5", category: "Building & Safety", subcategory: "New Construction",
    activity: "Permit", unit: "per $1,000 valuation", rowKind: "formula",
    formula: {
      kind: "tiered-valuation",
      basis: "construction valuation",
      tiers: [
        { upTo:   25000, baseFee:     0, perUnit: 12,    unitSize: 1000 },
        { upTo:  100000, baseFee:   300, perUnit: 10,    unitSize: 1000 },
        { upTo:  500000, baseFee:  1050, perUnit:  9,    unitSize: 1000 },
        { upTo: 1000000, baseFee:  4650, perUnit:  8,    unitSize: 1000 },
        { upTo: 3000000, baseFee:  8650, perUnit:  9.70, unitSize: 1000 },
        {                baseFee: 28050, perUnit:  8,    unitSize: 1000 },
      ],
    },
    currentFeeText: "Tiered (typ. $13,500 @ $1.5M valuation)",
    name: "Building Permit — New SFR (tiered, typ. $1.5M)",
    dept: "BLDG", volume: 28, hours: 42, cost: 15204, fee: 13500, peer: 13800, target: 100, source: "seed",
  },
  { id: "bldg-rem",   feeNo: "BLD-6", category: "Building & Safety", subcategory: "Remodel & Additions", activity: "Permit", unit: "each", name: "Building Permit — Major Remodel",  dept: "BLDG", volume: 64,  hours: 15,   cost: 5430,  fee: 4100,  peer: 5100,  target: 100, source: "seed" },
  { id: "bldg-pool",  feeNo: "BLD-7", category: "Building & Safety", subcategory: "Specialty Permits",   activity: "Permit", unit: "each", name: "Swimming Pool / Spa Permit (new)", dept: "BLDG", volume: 18,  hours: 9,    cost: 3258,  fee: 1900,  peer: 3050,  target: 100, source: "seed" },
  // bldg-solar: statutory cap per CA Gov Code §66015. The fee can't go
  // above the statutory ceiling regardless of full-cost recovery target.
  {
    id: "bldg-solar", feeNo: "BLD-8", category: "Building & Safety", subcategory: "Specialty Permits",
    activity: "Permit", unit: "each", rowKind: "statutory",
    legalAuthority: "CA Gov Code §66015",
    notes: ["Capped at $450 by state law; full-cost recovery not achievable for this row."],
    name: "Residential Solar / PV Permit",
    dept: "BLDG", volume: 62, hours: 1, cost: 362, fee: 450, peer: 400, target: 80, source: "seed",
  },
  { id: "bldg-mep",   feeNo: "BLD-9", category: "Building & Safety", subcategory: "Specialty Permits",   activity: "Permit", unit: "each", name: "Stand-Alone MEP Permit", dept: "BLDG", volume: 82,  hours: 2,    cost: 724,   fee: 320,   peer: 680,   target: 100, source: "seed" },

  // ---------- Engineering (FBHR $359) — category: "Engineering" ----------
  { id: "eng-bldg",    feeNo: "ENG-1", category: "Engineering", subcategory: "Plan Review",     activity: "Review",     unit: "per project",    name: "Engineering Review of Building Permits",      dept: "ENG", volume: 127, hours: 4.25, cost: 1527,  fee: 0,     peer: 1400,  target: 100, source: "seed" },
  { id: "eng-adu",     feeNo: "ENG-2", category: "Engineering", subcategory: "Plan Review",     activity: "Review",     unit: "per project",    name: "Engineering Review — ADU / SB9",              dept: "ENG", volume: 30,  hours: 4.25, cost: 1527,  fee: 0,     peer: 1400,  target: 100, source: "seed" },
  { id: "eng-erosion", feeNo: "ENG-3", category: "Engineering", subcategory: "Inspections",     activity: "Inspection", unit: "per inspection", name: "Erosion Control Inspections",                 dept: "ENG", volume: 157, hours: 2,    cost: 719,   fee: 210,   peer: 640,   target: 100, source: "seed" },
  { id: "eng-ency",    feeNo: "ENG-4", category: "Engineering", subcategory: "Permits",         activity: "Permit",     unit: "per permit",     name: "Encroachment Permit — Application Fee",       dept: "ENG", volume: 169, hours: 2.5,  cost: 898,   fee: 326,   peer: 820,   target: 100, source: "seed" },
  { id: "eng-minor",   feeNo: "ENG-5", category: "Engineering", subcategory: "Plan Review",     activity: "Review",     unit: "per project",    name: "Site Development — Minor Engineering Review", dept: "ENG", volume: 50,  hours: 5,    cost: 1796,  fee: 0,     peer: 1620,  target: 100, source: "seed" },
  { id: "eng-major",   feeNo: "ENG-6", category: "Engineering", subcategory: "Plan Review",     activity: "Review",     unit: "per project",    name: "Site Development — Major Engineering Review", dept: "ENG", volume: 11,  hours: 10,   cost: 3593,  fee: 0,     peer: 3220,  target: 100, source: "seed" },
  { id: "eng-hourly",  feeNo: "ENG-7", category: "Engineering", subcategory: "Other Services", activity: "Review",     unit: "per hour",       name: "Engineering Blended Hourly Rate",             dept: "ENG", volume: 21,  hours: 1,    cost: 359,   fee: 228,   peer: 310,   target: 100, source: "seed" },
];
