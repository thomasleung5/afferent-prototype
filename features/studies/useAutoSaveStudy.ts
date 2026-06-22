/* Auto-save sync for the active server-side study.
 *
 * Subscribes to the Zustand build store and pushes the current
 * snapshot to PUT /api/studies/:id/snapshot whenever it changes,
 * debounced to coalesce edit bursts.
 *
 * Concerns:
 *   1. **Loop avoidance.** Loading a server snapshot back into the
 *      store would fire the subscription and re-queue a save of the
 *      same data. The load path wraps `loadSnapshot` in
 *      `withSuppressedAutosave` (see lib/studies/autosaveGuard.ts);
 *      our subscribe callback checks `isAutosaveSuppressed()` and
 *      skips scheduling during the suppressed window.
 *
 *   2. **Burst coalescing.** A single in-flight save at a time. New
 *      edits during a save set a `queued` flag and trigger a fresh
 *      debounce only after the in-flight save resolves.
 *
 *   3. **Stale active study.** A 404 from the server (study deleted
 *      or membership revoked) calls `onStudyMissing` so the caller
 *      can clear the active id and drop back to local-only mode.
 *
 *   4. **Disable conditions.** No active study, DB unconfigured, or
 *      `enabled === false` → the subscription is torn down and the
 *      status reports local-only / not-configured. */

import { useCallback, useEffect, useRef, useState } from "react";
import { createBuildSnapshot, useBuildStore } from "@/lib/store";
import { saveStudySnapshot } from "@/lib/studies/studiesApi";
import { isAutosaveSuppressed } from "@/lib/studies/autosaveGuard";
import { getActiveStudyId } from "@/lib/studies/activeStudy";
import type { SyncStatus } from "@/lib/studies/syncStatus";

const DEFAULT_DELAY_MS = 1500;

export interface UseAutoSaveStudyArgs {
  /** Study id to save snapshots to. `null` → local-only / awaiting-study. */
  activeStudyId: string | null;
  /** Master enable switch (signed in, DB configured, etc.). When false,
   *  the hook stays in `local-only` / `not-configured` / `awaiting-study`
   *  and never subscribes to store changes. */
  enabled: boolean;
  /** True when the server returned 503 / "not configured" for the
   *  current session — surfaces the dedicated status label. */
  isNotConfigured: boolean;
  /** True when the SPA is in an authenticated production session
   *  (Supabase configured + signed in). Drives the choice between the
   *  legitimate `local-only` fallback and the gating `awaiting-study`
   *  status when no study is selected. */
  isAuthenticated: boolean;
  /** Override for the debounce window (ms). Default 1500. */
  delayMs?: number;
  /** Called when the server reports the active study no longer exists
   *  or is no longer accessible. Caller should clear its local
   *  active-id reference. */
  onStudyMissing?: () => void;
}

export interface UseAutoSaveStudyApi {
  status: SyncStatus;
  /** Cancel any pending debounce and save immediately. Resolves once
   *  the save (success or error) completes. */
  saveNow: () => Promise<void>;
  /** Mark the current local state as already-in-sync with the server.
   *  Used by the load handler after pushing a server snapshot into
   *  the store, so the status reads "Saved · now" rather than "Idle".
   *  `revisionId`, when supplied, seeds the optimistic-lock token used
   *  on subsequent saves (omit on local-only paths). */
  markSynced: (at: number, revisionId?: string | null) => void;
  /** Mark the current local state as diverged from the server draft
   *  without anything queued to push it — e.g. after loading a named
   *  version, which intentionally doesn't autosave. Surfaces "Save
   *  now" so the user has an explicit way to push it. Leaves the
   *  optimistic-lock revision token untouched: the server draft itself
   *  hasn't moved, so the next save's expected_revision_id is still
   *  valid. */
  markDiverged: () => void;
}

