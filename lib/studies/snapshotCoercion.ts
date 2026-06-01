/* Coerce an `unknown` snapshot returned from /api/studies/:id into a
 * typed BuildSnapshot suitable for `useBuildStore.loadSnapshot`.
 *
 * Mirrors what lib/snapshotIO.ts:parseSnapshotJson does for file
 * uploads — runs the payload through the shared migratePersistedState
 * helper so older server-stored snapshots upgrade to the current
 * schema before they reach the store. Pure & UI-agnostic. */

import type { BuildSnapshot, BuildState } from "../store";
import { migratePersistedState } from "../storeMigration";

export type CoercionResult =
  | { ok: true; snapshot: BuildSnapshot }
  | { ok: false; message: string };

export function coerceServerSnapshot(value: unknown): CoercionResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: "Server snapshot is empty or malformed." };
  }
  // Mutate in place — migratePersistedState backfills missing fields
  // with seed values. The cast is sound because BuildSnapshot is a
  // structural subset of BuildState.
  const snap = value as Record<string, unknown>;
  migratePersistedState(snap as Partial<BuildState>);
  return { ok: true, snapshot: snap as unknown as BuildSnapshot };
}
