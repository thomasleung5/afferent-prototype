import type { OperatingLine } from "../types";

/* Source: data-extended.jsx OPERATING_COSTS. FY 25 Budget line items.
 * `include: false` greys the row out of the rate calc but keeps it in audit.
 * `dept: "SHARED:CDS"` splits across PLAN / BLDG / ENG by productive hours. */

export const OPERATING: OperatingLine[] = [
  // Planning
  { id: "OP-PL-01", code: "011-2410", dept: "PLAN", category: "Software & subscriptions", line: "Planning permit system (share)",   amount: 18400, source: "seed", include: true },
  { id: "OP-PL-02", code: "011-2410", dept: "PLAN", category: "Professional services",    line: "On-call planning consultants",     amount: 42000, source: "seed", include: true },
  { id: "OP-PL-03", code: "011-2410", dept: "PLAN", category: "Training & travel",        line: "APA conference, CEUs",             amount:  6800, source: "seed", include: true },
  { id: "OP-PL-04", code: "011-2410", dept: "PLAN", category: "Office & supplies",        line: "Office supplies, printing, postage", amount: 4200, source: "seed", include: true },
  { id: "OP-PL-05", code: "011-2410", dept: "PLAN", category: "Memberships & dues",       line: "AICP, APA, ABAG dues",             amount:  3100, source: "seed", include: true },
  { id: "OP-PL-06", code: "011-2410", dept: "PLAN", category: "Legal noticing",           line: "Public hearing notices",           amount:  8500, source: "seed", include: false, excludeReason: "Reimbursed by applicant — not in $/hr" },

  // Building
  { id: "OP-BD-01", code: "011-2420", dept: "BLDG", category: "Software & subscriptions", line: "Permit system + ICC code books",   amount: 21600, source: "seed", include: true },
  { id: "OP-BD-02", code: "011-2420", dept: "BLDG", category: "Professional services",    line: "3rd-party plan check overflow",    amount: 78000, source: "seed", include: true },
  { id: "OP-BD-03", code: "011-2420", dept: "BLDG", category: "Vehicles & equipment",     line: "Inspector vehicle O&M",            amount: 14200, source: "seed", include: true },
  { id: "OP-BD-04", code: "011-2420", dept: "BLDG", category: "Training & travel",        line: "ICC certs, CALBO conference",      amount:  8400, source: "seed", include: true },
  { id: "OP-BD-05", code: "011-2420", dept: "BLDG", category: "Office & supplies",        line: "Inspection forms, field supplies", amount:  5300, source: "seed", include: true },
  { id: "OP-BD-06", code: "011-2420", dept: "BLDG", category: "Memberships & dues",       line: "ICC, CALBO memberships",           amount:  2400, source: "seed", include: true },

  // Engineering
  { id: "OP-EN-01", code: "011-3100", dept: "ENG",  category: "Software & subscriptions", line: "GIS, AutoCAD, Bluebeam",           amount: 16800, source: "seed", include: true },
  { id: "OP-EN-02", code: "011-3100", dept: "ENG",  category: "Professional services",    line: "On-call traffic + civil review",   amount: 54000, source: "seed", include: true },
  { id: "OP-EN-03", code: "011-3100", dept: "ENG",  category: "Vehicles & equipment",     line: "PW inspector vehicle, survey gear", amount: 11600, source: "seed", include: true },
  { id: "OP-EN-04", code: "011-3100", dept: "ENG",  category: "Training & travel",        line: "PE renewals, APWA",                amount:  4200, source: "seed", include: true },
  { id: "OP-EN-05", code: "011-3100", dept: "ENG",  category: "Office & supplies",        line: "Plotter, drafting supplies",       amount:  3100, source: "seed", include: true },
  { id: "OP-EN-06", code: "011-3100", dept: "ENG",  category: "Capital outlay",           line: "Vehicle replacement reserve",      amount: 18000, source: "seed", include: false, excludeReason: "One-time capital — excluded by policy" },

  // Shared CDS (split across PLAN/BLDG/ENG by productive hours)
  { id: "OP-SH-01", code: "011-2400", dept: "SHARED:CDS", category: "Software & subscriptions", line: "Citywide permit/agenda system", amount: 32400, source: "seed", include: true },
  { id: "OP-SH-02", code: "011-2400", dept: "SHARED:CDS", category: "Office & supplies",        line: "Front-counter & printing",     amount:  6800, source: "seed", include: true },
];
