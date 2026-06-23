/* One-shot top-bar notice when the active server study disappears.
 *
 * Triggered from useAutoSaveStudy's `onStudyMissing` callback (server
 * returned 404 on a save) and from StudyMenu's `refresh` flow when
 * the previously-active id is no longer visible. The popover already
 * surfaces a local notice inside itself; this module exists so the
 * warning is also visible WITHOUT opening the popover — most users
 * won't have it open when the study revocation happens.
 *
 * Module-level + `useSyncExternalStore`, mirroring the pattern in
 * `activeStudy.ts`. Reads are synchronous so a callsite can both
 * `emit` and continue executing without waiting for React render. */

import { useSyncExternalStore } from "react";

export interface StaleStudyNotice {
  message: string;
  /** ms-since-epoch. Used by the banner to auto-dismiss after a
   *  threshold without depending on a setTimeout that can leak
   *  across re-renders. */
  emittedAt: number;
}

let current: StaleStudyNotice | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getStaleStudyNotice(): StaleStudyNotice | null {
  return current;
}

export function emitStaleStudyNotice(message: string): void {
  current = { message, emittedAt: Date.now() };
  notify();
}

export function dismissStaleStudyNotice(): void {
  if (current === null) return;
  current = null;
  notify();
}

/** Subscribe a React component to the latest notice. */
export function useStaleStudyNotice(): StaleStudyNotice | null {
  return useSyncExternalStore(subscribe, getStaleStudyNotice, getStaleStudyNotice);
}
