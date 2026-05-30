import type { Position } from "../types";

/* Source: data-extended.jsx POSITIONS. FY 26-27 Salary Table.
 * Salary + benefits are annual; hours are productive hrs/yr per FTE. */

export const POSITIONS: Position[] = [
  { id: "pos-pdir",   title: "Planning Director",            dept: "PLAN", fte: 0.35, salary: 312000, benefits: 110000, hours: 1720, source: "seed" },
  { id: "pos-srpln",  title: "Senior Planner",               dept: "PLAN", fte: 1.00, salary: 214000, benefits:  78000, hours: 1720, source: "seed" },
  { id: "pos-aspln",  title: "Associate Planner",            dept: "PLAN", fte: 1.00, salary: 178000, benefits:  64000, hours: 1720, source: "seed" },
  { id: "pos-pltch",  title: "Planning Technician",          dept: "PLAN", fte: 0.50, salary:  98000, benefits:  35000, hours: 1720, source: "seed" },
  { id: "pos-bofcl",  title: "Building Official",            dept: "BLDG", fte: 0.75, salary: 286000, benefits: 102000, hours: 1720, source: "seed" },
  { id: "pos-plnex",  title: "Plans Examiner",               dept: "BLDG", fte: 1.00, salary: 238000, benefits:  85000, hours: 1720, source: "seed" },
  { id: "pos-binsp",  title: "Building Inspector",           dept: "BLDG", fte: 1.00, salary: 198000, benefits:  72000, hours: 1720, source: "seed" },
  { id: "pos-pmttc",  title: "Permit Technician",            dept: "BLDG", fte: 1.00, salary: 132000, benefits:  48000, hours: 1720, source: "seed" },
  { id: "pos-ceng",   title: "City Engineer",                dept: "ENG",  fte: 0.30, salary: 298000, benefits: 106000, hours: 1720, source: "seed" },
  { id: "pos-sreng",  title: "Senior / Associate Engineer",  dept: "ENG",  fte: 1.00, salary: 204000, benefits:  73000, hours: 1720, source: "seed" },
  { id: "pos-pwins",  title: "Public Works Inspector",       dept: "ENG",  fte: 0.60, salary: 168000, benefits:  60000, hours: 1720, source: "seed" },
];
