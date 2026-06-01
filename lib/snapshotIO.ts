/* Snapshot JSON export / import — manual escape hatch for the
 * localStorage-only persistence layer.
 *
 * Today's only persistence path is the Zustand `persist` middleware
 * writing to `localStorage["afferent.build.v1"]`. This helper lets an
 * analyst round-trip the same snapshot shape as a JSON file, which:
 *
 *   - survives clearing site data / switching browsers,
 *   - covers manual handoff to a different teammate, and
 *   - is the same JSON shape the eventual server migration endpoint
 *     will accept (see docs/persistence-design.md).
 *
 * Scope: pure helpers only — no DOM. UI callers (a future Source
 * Data toolbar button, the dev-tools console) wire `snapshotBlob` ↔
 * `URL.createObjectURL` ↔ `<a download>` themselves. */

import type { BuildSnapshot, BuildState } from "./store";
import { migratePersistedState } from "./storeMigration";

const SNAPSHOT_MIME = "application/json";
const SNAPSHOT_FORMAT_VERSION = 1;

/** File envelope so downstream tooling can identify Afferent snapshots
 *  cleanly and reject unrelated JSON. The inner `snapshot` field
 *  matches `BuildSnapshot` exactly. */
export interface SnapshotFileEnvelope {
  format: "afferent.snapshot";
  formatVersion: number;
  exportedAt: string;
  snapshot: BuildSnapshot;
}

/** Wrap a snapshot in the file envelope. Pure — no I/O. */
export function serializeSnapshot(snapshot: BuildSnapshot): SnapshotFileEnvelope {
  return {
    format: "afferent.snapshot",
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    snapshot,
  };
}

/** Render a snapshot to a Blob ready for `URL.createObjectURL`. */
export function snapshotBlob(snapshot: BuildSnapshot): Blob {
  const json = JSON.stringify(serializeSnapshot(snapshot), null, 2);
  return new Blob([json], { type: SNAPSHOT_MIME });
}

/** Default filename convention — fiscal year + ISO date. Safe in
 *  most filesystems. Callers can override; this is a sensible default. */
export function defaultSnapshotFilename(snapshot: BuildSnapshot, now = new Date()): string {
  const fy = (snapshot.activeFiscalYear ?? "FY").replace(/\s+/g, "");
  const date = now.toISOString().slice(0, 10);
  return `afferent-snapshot-${fy}-${date}.json`;
}

export type ParseSnapshotResult =
  | { ok: true; snapshot: BuildSnapshot }
  | { ok: false; message: string };

/** Parse a snapshot JSON string back into a `BuildSnapshot`. Runs the
 *  shared persistence migration on the inner payload so older exports
 *  upgrade to the current schema, the same way the persist layer does
 *  on rehydration. Defensive — returns a clean error string rather
 *  than throwing. */
export function parseSnapshotJson(text: string): ParseSnapshotResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: "File is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, message: "Snapshot file is empty or malformed." };
  }
  const env = parsed as Partial<SnapshotFileEnvelope>;
  if (env.format !== "afferent.snapshot") {
    return { ok: false, message: "File is not an Afferent snapshot." };
  }
  if (!env.snapshot || typeof env.snapshot !== "object") {
    return { ok: false, message: "Snapshot envelope is missing the snapshot payload." };
  }
  // Migrate in place — `migratePersistedState` mutates and is
  // forward-compatible with partial input. The cast is sound because
  // BuildSnapshot is a structural subset of BuildState.
  migratePersistedState(env.snapshot as Partial<BuildState>);
  return { ok: true, snapshot: env.snapshot as BuildSnapshot };
}
