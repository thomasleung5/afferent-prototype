/* Autosave suppression counter — prevents server-load → autosave loops.
 *
 * The auto-save subscription in features/studies/useAutoSaveStudy.ts
 * fires on every Zustand store change, including the change that
 * happens when we just *received* a fresh draft from the server and
 * pushed it into the store. Without a guard, that loaded state would
 * immediately be re-queued for save, creating a thrash loop (and
 * blowing past the no-op identity check on the server).
 *
 * Wrap any code that calls `useBuildStore.getState().loadSnapshot(...)`
 * with `withSuppressedAutosave(() => loadSnapshot(snap))`. The
 * subscribe callback checks `isAutosaveSuppressed()` synchronously
 * during the same `set()` invocation and skips scheduling.
 *
 * The counter (rather than a boolean) supports nested / re-entrant
 * suppression scopes without one scope clearing another's flag. */

let suppressionCount = 0;

export function beginAutosaveSuppression(): void {
  suppressionCount++;
}

export function endAutosaveSuppression(): void {
  if (suppressionCount > 0) suppressionCount--;
}

export function isAutosaveSuppressed(): boolean {
  return suppressionCount > 0;
}

/** Run `fn` with autosave suppressed for its duration. Synchronous —
 *  do not `await` inside, or the suppression flag will lift while the
 *  promise is still in flight and async store mutations would slip
 *  through. */
export function withSuppressedAutosave<T>(fn: () => T): T {
  beginAutosaveSuppression();
  try {
    return fn();
  } finally {
    endAutosaveSuppression();
  }
}

/** Test seam — reset the counter. Production code never calls this. */
export function resetAutosaveSuppressionForTests(): void {
  suppressionCount = 0;
}
