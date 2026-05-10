import type { AuditEntry } from "../types";

export const ACTIVITY: AuditEntry[] = [
  { date: "Apr 28, 2026", text: "Workload export ingested · 1,246 records · 17 missing volumes flagged", src: "Workload" },
  { date: "Apr 26, 2026", text: "Salary refresh imported from Finance · 73 positions · 6 review",         src: "Salary" },
  { date: "Apr 18, 2026", text: "FY 2025-26 baseline model locked · v1.0",                                src: "Build" },
  { date: "Mar 30, 2026", text: "Development Services Fee Study — final draft uploaded",                 src: "Fee Study" },
  { date: "Sep 04, 2025", text: "Cost Allocation Plan ingested · 14 cost pools · ~$3.7M",                 src: "CAP" },
];
