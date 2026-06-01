/* Hono route module for /api/organizations.
 *
 * Single endpoint right now — `GET /` returns the caller's
 * organization memberships joined with the org rows. Used by the
 * StudyMenu "New study…" flow so a user with a membership but zero
 * studies can still create the first one. Without this endpoint,
 * the menu had to infer the target org from existing studies, which
 * is empty until the first study exists — a chicken-and-egg dead end.
 *
 * Same authorization model as /api/studies/*: requireAuth() populates
 * c.var.user with the verified user id, service-role bypasses RLS,
 * and the query filters by `user_id` explicitly. RLS policies on
 * the underlying tables are defense-in-depth + the contract for a
 * future direct-PostgREST read path. */

import { Hono } from "hono";
import { getAuthUser, type AuthEnv } from "./requireAuth";
import { getDbClient } from "./db";
import { logEvent } from "./logger";

export const organizationsRoutes = new Hono<AuthEnv>();

organizationsRoutes.get("/", async (c) => {
  const db = getDbClient();
  if (!db) {
    return c.json(
      { ok: false, message: "Study persistence is not configured on this server." },
      503,
    );
  }
  const user = getAuthUser(c);

  // Two-step lookup — same pattern as the studies handler. Joining
  // through PostgREST embeds in one query is possible but the typed
  // surface is brittle; explicit selects + an in-memory merge are
  // easier to read and easier to migrate later.
  const { data: memberships, error: memErr } = await db
    .from("organization_members")
    .select("role, organization_id")
    .eq("user_id", user.id);
  if (memErr) {
    logEvent({
      level: "error",
      msg: "list organizations: memberships query failed",
      route: "GET /api/organizations",
      error: memErr.message,
    });
    return c.json({ ok: false, message: "Failed to load organizations." }, 500);
  }
  if (!memberships || memberships.length === 0) {
    return c.json({ ok: true, organizations: [] });
  }

  const orgIds = memberships.map((m) => m.organization_id);
  const { data: orgs, error: orgErr } = await db
    .from("organizations")
    .select("id, name, created_at")
    .in("id", orgIds)
    .order("name", { ascending: true });
  if (orgErr) {
    logEvent({
      level: "error",
      msg: "list organizations: orgs query failed",
      route: "GET /api/organizations",
      error: orgErr.message,
    });
    return c.json({ ok: false, message: "Failed to load organizations." }, 500);
  }

  const roleByOrgId = new Map(memberships.map((m) => [m.organization_id, m.role]));
  const organizations = (orgs ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    role: roleByOrgId.get(o.id) ?? "viewer",
    created_at: o.created_at,
  }));

  return c.json({ ok: true, organizations });
});
