import type { Service } from "../types";

/* Source: NBS final draft Development Services Fee Study, March 30, 2026.
 * Tables 2, 4, 7; Appendices A.1–A.3. */

export const SERVICES: Service[] = [
  // ---------- Planning (FBHR $301) ----------
  { id: "plan-sdh",   name: "Site Development Hearing Review",                dept: "PLAN", volume: 19, hours: 51,   cost: 15369, fee: 4160,  peer: 13800, target: 100 },
  { id: "plan-fth",   name: "Site Development — Fast Track Hearing",          dept: "PLAN", volume: 17, hours: 61,   cost: 18383, fee: 4880,  peer: 16500, target: 100 },
  { id: "plan-minor", name: "Site Development — Minor Admin Review",          dept: "PLAN", volume: 8,  hours: 31,   cost: 9342,  fee: 1560,  peer: 8200,  target: 100 },
  { id: "plan-major", name: "Site Development — Major Admin Review",          dept: "PLAN", volume: 3,  hours: 36,   cost: 10849, fee: 3010,  peer: 9600,  target: 100 },
  { id: "plan-pch",   name: "Site Development — Planning Commission Hearing", dept: "PLAN", volume: 3,  hours: 71,   cost: 21396, fee: 7125,  peer: 19200, target: 100 },
  { id: "plan-cup",   name: "Conditional Use Permit — Additional/Hearing",    dept: "PLAN", volume: 2,  hours: 81,   cost: 24410, fee: 6000,  peer: 21500, target: 100 },
  { id: "plan-cup2",  name: "CUP Renewal / Amendment — Additional/Hearing",   dept: "PLAN", volume: 2,  hours: 81,   cost: 24410, fee: 6000,  peer: 21500, target: 100 },
  { id: "plan-cdp",   name: "Conditional Development Permit",                 dept: "PLAN", volume: 2,  hours: 19,   cost: 5726,  fee: 2180,  peer: 5100,  target: 100 },
  { id: "plan-fence", name: "Fence Permit — Administrative",                  dept: "PLAN", volume: 30, hours: 5,    cost: 1507,  fee: 520,   peer: 1350,  target: 100 },
  { id: "plan-oak",   name: "Oak Tree Removal",                               dept: "PLAN", volume: 32, hours: 3,    cost: 904,   fee: 250,   peer: 780,   target: 100 },
  { id: "plan-preap", name: "Pre-Application — Formal Meeting",               dept: "PLAN", volume: 46, hours: 2,    cost: 603,   fee: 520,   peer: 560,   target: 100 },
  { id: "plan-adu",   name: "Pre-Application — ADU Formal Meeting",           dept: "PLAN", volume: 21, hours: 2,    cost: 603,   fee: 410,   peer: 560,   target: 100 },
  { id: "plan-mod",   name: "Permit Modification",                            dept: "PLAN", volume: 4,  hours: 9,    cost: 2712,  fee: 1450,  peer: 2450,  target: 100 },
  { id: "plan-wlss",  name: "Wireless Facility Modification — Admin",         dept: "PLAN", volume: 3,  hours: 6,    cost: 1808,  fee: 2180,  peer: 1720,  target: 100 },
  { id: "plan-mvar",  name: "Minor Variance — Planning Commission",           dept: "PLAN", volume: 4,  hours: 19,   cost: 5726,  fee: 5200,  peer: 5250,  target: 100 },
  { id: "plan-site",  name: "Site Analysis — Minimum Processing",             dept: "PLAN", volume: 6,  hours: 2,    cost: 603,   fee: 260,   peer: 560,   target: 100 },

  // ---------- Building (FBHR $362) ----------
  { id: "bldg-apr",   name: "Additional Plan Review — Minimum Processing",    dept: "BLDG", volume: 144, hours: 1.5,  cost: 543,   fee: 350,   peer: 510,   target: 100 },
  { id: "bldg-ext",   name: "Extension of Building Permit",                   dept: "BLDG", volume: 59,  hours: 1,    cost: 362,   fee: 180,   peer: 340,   target: 100 },
  { id: "bldg-tco",   name: "Temporary Certificate of Occupancy",             dept: "BLDG", volume: 10,  hours: 1,    cost: 362,   fee: 500,   peer: 345,   target: 100 },
  { id: "bldg-pc",    name: "Plan Check Administrative Fee (new)",            dept: "BLDG", volume: 110, hours: 3,    cost: 1086,  fee: 280,   peer: 970,   target: 100 },
  { id: "bldg-sfr",   name: "Building Permit — New SFR (tiered, typ. $1.5M)", dept: "BLDG", volume: 28,  hours: 42,   cost: 15204, fee: 13500, peer: 13800, target: 100 },
  { id: "bldg-rem",   name: "Building Permit — Major Remodel",                dept: "BLDG", volume: 64,  hours: 15,   cost: 5430,  fee: 4100,  peer: 5100,  target: 100 },
  { id: "bldg-pool",  name: "Swimming Pool / Spa Permit (new)",               dept: "BLDG", volume: 18,  hours: 9,    cost: 3258,  fee: 1900,  peer: 3050,  target: 100 },
  { id: "bldg-solar", name: "Residential Solar / PV Permit",                  dept: "BLDG", volume: 62,  hours: 1,    cost: 362,   fee: 450,   peer: 400,   target: 80  }, // capped per CA Gov Code 66015
  { id: "bldg-mep",   name: "Stand-Alone MEP Permit",                         dept: "BLDG", volume: 82,  hours: 2,    cost: 724,   fee: 320,   peer: 680,   target: 100 },

  // ---------- Engineering (FBHR $359) ----------
  { id: "eng-bldg",    name: "Engineering Review of Building Permits",        dept: "ENG", volume: 127, hours: 4.25, cost: 1527,  fee: 0,     peer: 1400,  target: 100 },
  { id: "eng-adu",     name: "Engineering Review — ADU / SB9",                dept: "ENG", volume: 30,  hours: 4.25, cost: 1527,  fee: 0,     peer: 1400,  target: 100 },
  { id: "eng-erosion", name: "Erosion Control Inspections",                   dept: "ENG", volume: 157, hours: 2,    cost: 719,   fee: 210,   peer: 640,   target: 100 },
  { id: "eng-ency",    name: "Encroachment Permit — Application Fee",        dept: "ENG", volume: 169, hours: 2.5,  cost: 898,   fee: 326,   peer: 820,   target: 100 },
  { id: "eng-minor",   name: "Site Development — Minor Engineering Review",   dept: "ENG", volume: 50,  hours: 5,    cost: 1796,  fee: 0,     peer: 1620,  target: 100 },
  { id: "eng-major",   name: "Site Development — Major Engineering Review",   dept: "ENG", volume: 11,  hours: 10,   cost: 3593,  fee: 0,     peer: 3220,  target: 100 },
  { id: "eng-hourly",  name: "Engineering Blended Hourly Rate",               dept: "ENG", volume: 21,  hours: 1,    cost: 359,   fee: 228,   peer: 310,   target: 100 },
];
