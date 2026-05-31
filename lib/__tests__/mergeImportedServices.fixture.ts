/* mergeImportedServices fixture.
 *
 * Run with: npm run test:merge-imported-services
 *
 * Pins the Service ↔ Volume synchronization contract that the import
 * pipeline relies on. Both the Service Catalog and Fee Schedule paths
 * now go through this helper, so a regression here means analyst-visible
 * data goes missing from the Volume page after an import.
 *
 * Load-bearing assertions:
 *
 *   - A Fee Schedule import that creates a new Service also creates a
 *     paired VolumeRow (no positive volume → flagged placeholder).
 *   - A Fee Schedule import that updates an existing Service does NOT
 *     touch its VolumeRow.
 *   - A Service Catalog import with a positive volume puts that value
 *     onto VolumeRow.current.
 *   - Pre-existing VolumeRows are never overwritten by the helper. */

import assert from "node:assert/strict";
import { mergeImportedServices } from "../import/mergeImportedServices";
import type {
  ExtractionResult, ExtractedRow, SourceLineage,
} from "../parse/types";
import type { Service, VolumeRow } from "../types";

function lineage(file: string, row: number): SourceLineage {
  return {
    file,
    sheet: "AI parsed",
    row,
    rawCells: {},
    confidence: "high",
    importedAt: "2026-05-31T00:00:00.000Z",
  };
}

function emptyResult<T>(): ExtractionResult<T> {
  return {
    mapped: [],
    lowConfidence: [],
    unmapped: [],
    duplicates: [],
    stats: { total: 0, mapped: 0, lowConfidence: 0, unmapped: 0, duplicates: 0 },
  };
}

function svc(overrides: Partial<Service> = {}): Service {
  return {
    id: "svc-test",
    name: "Test service",
    dept: "PLAN",
    volume: 0,
    hours: 0,
    cost: 0,
    fee: 0,
    peer: 0,
    target: 100,
    source: "imported",
    sourceFile: "import.pdf",
    ...overrides,
  };
}

function row<T>(entity: T, l: SourceLineage): ExtractedRow<T> {
  return { entity, lineage: l };
}

// ── 1. Fee Schedule import creates/updates a Service ────────────────────
//      Mirror feesToExtractionResult's emission shape: new services land
//      in `mapped` with a freshly minted id; matching services land in
//      `duplicates` with the existing id.
{
  const existing = svc({ id: "svc-existing", name: "Already here", fee: 100 });
  const update = svc({ id: "svc-existing", name: "Already here", fee: 250 });
  const fresh = svc({ id: "svc-new", name: "Brand new", fee: 75, volume: 0 });

  const result: ExtractionResult<Service> = {
    ...emptyResult<Service>(),
    mapped: [row(fresh, lineage("fees.pdf", 1))],
    duplicates: [row(update, lineage("fees.pdf", 2))],
    stats: { total: 2, mapped: 1, lowConfidence: 0, unmapped: 0, duplicates: 1 },
  };

  const out = mergeImportedServices([existing], [], result);

  const byId = new Map(out.services.map((s) => [s.id, s]));
  assert.equal(byId.get("svc-existing")?.fee, 250,
    "duplicate row overlays existing service (fee bumped 100 → 250)");
  assert.equal(byId.get("svc-new")?.fee, 75,
    "new mapped row inserted as a fresh service");
  assert.equal(out.services.length, 2);
  console.log("  ✓ Fee Schedule import creates and updates Services");
}

// ── 2. New Service from Fee Schedule appears in Volume ──────────────────
//      Zero-volume new Service ⇒ placeholder VolumeRow flagged
//      `missing-current-volume`, status `Imported`. The whole point of
//      this refactor: the row must show up on the Volume page.
{
  const fresh = svc({ id: "svc-fs-new", name: "Fresh fee", volume: 0,
    source: "imported", sourceFile: "fees.pdf" });
  const result: ExtractionResult<Service> = {
    ...emptyResult<Service>(),
    mapped: [row(fresh, lineage("fees.pdf", 1))],
    stats: { total: 1, mapped: 1, lowConfidence: 0, unmapped: 0, duplicates: 0 },
  };

  const out = mergeImportedServices([], [], result);

  assert.equal(out.volume.length, 1, "exactly one volume row created");
  const vr = out.volume[0];
  assert.equal(vr.id, "svc-fs-new");
  assert.equal(vr.current, null, "zero-volume service → current null");
  assert.equal(vr.prior, null);
  assert.equal(vr.status, "Imported");
  assert.equal(vr.source, "imported");
  assert.equal(vr.sourceFile, "fees.pdf");
  assert.equal(vr.flag, "missing-current-volume",
    "zero-volume service → placeholder flag set");
  console.log("  ✓ Fee Schedule new Service produces a paired Volume row");
}

