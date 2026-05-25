// Seed Annual Update import activity. Populates the Refresh + Review
// Changes + Update Packet pages so they have something to render before
// the user uploads any real source files.
//
// IDs are stable (not Date.now()) so reloading the app doesn't shift
// React keys around. Timestamps cluster in late April 2026 to mirror a
// realistic FY 2026–27 refresh cycle.

import type { BuildImportLog } from "../store";

export const IMPORTS: BuildImportLog[] = [
  {
    id: 1745416800001,
    domain: "operating",
    at: "2026-04-18T15:20:00Z",
    result: {
      domain: "operating",
      fileName: "FY26-27 Adopted Operating Budget.xlsx",
      detected: "Adopted budget · 14 funds · 7 departments",
      rows: 842,
      mapped: 811,
      lowConfidence: 28,
      unmapped: 3,
      duplicates: 0,
      warnings: [],
    },
  },
  {
    id: 1745416800002,
    domain: "positions",
    at: "2026-04-18T16:05:00Z",
    result: {
      domain: "positions",
      fileName: "FY26-27 Salary & Benefits Roster.xlsx",
      detected: "HRIS export · 73 funded positions",
      rows: 73,
      mapped: 67,
      lowConfidence: 5,
      unmapped: 1,
      duplicates: 0,
      warnings: ["3 rows missing fringe rate — fell back to dept default"],
    },
  },
  {
    id: 1745503200003,
    domain: "volume",
    at: "2026-04-19T15:30:00Z",
    result: {
      domain: "volume",
      fileName: "FY26-27 Volume of Activity.csv",
      detected: "Permit system export · 12-month rolling",
      rows: 1246,
      mapped: 1229,
      lowConfidence: 14,
      unmapped: 3,
      duplicates: 0,
      warnings: [],
    },
  },
  {
    id: 1745676000004,
    domain: "cap",
    at: "2026-04-21T15:00:00Z",
    result: {
      domain: "cap",
      fileName: "FY26-27 Cost Allocation Plan.pdf",
      detected: "CAP study · 14 indirect centers · 22 cost pools",
      rows: 14,
      mapped: 12,
      lowConfidence: 2,
      unmapped: 0,
      duplicates: 0,
      warnings: ["City Attorney pool flagged for legal review"],
    },
  },
  {
    id: 1745848800005,
    domain: "fees",
    at: "2026-04-23T15:00:00Z",
    result: {
      domain: "fees",
      fileName: "Current Fee Schedule (adopted 2025-07-01).pdf",
      detected: "216 fee items · Council resolution 2025-26",
      rows: 216,
      mapped: 214,
      lowConfidence: 1,
      unmapped: 1,
      duplicates: 0,
      warnings: [],
    },
  },
  {
    id: 1745935200006,
    domain: "services",
    at: "2026-04-24T15:00:00Z",
    result: {
      domain: "services",
      fileName: "Services Catalog Refresh.json",
      detected: "Manual catalog refresh · 78 services",
      rows: 78,
      mapped: 76,
      lowConfidence: 2,
      unmapped: 0,
      duplicates: 0,
      warnings: [],
    },
  },
];