export function useAutoSaveStudy(args: UseAutoSaveStudyArgs): UseAutoSaveStudyApi {
  const {
    activeStudyId, enabled, isNotConfigured, isAuthenticated,
    delayMs = DEFAULT_DELAY_MS, onStudyMissing,
  } = args;

  const [status, setStatus] = useState<SyncStatus>(() =>
    initialStatus({ enabled, isNotConfigured, activeStudyId, isAuthenticated }),
  );

  // Mutable refs so the subscribe callback always reads current values
  // without re-subscribing on every render.
  const activeStudyIdRef = useRef(activeStudyId);
  activeStudyIdRef.current = activeStudyId;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const delayMsRef = useRef(delayMs);
  delayMsRef.current = delayMs;
  const onStudyMissingRef = useRef(onStudyMissing);
  onStudyMissingRef.current = onStudyMissing;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const lastSavedAtRef = useRef<number | null>(null);
  // Optimistic-lock token. Updated on every successful load / save;
  // null until the first one of those completes. Sent back to the
  // server as `expected_revision_id` on the next save so the server
  // can detect a conflicting write from another client. See
  // docs/persistence-design.md → "Concurrency: optimistic locking".
  const lastKnownRevisionIdRef = useRef<string | null>(null);

  const cancelTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const performSave = useCallback(async () => {
    // Prefer the module's id over the React-state-derived ref — the
    // ref is updated during render so a save fired from the same
    // event handler that just called setActiveStudy() would otherwise
    // see the previous id.
    const id = getActiveStudyId() ?? activeStudyIdRef.current;
    if (!id) return;
    if (inFlightRef.current) {
      // Save is mid-flight — mark a follow-up so we don't drop the
      // most recent edits.
      queuedRef.current = true;
      return;
    }
    inFlightRef.current = true;
    setStatus({ kind: "saving" });
    try {
      const snap = createBuildSnapshot(useBuildStore.getState());
      const expected = lastKnownRevisionIdRef.current ?? undefined;
      const res = await saveStudySnapshot(id, snap, expected);
      if (!res.ok) {
        // 404 → study was deleted or membership revoked. Tell the
        // caller so it can drop the active id; we report the error
        // but it's the caller's job to actually clear local state.
        if (/not found/i.test(res.message)) {
          onStudyMissingRef.current?.();
        }
        // Optimistic-lock conflict — the server-side draft moved
        // since our last sync. Surface a distinct status so the UI
        // can offer a non-destructive reload; do NOT auto-retry
        // (the next save would just re-conflict) and do NOT discard
        // local edits (the user's work stays in the store).
        if (res.message === "stale revision") {
          queuedRef.current = false;
          setStatus({
            kind: "conflict",
            currentRevisionId: res.current_revision_id ?? null,
          });
          return;
        }
        setStatus({
          kind: "error",
          message: res.message,
          lastSavedAt: lastSavedAtRef.current,
        });
        return;
      }
      const at = Date.now();
      lastSavedAtRef.current = at;
      lastKnownRevisionIdRef.current = res.revision_id;
      setStatus({ kind: "saved", at });
    } finally {
      inFlightRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        // Edit happened during the save — start a fresh debounce so
        // we eventually land the latest snapshot.
        if (enabledRef.current && activeStudyIdRef.current) {
          if (timerRef.current != null) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            timerRef.current = null;
            void performSave();
          }, delayMsRef.current);
        }
      }
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (!enabledRef.current || !activeStudyIdRef.current) return;
    if (timerRef.current != null) clearTimeout(timerRef.current);
    setStatus({ kind: "saving" });
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void performSave();
    }, delayMsRef.current);
  }, [performSave]);

  // Resolve the status whenever the enable / activeStudyId / config
  // flags change. Cancels any pending timer. Also resets the
  // per-study save-timestamp cache: a previously-saved A doesn't
  // mean B has been saved.
  useEffect(() => {
    if (isNotConfigured) {
      cancelTimer();
      lastSavedAtRef.current = null;
      lastKnownRevisionIdRef.current = null;
      setStatus({ kind: "not-configured" });
      return;
    }
    if (!enabled || !activeStudyId) {
      cancelTimer();
      lastSavedAtRef.current = null;
      lastKnownRevisionIdRef.current = null;
      // Authenticated + no study → "awaiting-study" so the trigger +
      // tooltip read as a gate rather than a valid save destination.
      // Unauthenticated (local dev / smoke) → genuine "local-only".
      setStatus({ kind: isAuthenticated ? "awaiting-study" : "local-only" });
      return;
    }
    // Active study + enabled + DB configured — start in idle. The
    // previous study's timestamp + revision were cleared on switch,
    // so this is always a fresh-per-study idle state.
    cancelTimer();
    lastSavedAtRef.current = null;
    lastKnownRevisionIdRef.current = null;
    setStatus({ kind: "idle" });
  }, [activeStudyId, enabled, isNotConfigured, isAuthenticated, cancelTimer]);

  // Subscribe to store changes while we have an active study. The
  // callback is a stable closure that reads current ids/flags from
  // refs so we don't re-subscribe on every render.
  useEffect(() => {
    if (!enabled || !activeStudyId || isNotConfigured) return;
    const unsub = useBuildStore.subscribe(() => {
      if (isAutosaveSuppressed()) return;
      // Defensive: check the centralized module synchronously.
      // ModelSettingsMenu's demo-switch flow calls clearActiveStudy()
      // BEFORE mutating the store, but the React state propagation
      // through this hook's props takes another render cycle — the
      // ref-based check would still see a stale id during that gap.
      // The module is authoritative and updates synchronously.
      if (getActiveStudyId() == null) return;
      scheduleSave();
    });
    return () => {
      unsub();
      cancelTimer();
    };
  }, [activeStudyId, enabled, isNotConfigured, scheduleSave, cancelTimer]);

  // Best-effort flush on unmount: cancel any pending timer; the
  // in-flight save (if any) is allowed to complete on its own.
  useEffect(() => () => { cancelTimer(); }, [cancelTimer]);

  const saveNow = useCallback(async () => {
    cancelTimer();
    await performSave();
  }, [cancelTimer, performSave]);

  const markSynced = useCallback((at: number, revisionId?: string | null) => {
    cancelTimer();
    lastSavedAtRef.current = at;
    // `undefined` → caller doesn't know the revision (e.g. local
    // markSynced on a brand-new save path), so leave the existing
    // ref untouched. Explicit `null` clears it.
    if (revisionId !== undefined) {
      lastKnownRevisionIdRef.current = revisionId;
    }
    setStatus({ kind: "saved", at });
  }, [cancelTimer]);

  const markDiverged = useCallback(() => {
    cancelTimer();
    setStatus({ kind: "diverged" });
  }, [cancelTimer]);

  return { status, saveNow, markSynced, markDiverged };
}

function initialStatus(args: {
  enabled: boolean;
  isNotConfigured: boolean;
  activeStudyId: string | null;
  isAuthenticated: boolean;
}): SyncStatus {
  if (args.isNotConfigured) return { kind: "not-configured" };
  if (!args.enabled || !args.activeStudyId) {
    return { kind: args.isAuthenticated ? "awaiting-study" : "local-only" };
  }
  return { kind: "idle" };
}