// ── 3. Existing Volume rows preserved ───────────────────────────────────
//      The helper must NEVER overwrite a VolumeRow that already exists
//      for an id it's touching — dedicated Volume imports own that path.
{
  const existingSvc = svc({ id: "svc-keep", name: "Keep my volume" });
  const existingVol: VolumeRow = {
    id: "svc-keep", prior: 100, current: 120, source: "manual",
    status: "Validated",
  };
  // The extractor classifies this as a duplicate (existing id) with an
  // updated fee — must not blow away the validated VolumeRow.
  const result: ExtractionResult<Service> = {
    ...emptyResult<Service>(),
    duplicates: [row(svc({ id: "svc-keep", fee: 500 }), lineage("fees.pdf", 1))],
    stats: { total: 1, mapped: 0, lowConfidence: 0, unmapped: 0, duplicates: 1 },
  };

  const out = mergeImportedServices([existingSvc], [existingVol], result);

  assert.equal(out.volume.length, 1, "no extra volume rows added");
  assert.deepEqual(out.volume[0], existingVol,
    "existing volume row passed through untouched");
  console.log("  ✓ Existing Volume rows are preserved on duplicate imports");
}

// ── 4. Service Catalog import with positive volume populates current ───
//      parseServices can carry `volume` through to the Service entity.
//      When it's > 0, the new VolumeRow.current must reflect that value
//      (no placeholder flag).
{
  const fresh = svc({ id: "svc-cat-new", name: "Catalog row",
    volume: 42, source: "imported", sourceFile: "catalog.pdf" });
  const result: ExtractionResult<Service> = {
    ...emptyResult<Service>(),
    mapped: [row(fresh, lineage("catalog.pdf", 1))],
    stats: { total: 1, mapped: 1, lowConfidence: 0, unmapped: 0, duplicates: 0 },
  };

  const out = mergeImportedServices([], [], result);

  assert.equal(out.volume.length, 1);
  const vr = out.volume[0];
  assert.equal(vr.id, "svc-cat-new");
  assert.equal(vr.current, 42, "positive Service.volume → VolumeRow.current");
  assert.equal(vr.prior, null);
  assert.equal(vr.status, "Imported");
  assert.equal(vr.source, "imported");
  assert.equal(vr.sourceFile, "catalog.pdf");
  assert.equal(vr.flag, undefined,
    "positive volume → NO missing-current-volume flag");
  console.log("  ✓ Service Catalog positive volume populates VolumeRow.current");
}

// ── 5. lineagePatch covers every touched service ────────────────────────
//      Sanity check: every id that was merged (mapped, lowConfidence,
//      duplicates) gets a lineage entry the caller will spread into
//      state.lineage.
{
  const fresh = svc({ id: "svc-lin-new", name: "fresh" });
  const update = svc({ id: "svc-lin-old", name: "old", fee: 999 });
  const existing = svc({ id: "svc-lin-old", name: "old", fee: 1 });
  const result: ExtractionResult<Service> = {
    ...emptyResult<Service>(),
    mapped: [row(fresh, lineage("a.pdf", 1))],
    duplicates: [row(update, lineage("a.pdf", 2))],
    stats: { total: 2, mapped: 1, lowConfidence: 0, unmapped: 0, duplicates: 1 },
  };

  const out = mergeImportedServices([existing], [], result);

  assert.ok(out.lineagePatch["svc-lin-new"], "new id has lineage");
  assert.ok(out.lineagePatch["svc-lin-old"], "updated id has lineage");
  console.log("  ✓ lineagePatch populated for both new and updated services");
}

console.log("\nAll mergeImportedServices assertions passed.");
