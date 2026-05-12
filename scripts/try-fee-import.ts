/* Trial run of the fee-schedule pipeline against the sample CSV in
 * public/. Reports the same data the UI would render in MappingReview
 * and ImportDebug. */

import { readFileSync } from "node:fs";
import { SERVICES } from "../lib/data/services";
import { runImportPipeline } from "../lib/import/pipeline";

const csv = readFileSync("public/sample-fee-schedule.csv", "utf8");
const file = new File([csv], "Adopted Fee Schedule FY26-27.csv", { type: "text/csv" });

(async () => {
  const batch = await runImportPipeline(file, { services: SERVICES });

  const c = batch.classification;
  console.log(`\n— Classification —`);
  console.log(`  documentType: ${c.documentType}  (${(c.confidence * 100).toFixed(0)}%)`);
  console.log(`  fiscalYear:   ${c.fiscalYear ?? "—"}`);
  console.log(`  sections:     ${c.detectedSections.slice(0, 3).join(" · ")}${c.detectedSections.length > 3 ? "…" : ""}`);
  console.log(`  reason:       ${c.reason}`);

  console.log(`\n— Extracted rows —`);
  const all = [...batch.extracted.unsectioned, ...batch.extracted.sections.flatMap((s) => s.rows)];
  const byType: Record<string, number> = {};
  for (const r of all) byType[r.rowType ?? "?"] = (byType[r.rowType ?? "?"] ?? 0) + 1;
  console.log(`  ${all.length} rows · ` + Object.entries(byType).map(([k, v]) => `${k}:${v}`).join("  ·  "));

  console.log(`\n— Mapping candidates —`);
  const groups: Record<string, number> = { auto_accepted: 0, needs_review: 0, unresolved: 0 };
  for (const m of batch.mappings) groups[m.status] = (groups[m.status] ?? 0) + 1;
  console.log(`  auto-accepted: ${groups.auto_accepted}  needs review: ${groups.needs_review}  unresolved: ${groups.unresolved}`);
  console.log();
  for (const m of batch.mappings) {
    const pad = (s: string, w: number) => (s + " ".repeat(w)).slice(0, w);
    const target = m.proposedTargetTable ?? "—";
    const conf = `${(m.confidence * 100).toFixed(0)}%`.padStart(4);
    const stat = pad(m.status, 14);
    console.log(`  ${stat}  ${conf}  →${pad(target, 12)}  ${pad(m.sourceLabel, 42)}  ${m.mappingReason}`);
  }

  console.log(`\n— Validation —  ${batch.status} (${batch.issues.length} issues)`);
  for (const i of batch.issues.slice(0, 8)) {
    console.log(`  [${i.severity}] ${i.code}: ${i.message}`);
  }
  if (batch.issues.length > 8) console.log(`  + ${batch.issues.length - 8} more`);

  console.log(`\nTo try this in the browser: drag public/sample-fee-schedule.csv onto /build/feestudy`);
})();
