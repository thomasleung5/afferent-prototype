/* Shared print helpers for the /export print-preview routes. */

import { useEffect, useState } from "react";
import { useBuildStore } from "@/lib/store";

/** Kebab-case slug for a jurisdiction name, used as the filename prefix
 *  on export downloads. "Town of Los Altos Hills" → "town-of-los-altos-hills". */
export function slugCity(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Auto-fire `window.print()` on first paint when the export tab was
 *  opened with `?print=1`. A short delay gives React time to render
 *  hydrated content before the print snapshot is taken. Hand-rolled in
 *  each export route originally; consolidated here so all four pages
 *  share the same timing and URL convention. */
export function useAutoPrint() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("print") === "1") {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, []);
}

/** Returns true once the Zustand persist middleware has rehydrated from
 *  localStorage. Used to gate render on the export print-preview tabs
 *  so window.print() can't snapshot an empty store. */
export function useStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState(
    () => useBuildStore.persist?.hasHydrated() ?? true,
  );
  useEffect(() => {
    const unsub = useBuildStore.persist?.onFinishHydration(() => setHydrated(true));
    if (useBuildStore.persist?.hasHydrated()) setHydrated(true);
    return () => { unsub?.(); };
  }, []);
  return hydrated;
}
