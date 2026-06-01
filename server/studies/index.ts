/* Hono route module for /api/studies/*.
 *
 * Mounted from server/index.ts behind the same protected middleware
 * chain as /api/ai/* and /api/import/* (CORS, origin guard, Supabase
 * JWT auth, body cap). No AI rate limit on this surface — cheap DB
 * ops shouldn't share a quota with expensive Anthropic round-trips.
 *
 * Authorization model:
 *   - requireAuth() populates c.var.user with the verified user id.
 *   - Each handler looks up the caller's organization_members.role
 *     for the relevant study (or org for create) and gates via the
 *     pure helpers in ./authorization.ts.
 *   - Service-role key under the hood bypasses RLS by design; the
 *     RLS policies in the migration are defense-in-depth + the
 *     contract for any future direct-PostgREST read path.
 *
 * Audit:
 *   - Every state-changing endpoint inserts a study_audit_events row
 *     after the primary write. Failures are logged but do not roll
 *     back the user-visible response.
 *
 * Response shape: { ok: true, ... } on success / { ok: false, message }
 * on failure, matching the rest of the API surface. */

import { Hono } from "hono";
import type { Context } from "hono";
import { getAuthUser, type AuthEnv } from "../requireAuth";
import { getDbClient } from "../db";
import { logEvent } from "../logger";
import {
  canCreateStudy, canCreateVersion, canMutateDraft, canRead, isValidRole,
} from "./authorization";
import {
  isUuid,
  validateCreateStudy, validateCreateVersion, validateSnapshotPayload,
} from "./validators";

/** Default snapshot body cap (MB). Override via STUDY_SNAPSHOT_MAX_MB. */
const DEFAULT_SNAPSHOT_MAX_MB = 5;

/** Resolve the snapshot body cap, with env override and a safe floor. */
export function resolveStudySnapshotMaxBytes(): number {
  const raw = process.env.STUDY_SNAPSHOT_MAX_MB;
  const parsed = raw != null ? Number(raw) : NaN;
  const mb = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SNAPSHOT_MAX_MB;
  return Math.floor(mb * 1024 * 1024);
}

function notConfigured(c: Context<AuthEnv>) {
  return c.json(
    { ok: false, message: "Study persistence is not configured on this server." },
    503,
  );
}

function badRequest(c: Context<AuthEnv>, message: string, status: 400 | 422 = 422) {
  return c.json({ ok: false, message }, status);
}

function forbidden(c: Context<AuthEnv>, message = "You don't have permission to perform that action.") {
  return c.json({ ok: false, message }, 403);
}

function notFound(c: Context<AuthEnv>, message = "Not found.") {
  return c.json({ ok: false, message }, 404);
}

function serverError(c: Context<AuthEnv>, route: string, detail: string) {
  logEvent({
    level: "error",
    msg: "studies handler failure",
    route,
    error: detail,
  });
  return c.json({ ok: false, message: "Internal server error." }, 500);
}

/** Best-effort audit-event insert. Logs on failure but does not throw —
 *  audit failures shouldn't block the user-visible write that just
 *  succeeded. */
async function recordAuditEvent(args: {
  studyId: string;
  eventType: string;
  payload: Record<string, unknown> | null;
  actorUserId: string;
}): Promise<void> {
  const db = getDbClient();
  if (!db) return;
  const { error } = await db.from("study_audit_events").insert({
    study_id: args.studyId,
    event_type: args.eventType,
    payload: args.payload,
    actor_user_id: args.actorUserId,
  });
  if (error) {
    logEvent({
      level: "warn",
      msg: "audit event insert failed",
      study_id: args.studyId,
      event_type: args.eventType,
      error: error.message,
    });
  }
}

/** Look up the caller's role within the org that owns a given study.
 *  Returns null on any miss (study not found, no membership, etc.) —
 *  the handler decides whether that's a 404 or 403. */
async function lookupRoleForStudy(
  studyId: string,
  userId: string,
): Promise<{ role: string; organizationId: string } | null> {
  const db = getDbClient();
  if (!db) return null;
  const { data: study } = await db
    .from("studies")
    .select("id, organization_id")
    .eq("id", studyId)
    .maybeSingle();
  if (!study) return null;
  const { data: member } = await db
    .from("organization_members")
    .select("role")
    .eq("organization_id", study.organization_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member || !isValidRole(member.role)) return null;
  return { role: member.role, organizationId: study.organization_id };
}

