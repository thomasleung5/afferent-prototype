/* Auto-save sync-status types + label helpers.
 *
 * Pure functions / types — the actual state machine lives in
 * features/studies/useAutoSaveStudy.ts. This module exists so the
 * label / tone / relative-time formatters are unit-testable without
 * a React renderer. */

export type SyncStatus =
  /** No active study and we don't expect one — auth isn't configured,
   *  server returned 503 for /api/studies, or the deployment is local
   *  dev. Editing in localStorage is the intended persistence path. */
  | { kind: "local-only" }
  /** DB persistence isn't wired on this deployment. */
  | { kind: "not-configured" }
  /** Authenticated, server reachable, but no active study has been
   *  selected. Editing should be GATED behind a study-selection step
   *  — the StudySelectionGate handles this at the route layer; this
   *  status just drives the trigger label + tooltip when the user has
   *  a non-gated view (export pages, sandbox mode, etc.). */
  | { kind: "awaiting-study" }
  /** Active study selected, no pending edits, no in-flight save. */
  | { kind: "idle" }
  /** Local state was replaced (e.g. loading a named version) without
   *  touching the server draft — markSynced is deliberately skipped for
   *  that path. Distinct from "idle": there IS something to push, but
   *  no pending edit will trigger autosave on its own, so "Save now"
   *  must be offered explicitly. Clears the moment a normal edit or an
   *  explicit save fires — both route through the usual idle/saving/
   *  saved transitions. */
  | { kind: "diverged" }
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
    case "awaiting-study": return "warn";
    case "idle":           return "pos";
    case "diverged":       return "warn";
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
    case "awaiting-study": return "No study selected — pick one to enable autosave";
    case "idle":           return "Synced";
    case "diverged":       return "Not yet saved to the server";
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

/** Whether the manual "Save now" action should be offered at all.
 *  Broader than `syncStatusIsRetryable` — "diverged" also has real
 *  work to push (local state replaced without touching the server
 *  draft, e.g. loading a named version) even though it isn't a
 *  failure. "idle"/"saved" are excluded: nothing has changed since the
 *  last save, so there's nothing for the button to do. Excluded:
 *  "saving" (already in flight) and "conflict" (retrying would just
 *  re-conflict — same rationale as syncStatusIsRetryable). */
export function syncStatusCanSaveNow(s: SyncStatus): boolean {
  return s.kind === "diverged" || s.kind === "error";
}

/** Primary sentence for the StudyMenu popover: names the save
 *  destination explicitly ("current work saved to X") instead of a
 *  bare status word, so it's never ambiguous whether edits are on the
 *  server or only in this browser. `studyName` is the active study's
 *  name — always null for the local-only / not-configured /
 *  awaiting-study statuses, since those only occur without one. */
export function studySaveSummary(
  s: SyncStatus, studyName: string | null, now: number = Date.now(),
): string {
  switch (s.kind) {
    case "local-only":
      return "Local only — current work is saved in this browser, not to a server study.";
    case "not-configured":
      return "Local only — server study storage isn't configured on this deployment.";
    case "awaiting-study":
      return "Local only — select or create a study below to save this work.";
    case "saving":
      return studyName ? `Saving to ${studyName}…` : "Saving…";
    case "idle":
      return studyName ? `Current work saved to ${studyName}` : "Synced";
    case "diverged":
      return studyName
        ? `Loaded locally — not yet saved to ${studyName}`
        : "Loaded locally — not yet saved";
    case "saved":
      return studyName
        ? `Current work saved to ${studyName} · ${formatRelativeTime(s.at, now)}`
        : `Saved · ${formatRelativeTime(s.at, now)}`;
    case "error":
      return studyName ? `Save to ${studyName} failed` : "Save failed";
    case "conflict":
      return studyName
        ? `Conflict with ${studyName} — reload to resolve`
        : "Conflict — reload to resolve";
  }
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
