/* Session-scoped "sandbox mode" flag.
 *
 * Goal: authenticated users should not silently build a real model in
 * browser-only localStorage. The root-route gate
 * (StudySelectionGate) prompts users to select or create a server
 * study before any meaningful editing. Two flows legitimately need to
 * bypass that gate without picking a study:
 *
 *   1. Demo workspace exploration — switching to the Maplewood /
 *      Cupertino / etc. seed deliberately loads ephemeral data; the
 *      user is "playing" with the model, not authoring a real study.
 *   2. The user explicitly opts to "Continue without a study" from
 *      the gate panel itself.
 *
 * Both paths set this flag, which lives in sessionStorage so it
 * survives reloads / navigation within a tab but does NOT cross tabs
 * or persist past sign-out + sign-in. Selecting a server study via
 * StudyMenu clears it (the user has moved out of sandbox into a real
 * persistence target). Signing out clears it.
 *
 * Storage:
 *   sessionStorage["afferent.sandboxMode"] = "1"  (only when on)
 *
 * Reads are race-free relative to React render: any caller can read
 * `isSandboxMode()` synchronously and get the most recent value.
 * Tests can reset via `resetSandboxModeForTests()`. */

import { useSyncExternalStore } from "react";

const KEY = "afferent.sandboxMode";

let state: boolean = readInitial();
const listeners = new Set<() => void>();

function readInitial(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function notify(): void {
  for (const l of listeners) l();
}

function persist(next: boolean): void {
  try {
    if (next) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

/** Read sandbox-mode flag synchronously. Safe from any context. */
export function isSandboxMode(): boolean {
  return state;
}

/** Enter sandbox mode. Idempotent. */
export function enableSandboxMode(): void {
  if (state) return;
  state = true;
  persist(true);
  notify();
}

/** Exit sandbox mode. Idempotent. Called automatically when the user
 *  picks or creates a server study (they've moved out of sandbox). */
export function disableSandboxMode(): void {
  if (!state) return;
  state = false;
  persist(false);
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** React hook — re-renders when the sandbox flag flips. */
export function useSandboxMode(): boolean {
  return useSyncExternalStore(subscribe, isSandboxMode, isSandboxMode);
}

/** Test seam — reset to first-load conditions. Not used by prod code. */
export function resetSandboxModeForTests(): void {
  state = false;
  listeners.clear();
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
