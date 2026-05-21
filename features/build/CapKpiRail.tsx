import type { CapPool } from "@/lib/types";
import { defaultCenterOrder } from "@/lib/store";

/** Reduce pools → centers (name, total $, pool count). Stable ordering comes
 *  from `capCenterOrder` (with any newly-imported centers appended). */
interface CenterRow {
  name: string;
  total: number;
  pools: number;
}

export function deriveCenters(pools: CapPool[], order: string[]): CenterRow[] {
  const map = new Map<string, { total: number; pools: number }>();
  for (const p of pools) {
    const cur = map.get(p.center) ?? { total: 0, pools: 0 };
    cur.total += p.amount;
    cur.pools += 1;
    map.set(p.center, cur);
  }
  const seen = new Set<string>();
  const out: CenterRow[] = [];
  for (const name of order) {
    const m = map.get(name);
    if (!m) continue;
    out.push({ name, total: m.total, pools: m.pools });
    seen.add(name);
  }
  // Append centers the saved order doesn't know about (e.g. fresh imports).
  for (const name of defaultCenterOrder(pools)) {
    if (seen.has(name)) continue;
    const m = map.get(name);
    if (!m) continue;
    out.push({ name, total: m.total, pools: m.pools });
  }
  return out;
}
