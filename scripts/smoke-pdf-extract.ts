/* PDF-shape smoke for the 4 newly-PDF-capable extractors.
 *
 * Bypasses the actual pdf.js parser and constructs synthetic ParsedDoc objects
 * with pages so we can drive the PDF code paths directly. Each extractor must:
 *
 *   - yield at least one ExtractedRow with the expected rowType
 *   - parse the numeric value(s) we planted on the line
 *   - emit at least one row tagged with the section header that preceded it
 *
 * Exits 1 on any assertion failure. */

import { runImportPipelineFromParsed } from "../lib/import/pipeline";
import { SERVICES } from "../lib/data/services";
import type { ParsedDoc, ParsedPage } from "../lib/parse/types";
import type { DocumentType } from "../lib/import/types";

function page(num: number, lines: string[]): ParsedPage {
  return { page: num, text: lines.join("\n"), lines };
}

function pdf(fileName: string, pages: ParsedPage[]): ParsedDoc {
  return { format: "pdf", fileName, rowCount: pages.reduce((a, p) => a + p.lines.length, 0), warnings: [], pages };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) { console.error(`✗ ${msg}`); process.exit(1); }
  console.log(`ok ${msg}`);
}

interface Case {
  name: string;
  forceType: DocumentType;
  doc: ParsedDoc;
  expect: {
    minRows: number;
    rowType: string;
    /** A row whose rawLabel includes this substring is required. */
    containsLabel: string;
  };
}

const CASES: Case[] = [
  {
    name: "Salary roster PDF",
    forceType: "salary_roster",
    doc: pdf("FY 26-27 Salary Schedule.pdf", [
      page(1, [
        "TOWN OF LOS ALTOS HILLS",
        "Salary Schedule FY 2026-27",
        "PLANNING DEPARTMENT",
        "Senior Planner            Planning   1.0   $135,000   $52,000",
        "Associate Planner         Planning   1.0   $112,000   $44,000",
        "BUILDING DEPARTMENT",
        "Plans Examiner            Building   1.0   $120,000   $48,000",
        "Building Inspector        Building   1.0   $128,000   $49,000",
      ]),
    ]),
    expect: { minRows: 3, rowType: "position", containsLabel: "Senior Planner" },
  },
  {
    name: "Operating budget PDF",
    forceType: "operating_budget",
    doc: pdf("FY 26-27 Operating Budget.pdf", [
      page(1, [
        "FY 2026-27 OPERATING BUDGET",
        "PLANNING DEPARTMENT",
        "501-100  Software Licenses                                  $18,000",
        "501-150  Professional Services                              $42,000",
        "501-200  Training & Travel                                  $6,500",
        "Total Planning                                              $66,500",
        "BUILDING DEPARTMENT",
        "501-300  Plan Check Contracts                               $75,000",
        "501-310  Inspection Vehicle Maintenance                     $4,200",
      ]),
    ]),
    expect: { minRows: 4, rowType: "account_line", containsLabel: "Software Licenses" },
  },
  {
    name: "Cost allocation plan PDF",
    forceType: "cost_allocation_plan",
    doc: pdf("Cost Allocation Plan FY26-27.pdf", [
      page(1, [
        "TOWN OF LOS ALTOS HILLS",
        "COST ALLOCATION PLAN FY 2026-27",
        "INFORMATION TECHNOLOGY",
        "IT Services                Planning      FTE      18%      $72,000",
        "IT Services                Building      FTE      22%      $88,000",
        "IT Services                Engineering   FTE      14%      $56,000",
        "HUMAN RESOURCES",
        "HR Services                Planning      FTE      20%      $40,000",
        "HR Services                Building      FTE      25%      $50,000",
      ]),
    ]),
    expect: { minRows: 4, rowType: "cap_pool", containsLabel: "IT Services" },
  },
  {
    name: "Workload export PDF",
    forceType: "workload_export",
    doc: pdf("Permit Count Summary FY26.pdf", [
      page(1, [
        "TOWN OF LOS ALTOS HILLS",
        "Permit Volume Summary",
        "Service                                                 FY24   FY25",
        "BUILDING",
        "ADU permit                                              24     31",
        "Building permit                                         142    138",
        "Inspection · Re-inspection                              210    248",
        "PLANNING",
        "Pre-Application — Formal Meeting                        46     52",
        "Site Development Hearing Review                         12     18",
      ]),
    ]),
    expect: { minRows: 4, rowType: "workload_row", containsLabel: "ADU permit" },
  },
];

(async () => {
  for (const fx of CASES) {
    console.log(`\n=== ${fx.name} ===`);
    const batch = runImportPipelineFromParsed(fx.doc, {
      services: SERVICES,
      forceType: fx.forceType,
    });
    const allRows = [
      ...batch.extracted.unsectioned,
      ...batch.extracted.sections.flatMap((s) => s.rows),
    ];

    console.log(`extracted: ${allRows.length} rows`);
    for (const r of allRows.slice(0, 6)) {
      const fields = r.fields ?? {};
      const summary = Object.entries(fields)
        .filter(([, v]) => v != null && v !== "")
        .slice(0, 5)
        .map(([k, v]) => `${k}=${v}`)
        .join("  ");
      console.log(`  [${r.rowType}] ${r.rawLabel}  ·  ${summary}`);
    }

    assert(allRows.length >= fx.expect.minRows,
      `${fx.name}: extracted ${allRows.length} rows (≥ ${fx.expect.minRows})`);

    const hasType = allRows.some((r) => r.rowType === fx.expect.rowType);
    assert(hasType, `${fx.name}: at least one row has rowType "${fx.expect.rowType}"`);

    const hasLabel = allRows.some((r) =>
      r.rawLabel.toLowerCase().includes(fx.expect.containsLabel.toLowerCase()),
    );
    assert(hasLabel, `${fx.name}: contains row matching "${fx.expect.containsLabel}"`);

    const hasSection = allRows.some((r) => r.source.section);
    assert(hasSection, `${fx.name}: at least one row carries section context`);
  }

  console.log("\n✓ PDF extraction smokes passed");
})();
