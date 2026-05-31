/* Shared service-import merge.
 *
 * Service identity lives in `state.services`; the Volume page reads from
 * `state.volume`, keyed by the same `id`. Both Service Catalog imports
 * (parseServices) and Fee Schedule imports (parseFees) produce
 * `ExtractionResult<Service>` — so the moment a service-import path
 * mints a brand-new Service id, the matching VolumeRow has to come
 * into existence at the same time or the row goes missing from Volume.
 *
 * This helper is the only place that does that synchronization.
 * Dedicated Volume imports (mergeVolume) remain the only path that
 * overwrites existing Volume rows; we never clobber a VolumeRow that
 * already exists for an id we're touching here.
 */

import type { Service, VolumeRow } from "@/lib/types";
import type { ExtractionResult, SourceLineage } from "@/lib/parse/types";

export interface MergeImportedServicesResult {
  services: Service[];
  volume: VolumeRow[];
  lineagePatch: Record<string, SourceLineage>;
}

export function mergeImportedServices(
  existingServices: Service[],
  existingVolume: VolumeRow[],
  result: ExtractionResult<Service>,
): MergeImportedServicesResult {
  const lineagePatch: Record<string, SourceLineage> = {};
  const existingServiceIds = new Set(existingServices.map((s) => s.id));
  const volumeIds = new Set(existingVolume.map((v) => v.id));
  const serviceById = new Map(existingServices.map((s) => [s.id, s]));
  const newVolume: VolumeRow[] = [];

  for (const { entity, lineage } of result.duplicates) {
    serviceById.set(entity.id, { ...serviceById.get(entity.id)!, ...entity });
    lineagePatch[entity.id] = lineage;
  }

  for (const { entity, lineage } of [...result.mapped, ...result.lowConfidence]) {
    if (serviceById.has(entity.id)) {
      serviceById.set(entity.id, { ...serviceById.get(entity.id)!, ...entity });
    } else {
      serviceById.set(entity.id, entity);
    }
    lineagePatch[entity.id] = lineage;

    // Only NEW services need a paired VolumeRow. Existing services keep
    // whatever Volume row the analyst already has — dedicated Volume
    // imports are the only path that touches an existing VolumeRow.
    if (existingServiceIds.has(entity.id)) continue;
    if (volumeIds.has(entity.id)) continue;

    volumeIds.add(entity.id);
    newVolume.push(buildVolumeRowForService(entity, lineage));
  }

  return {
    services: [...serviceById.values()],
    volume: newVolume.length ? [...existingVolume, ...newVolume] : existingVolume,
    lineagePatch,
  };
}

function buildVolumeRowForService(svc: Service, lineage: SourceLineage): VolumeRow {
  const hasPositiveVolume = typeof svc.volume === "number" && svc.volume > 0;
  const sourceFile = svc.sourceFile ?? lineage.file;
  const base: VolumeRow = {
    id: svc.id,
    prior: null,
    current: hasPositiveVolume ? svc.volume : null,
    source: svc.source,
    status: "Imported",
    ...(sourceFile ? { sourceFile } : {}),
  };
  return hasPositiveVolume
    ? base
    : { ...base, flag: "missing-current-volume" };
}
