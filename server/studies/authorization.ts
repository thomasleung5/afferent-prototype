/* Role → permission helpers for /api/studies/*.
 *
 * Mirrors the RLS policies in the initial migration so the
 * service-role-key path (which bypasses RLS by design) enforces the
 * same contract in code. Keep these aligned with the policies — if
 * a policy changes, this file changes too.
 *
 *   owner    full access
 *   admin    full access except for membership management (out of scope)
 *   analyst  edit drafts, create studies, create versions
 *   viewer   read-only
 *
 * Pure functions — exported for direct fixture testing without a
 * Hono context. */

export type Role = "owner" | "admin" | "analyst" | "viewer";

const VALID_ROLES: readonly Role[] = ["owner", "admin", "analyst", "viewer"] as const;

/** Type guard — accepts the four documented roles and nothing else. */
export function isValidRole(s: string | null | undefined): s is Role {
  return typeof s === "string" && (VALID_ROLES as readonly string[]).includes(s);
}

/** Membership exists with one of the documented roles — read access. */
export function canRead(role: string | null | undefined): boolean {
  return isValidRole(role);
}

/** Edit the live mutable draft. Versions are created via canCreateVersion;
 *  this is the broader "make changes to the working state" gate. */
export function canMutateDraft(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "analyst";
}

/** Create new studies inside an organization. Owners + admins + analysts. */
export function canCreateStudy(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "analyst";
}

/** Update study metadata (name, fiscal year, archive). Owners + admins. */
export function canUpdateStudy(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** Cut an immutable named version. Owners + admins + analysts. */
export function canCreateVersion(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "analyst";
}
