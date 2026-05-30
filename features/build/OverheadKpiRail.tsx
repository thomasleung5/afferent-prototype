import type { CapPool } from "@/lib/types";
import { defaultCenterOrder } from "@/lib/store";

/** Reduce pools → centers (key, name, total $, pool count). `key` is the
 *  center identity (glCode for imported centers, `seed:center:NAME` synth
 *  for manually-added or pre-glCode-import centers) and is what every
 *  state lookup uses. Stable ordering comes from `capCenterOrder` (with
 *  any newly-imported centers appended). */
interface CenterRow {
  key: string;
  name: string;
  total: number;
  pools: number;
}

export function deriveCenters(
  pools: CapPool[],
  order: string[],
  sources: Record<string, { name: string }> = {},
): CenterRow[] {
  const map = new Map<string, { name: string; total: number; pools: number }>();
  for (const p of pools) {
    const key = p.centerGlCode;
    if (!key) continue;
    const cur = map.get(key) ?? { name: p.center, total: 0, pools: 0 };
    cur.total += p.amount;
    cur.pools += 1;
    // Prefer the metadata-supplied display name (renames live there).
    cur.name = sources[key]?.name ?? cur.name;
    map.set(key, cur);
  }
  const seen = new Set<string>();
  const out: CenterRow[] = [];
  for (const key of order) {
    const m = map.get(key);
    if (!m) continue;
    out.push({ key, name: m.name, total: m.total, pools: m.pools });
    seen.add(key);
  }
  // Append centers the saved order doesn't know about (e.g. fresh imports).
  for (const key of defaultCenterOrder(pools)) {
    if (seen.has(key)) continue;
    const m = map.get(key);
    if (!m) continue;
    out.push({ key, name: m.name, total: m.total, pools: m.pools });
  }
  return out;
}
