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

/** Run `fn` with autosave suppressed for its duration. Works for
 *  both synchronous and asynchronous callbacks:
 *
 *    - Sync return value → suppression lifts immediately after `fn`
 *      completes (same shape as the original implementation).
 *    - Returned Promise / thenable → suppression remains active until
 *      the Promise settles (resolve or reject). Used by the
 *      ModelSettingsMenu demo-switch flow, where switchJurisdiction
 *      awaits a seed-overlay fetch and mutates the store both before
 *      AND after the await.
 *
 *  Throws are forwarded; suppression always releases. */
export function withSuppressedAutosave<T>(fn: () => T): T {
  beginAutosaveSuppression();
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    endAutosaveSuppression();
  };
  let result: T;
  try {
    result = fn();
  } catch (err) {
    release();
    throw err;
  }
  // Detect thenables — covers native Promise plus any duck-typed
  // equivalent. The `then` arms forward both branches and release
  // suppression before propagating.
  const maybeThen = (result as unknown as { then?: unknown } | null);
  if (maybeThen && typeof maybeThen.then === "function") {
    return (result as unknown as Promise<unknown>).then(
      (v) => { release(); return v; },
      (e) => { release(); throw e; },
    ) as unknown as T;
  }
  release();
  return result;
}

/** Test seam — reset the counter. Production code never calls this. */
export function resetAutosaveSuppressionForTests(): void {
  suppressionCount = 0;
}