export const studiesRoutes = new Hono<AuthEnv>();

// ====================================================================
// GET /api/studies — list studies visible to the caller
// ====================================================================

studiesRoutes.get("/", async (c) => {
  const db = getDbClient();
  if (!db) return notConfigured(c);
  const user = getAuthUser(c);

  const { data: memberships, error: memErr } = await db
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id);
  if (memErr) return serverError(c, "GET /api/studies", memErr.message);

  const orgIds = (memberships ?? [])
    .filter((m) => canRead(m.role))
    .map((m) => m.organization_id);
  if (orgIds.length === 0) {
    return c.json({ ok: true, studies: [] });
  }

  const { data: studies, error } = await db
    .from("studies")
    .select("id, organization_id, name, fiscal_year, created_by, created_at, updated_at, archived_at")
    .in("organization_id", orgIds)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) return serverError(c, "GET /api/studies", error.message);

  return c.json({ ok: true, studies: studies ?? [] });
});

// ====================================================================
// POST /api/studies — create a study
// ====================================================================

studiesRoutes.post("/", async (c) => {
  const db = getDbClient();
  if (!db) return notConfigured(c);
  const user = getAuthUser(c);

  const body = await c.req.json().catch(() => null);
  const validation = validateCreateStudy(body);
  if (!validation.ok) return badRequest(c, validation.message);
  const input = validation.value;

  // Authorization: caller must hold an authorized role in the target org.
  const { data: member } = await db
    .from("organization_members")
    .select("role")
    .eq("organization_id", input.organizationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member || !canCreateStudy(member.role)) {
    return forbidden(c, "You don't have permission to create studies in this organization.");
  }

  const { data: created, error } = await db
    .from("studies")
    .insert({
      organization_id: input.organizationId,
      name: input.name,
      fiscal_year: input.fiscalYear ?? null,
      created_by: user.id,
    })
    .select("id, organization_id, name, fiscal_year, created_by, created_at, updated_at, archived_at")
    .single();
  if (error || !created) {
    return serverError(c, "POST /api/studies", error?.message ?? "insert returned no row");
  }

  await recordAuditEvent({
    studyId: created.id,
    eventType: "study.created",
    payload: { name: created.name, fiscal_year: created.fiscal_year },
    actorUserId: user.id,
  });

  return c.json({ ok: true, study: created }, 201);
});

// ====================================================================
// GET /api/studies/:id — load study metadata + current draft
// ====================================================================

studiesRoutes.get("/:id", async (c) => {
  const db = getDbClient();
  if (!db) return notConfigured(c);
  const user = getAuthUser(c);

  const id = c.req.param("id");
  if (!isUuid(id)) return badRequest(c, "Study id must be a UUID.", 400);

  const lookup = await lookupRoleForStudy(id, user.id);
  if (!lookup) return notFound(c, "Study not found.");
  if (!canRead(lookup.role)) return forbidden(c);

  const { data: study, error: studyErr } = await db
    .from("studies")
    .select("id, organization_id, name, fiscal_year, created_by, created_at, updated_at, archived_at")
    .eq("id", id)
    .single();
  if (studyErr || !study) return notFound(c, "Study not found.");

  const { data: draft } = await db
    .from("study_drafts")
    .select("snapshot, updated_by, updated_at")
    .eq("study_id", id)
    .maybeSingle();

  return c.json({ ok: true, study, draft: draft ?? null });
});

// ====================================================================
// PUT /api/studies/:id/snapshot — upsert the current draft
// ====================================================================

