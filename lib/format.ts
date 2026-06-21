/* Number/string formatters used across the UI.
 *
 * Display-only. Every helper here rounds and stringifies; never feed a
 * `fmt.*` result back into an aggregation or comparison. Authoritative
 * full-precision values live in the store's `derived.*` slices and in
 * `lib/calc.ts` — round once, at the edge, when rendering.
 */

export const fmt = {
  /** Dollar-precision rendering (e.g. "$1,234"). Display only. */
  dollars(n: number | null | undefined): string {
    if (n == null) return "—";
    return `$${Math.round(n).toLocaleString()}`;
  },
  /** Compact dollars: M for millions, K for thousands, else exact.
   *  Display only — the compaction loses precision. */
  dollarsK(n: number | null | undefined): string {
    if (n == null) return "—";
    const a = Math.abs(n);
    if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (a >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
    return `$${Math.round(n).toLocaleString()}`;
  },
  /** Comma-separated integer rendering. Display only. */
  int(n: number | null | undefined): string {
    if (n == null) return "—";
    return Math.round(n).toLocaleString();
  },
  /** Comma-separated number with up to `decimals` fractional digits.
   *  For non-currency, non-integer values (driver units, hour balances,
   *  basis denominators). Trailing zeros are trimmed. Display only. */
  units(n: number | null | undefined, decimals = 2): string {
    if (n == null) return "—";
    return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
  },
};

/** Strips a storage path and trailing timestamp suffix off an uploaded
 *  filename for display, and decodes any URL-encoding (e.g. "%20").
 *  The raw value is never mutated — callers keep it for retrieval; this
 *  only governs what gets rendered. Truncation to the container width is
 *  left to CSS (text-overflow: ellipsis). */
export function displayFileName(raw: string | null | undefined): string {
  if (!raw) return "";
  let name = raw;
  try {
    name = decodeURIComponent(name);
  } catch {
    // Not URL-encoded (or malformed) — use as-is.
  }
  const lastSlash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
  if (lastSlash >= 0) name = name.slice(lastSlash + 1);
  // Drop a "-<13-digit-ms-timestamp>" or "_<13-digit-ms-timestamp>"
  // suffix inserted before the extension by storage upload paths.
  name = name.replace(/[-_]\d{13}(?=\.[^.]+$)/, "");
  return name;
}
