/* Shared print helpers for the /export print-preview routes. */

import { useEffect } from "react";

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