studiesRoutes.put("/:id/snapshot", async (c) => {
  const db = getDbClient();
  if (!db) return notConfigured(c);
  const user = getAuthUser(c);

  const id = c.req.param("id");
  if (!isUuid(id)) return badRequest(c, "Study id must be a UUID.", 400);

  const body = await c.req.json().catch(() => null);
  const validation = validateSnapshotPayload(body);
  if (!validation.ok) return badRequest(c, validation.message);

  const lookup = await lookupRoleForStudy(id, user.id);
  if (!lookup) return notFound(c, "Study not found.");
  if (!canMutateDraft(lookup.role)) {
    return forbidden(c, "You don't have permission to edit this study.");
  }

  const { error } = await db
    .from("study_drafts")
    .upsert(
      {
        study_id: id,
        snapshot: validation.value.snapshot,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "study_id" },
    );
  if (error) {
    return serverError(c, "PUT /api/studies/:id/snapshot", error.message);
  }

  // Bump the study's updated_at as well so list views sort sensibly.
  await db.from("studies").update({ updated_at: new Date().toISOString() }).eq("id", id);

  await recordAuditEvent({
    studyId: id,
    eventType: "draft.upsert",
    payload: null,
    actorUserId: user.id,
  });

  return c.json({ ok: true });
});

// ====================================================================
// GET /api/studies/:id/versions — list versions
// ====================================================================

studiesRoutes.get("/:id/versions", async (c) => {
  const db = getDbClient();
  if (!db) return notConfigured(c);
  const user = getAuthUser(c);

  const id = c.req.param("id");
  if (!isUuid(id)) return badRequest(c, "Study id must be a UUID.", 400);

  const lookup = await lookupRoleForStudy(id, user.id);
  if (!lookup) return notFound(c, "Study not found.");
  if (!canRead(lookup.role)) return forbidden(c);

  const { data: versions, error } = await db
    .from("study_versions")
    .select("id, study_id, version_number, label, status, notes, created_by, created_at")
    .eq("study_id", id)
    .order("version_number", { ascending: false });
  if (error) return serverError(c, "GET /api/studies/:id/versions", error.message);

  return c.json({ ok: true, versions: versions ?? [] });
});

// ====================================================================
// POST /api/studies/:id/versions — create an immutable version
// ====================================================================

studiesRoutes.post("/:id/versions", async (c) => {
  const db = getDbClient();
  if (!db) return notConfigured(c);
  const user = getAuthUser(c);

  const id = c.req.param("id");
  if (!isUuid(id)) return badRequest(c, "Study id must be a UUID.", 400);

  const body = await c.req.json().catch(() => null);
  const validation = validateCreateVersion(body);
  if (!validation.ok) return badRequest(c, validation.message);
  const input = validation.value;

  const lookup = await lookupRoleForStudy(id, user.id);
  if (!lookup) return notFound(c, "Study not found.");
  if (!canCreateVersion(lookup.role)) {
    return forbidden(c, "You don't have permission to create versions for this study.");
  }

  // Resolve the snapshot. Explicit payload wins; otherwise read the
  // current draft. Reject if neither is available.
  let snapshot: Record<string, unknown> | null = input.snapshot ?? null;
  if (!snapshot) {
    const { data: draft } = await db
      .from("study_drafts")
      .select("snapshot")
      .eq("study_id", id)
      .maybeSingle();
    if (!draft) {
      return badRequest(c, "No snapshot supplied and no draft exists for this study.");
    }
    snapshot = draft.snapshot as Record<string, unknown>;
  }

  // Next version_number = max(existing) + 1. Done in a single query;
  // the (study_id, version_number) unique constraint catches concurrent
  // inserts and the caller can retry.
  const { data: existing, error: existingErr } = await db
    .from("study_versions")
    .select("version_number")
    .eq("study_id", id)
    .order("version_number", { ascending: false })
    .limit(1);
  if (existingErr) {
    return serverError(c, "POST /api/studies/:id/versions", existingErr.message);
  }
  const nextVersion = (existing?.[0]?.version_number ?? 0) + 1;

  const { data: inserted, error } = await db
    .from("study_versions")
    .insert({
      study_id: id,
      version_number: nextVersion,
      label: input.label,
      status: input.status,
      notes: input.notes ?? null,
      snapshot,
      created_by: user.id,
    })
    .select("id, study_id, version_number, label, status, notes, created_by, created_at")
    .single();
  if (error || !inserted) {
    return serverError(c, "POST /api/studies/:id/versions", error?.message ?? "insert returned no row");
  }

  await recordAuditEvent({
    studyId: id,
    eventType: "version.created",
    payload: { version_number: inserted.version_number, label: inserted.label, status: inserted.status },
    actorUserId: user.id,
  });

  return c.json({ ok: true, version: inserted }, 201);
});
