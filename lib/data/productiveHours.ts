import type { ProductiveHoursRow } from "../types";

/* Seed productive-hours roster. Cost lives separately in OPERATING labor rows;
 * this slice is the FBHR denominator and role-allocation roster. */

export const PRODUCTIVE_HOURS: ProductiveHoursRow[] = [
  {
    id: "pos-pdir",
    title: "Planning Director",
    dept: "PLAN",
    fte: 0.35,
    hours: 1720,
    source: "seed"
  },
  {
    id: "pos-srpln",
    title: "Senior Planner",
    dept: "PLAN",
    fte: 1,
    hours: 1720,
    source: "seed"
  },
  {
    id: "pos-aspln",
    title: "Associate Planner",
    dept: "PLAN",
    fte: 1,
    hours: 1720,
    source: "seed"
  },
  {
    id: "pos-pltch",
    title: "Planning Technician",
    dept: "PLAN",
    fte: 0.5,
    hours: 1720,
    source: "seed"
  },
  {
    id: "pos-bofcl",
    title: "Building Official",
    dept: "BLDG",
    fte: 0.75,
    hours: 1720,
    source: "seed"
  },
  {
    id: "pos-plnex",
    title: "Plans Examiner",
    dept: "BLDG",
    fte: 1,
    hours: 1720,
    source: "seed"
  },
  {
    id: "pos-binsp",
    title: "Building Inspector",
    dept: "BLDG",
    fte: 1,
    hours: 1720,
    source: "seed"
  },
  {
    id: "pos-pmttc",
    title: "Permit Technician",
    dept: "BLDG",
    fte: 1,
    hours: 1720,
    source: "seed"
  },
  {
    id: "pos-ceng",
    title: "City Engineer",
    dept: "ENG",
    fte: 0.3,
    hours: 1720,
    source: "seed"
  },
  {
    id: "pos-sreng",
    title: "Senior / Associate Engineer",
    dept: "ENG",
    fte: 1,
    hours: 1720,
    source: "seed"
  },
  {
    id: "pos-pwins",
    title: "Public Works Inspector",
    dept: "ENG",
    fte: 0.6,
    hours: 1720,
    source: "seed"
  }
];
