/* Number/string formatters used across the UI. */

export const fmt = {
  dollars(n: number | null | undefined): string {
    if (n == null) return "—";
    return `$${Math.round(n).toLocaleString()}`;
  },
  dollarsK(n: number | null | undefined): string {
    if (n == null) return "—";
    const a = Math.abs(n);
    if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (a >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
    return `$${Math.round(n).toLocaleString()}`;
  },
  int(n: number | null | undefined): string {
    if (n == null) return "—";
    return Math.round(n).toLocaleString();
  },
};
