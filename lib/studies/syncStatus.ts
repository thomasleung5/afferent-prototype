/* Auto-save sync-status types + label helpers.
 *
 * Pure functions / types — the actual state machine lives in
 * features/studies/useAutoSaveStudy.ts. This module exists so the
 * label / tone / relative-time formatters are unit-testable without
 * a React renderer. */

export type SyncStatus =
  /** No active study; everything stays in localStorage on this device. */
  | { kind: "local-only" }
  /** DB persistence isn't wired on this deployment. */
  | { kind: "not-configured" }
  /** Active study selected, no pending edits, no in-flight save. */
  | { kind: "idle" }
  /** A save is queued (debounce timer) or actually in flight. */
  | { kind: "saving" }
  /** The most recent save completed successfully `at` ms-since-epoch. */
  | { kind: "saved"; at: number }
  /** The most recent save failed. `lastSavedAt` is preserved so the
   *  UI can show "Save failed; last good save was 12m ago" if useful. */
  | { kind: "error"; message: string; lastSavedAt: number | null }
  /** Optimistic-lock conflict: the server-side draft moved between
   *  our last load/save and this save attempt. Local edits are NOT
   *  discarded — the UI surfaces the divergence and lets the user
   *  reload (replacing local) or force-overwrite explicitly. */
  | { kind: "conflict"; currentRevisionId: string | null };

export type SyncTone = "neutral" | "pos" | "warn" | "neg";

/** Map a status to a small color tone. Drives the trigger-button dot
 *  and the in-popover status pill. */
export function syncStatusTone(s: SyncStatus): SyncTone {
  switch (s.kind) {
    case "local-only":     return "neutral";
    case "not-configured": return "neutral";
    case "idle":           return "pos";
    case "saving":         return "neutral";
    case "saved":          return "pos";
    case "error":          return "neg";
    case "conflict":       return "warn";
  }
}

/** Human-readable label for the popover / trigger title. */
export function syncStatusLabel(s: SyncStatus, now: number = Date.now()): string {
  switch (s.kind) {
    case "local-only":     return "Local only";
    case "not-configured": return "Storage not configured";
    case "idle":           return "Synced";
    case "saving":         return "Saving…";
    case "saved":          return `Saved · ${formatRelativeTime(s.at, now)}`;
    case "error":          return "Save failed";
    case "conflict":       return "Conflict — reload to resolve";
  }
}

/** Whether this status has a recoverable failure the user should be
 *  offered a retry for. Conflicts deliberately don't show "Save now"
 *  — retrying would just re-conflict; the user has to reload or
 *  explicitly overwrite via a separate flow. */
export function syncStatusIsRetryable(s: SyncStatus): boolean {
  return s.kind === "error";
}

/** Concise relative-time formatter. Doesn't aim for i18n; matches the
 *  tone of `.toLocaleString()` elsewhere in the app. */
export function formatRelativeTime(then: number, now: number = Date.now()): string {
  const deltaSec = Math.max(0, Math.floor((now - then) / 1000));
  if (deltaSec < 5)   return "just now";
  if (deltaSec < 60)  return `${deltaSec}s ago`;
  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60)  return `${deltaMin}m ago`;
  const deltaHr  = Math.floor(deltaMin / 60);
  if (deltaHr  < 24)  return `${deltaHr}h ago`;
  const deltaDay = Math.floor(deltaHr / 24);
  return `${deltaDay}d ago`;
}
