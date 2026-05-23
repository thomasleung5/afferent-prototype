/* Shared ID generation for new (non-catalog-matched) service rows
 * coming out of the AI parsers (parseServices, parseFees).
 *
 * The old `svc-ai-${i}` scheme collided across imports — the store's
 * `mergeRows` keys by `id`, so a second import's row 0 would silently
 * overwrite the first import's row 0 even if the two were unrelated
 * services. This module derives an ID from the normalized
 * dept + name so it's stable per service identity:
 *   - Two imports of the same (dept, name) collapse onto the same id
 *     and the merge correctly treats the second as a duplicate.
 *   - Two imports of different services get distinct ids regardless of
 *     row position.
 *
 * Catalog matching (existing service lookup by lowercased name) runs
 * before this — when a row matches an existing service, that service's
 * id is reused via spread, so this only ever fires for genuinely new
 * rows that the catalog didn't recognize.
 */

import type { DeptCode } from "@/lib/types";

/** Build a stable id for a newly-discovered AI-parsed service row.
 *  Format: `svc-ai-{dept}-{slug(name)}`, falling back to a deterministic
 *  hash of the name when the slug would be empty (e.g. names that are
 *  pure punctuation). */
export function newServiceId(dept: DeptCode, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const deptKey = dept.toLowerCase();
  if (slug) return `svc-ai-${deptKey}-${slug}`;
  return `svc-ai-${deptKey}-${djb2(name)}`;
}

/** Tiny deterministic string hash. Base-36 output keeps the resulting
 *  id short and id-friendly (no '+' or '/'). */
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}
