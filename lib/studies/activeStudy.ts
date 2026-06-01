/* Centralized active-server-study selection.
 *
 * Why a module-level store rather than a React useState in
 * StudyMenu: multiple surfaces need to read + write this same value
 * (StudyMenu picks it, ModelSettingsMenu's demo-switch flow clears it
 * before mutating the Zustand store, the autosave subscribe callback
 * reads it defensively). Prop-drilling through TopBar would be ugly,
 * and lifting to a context would still hide the cross-cutting writes
 * behind a hook. A small module with `useSyncExternalStore` is the
 * least-magic equivalent.
 *
 * Storage:
 *   localStorage["afferent.activeStudyId"]   — the study UUID (legacy key)
 *   localStorage["afferent.activeStudyName"] — display name for confirmations
 *
 * Reads are race-free against the React render cycle: any caller can
 * read `getActiveStudyId()` synchronously and get the most recent
 * value, even when React hasn't re-rendered yet. This matters for the
 * autosave subscribe callback during a demo workspace switch — see
 * features/studies/useAutoSaveStudy.ts. */

import { useSyncExternalStore } from "react";

const ID_KEY = "afferent.activeStudyId";
const NAME_KEY = "afferent.activeStudyName";

export interface ActiveStudyRef {
  id: string;
  /** Best-effort display name. Empty string on first load if only the
   *  legacy id-only entry survived from a previous app version — the
   *  next StudyMenu refresh writes the name back. */
  name: string;
}

let state: ActiveStudyRef | null = readInitial();
const listeners = new Set<() => void>();

function readInitial(): ActiveStudyRef | null {
  try {
    const id = localStorage.getItem(ID_KEY);
    if (!id) return null;
    const name = localStorage.getItem(NAME_KEY) ?? "";
    return { id, name };
  } catch {
    return null;
  }
}

function notify(): void {
  for (const l of listeners) l();
}

function persist(next: ActiveStudyRef | null): void {
  try {
    if (next) {
      localStorage.setItem(ID_KEY, next.id);
      localStorage.setItem(NAME_KEY, next.name);
    } else {
      localStorage.removeItem(ID_KEY);
      localStorage.removeItem(NAME_KEY);
    }
  } catch { /* ignore */ }
}

function equal(a: ActiveStudyRef | null, b: ActiveStudyRef | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return a.id === b.id && a.name === b.name;
}

/** Read the current selection synchronously. Safe to call from any
 *  context — React or otherwise. */
export function getActiveStudy(): ActiveStudyRef | null {
  return state;
}

/** Convenience: just the id (or null). Used by the autosave subscribe
 *  callback as a defensive check during demo-switch transitions. */
export function getActiveStudyId(): string | null {
  return state?.id ?? null;
}

/** Replace the active study. Pass `null` to detach (the
 *  `clearActiveStudy` alias below documents that intent at call sites). */
export function setActiveStudy(next: ActiveStudyRef | null): void {
  if (equal(next, state)) return;
  state = next;
  persist(next);
  notify();
}

/** Alias for `setActiveStudy(null)` — used by the demo-switch flow
 *  in ModelSettingsMenu to make the detach intent obvious. */
export function clearActiveStudy(): void {
  setActiveStudy(null);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** React hook — re-renders when the active study changes. Identity-
 *  stable: returns the same object reference between updates so
 *  shallow-compare consumers see no change when nothing changed. */
export function useActiveStudy(): ActiveStudyRef | null {
  return useSyncExternalStore(subscribe, getActiveStudy, getActiveStudy);
}

/** Test seam — reset module state to first-load conditions. Not used
 *  by production code. */
export function resetActiveStudyForTests(): void {
  state = null;
  listeners.clear();
  try {
    localStorage.removeItem(ID_KEY);
    localStorage.removeItem(NAME_KEY);
  } catch { /* ignore */ }
}
