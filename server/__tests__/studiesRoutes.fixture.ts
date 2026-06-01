/* Route-handler fixture for /api/studies/*.
 *
 * Run with: npm run test:studies-routes
 *
 * Drives the Hono router via app.request() with the DB client swapped
 * for the chainable mock in _supabaseMock.ts. Covers the path-shaping
 * branches the pure validators / authorization fixtures can't reach:
 *
 *   - 503 when getDbClient() returns null (env unconfigured),
 *   - happy-path list / create / get / save / version flows,
 *   - forbidden for viewer when creating a study,
 *   - 404 when the study lookup misses,
 *   - 422 when the snapshot body fails validation,
 *   - audit-event insert fires after each state-changing write. */

import assert from "node:assert/strict";
import { Hono } from "hono";
import type { Context, MiddlewareHandler, Next } from "hono";
import {
  resetDbClientProviderForTests, setDbClientProviderForTests,
} from "../db";
import type { AuthEnv } from "../requireAuth";
import { studiesRoutes } from "../studies";
import { createMockDb } from "./_supabaseMock";

const TEST_USER = { id: "00000000-0000-0000-0000-000000000001", email: "test@example.com" } as const;
const STUDY_A_ID = "11111111-1111-1111-1111-111111111111";
const ORG_A_ID = "22222222-2222-2222-2222-222222222222";

// Tiny middleware that injects a fixture user — stands in for
// requireAuth() so we exercise the handler logic without minting JWTs.
function injectUser(): MiddlewareHandler<AuthEnv> {
  return async (c: Context<AuthEnv>, next: Next) => {
    c.set("user", { id: TEST_USER.id, email: TEST_USER.email });
    await next();
  };
}

function buildApp() {
  const app = new Hono<AuthEnv>();
  app.use("/api/studies/*", injectUser());
  app.route("/api/studies", studiesRoutes);
  return app;
}

const VALID_SNAPSHOT = {
  services: [], operating: [], productiveHours: [],
  studyContext: { cityId: "x", fiscalYear: "FY 2025-26" },
  activeFiscalYear: "FY 2025-26",
};

async function main(): Promise<void> {
  let passed = 0;
  const app = buildApp();

  // ── 503 when DB is not configured ──────────────────────────────
  {
    setDbClientProviderForTests(() => null);
    const res = await app.request("/api/studies", { method: "GET" });
    assert.equal(res.status, 503);
    const body = await res.json() as { ok: boolean; message: string };
    assert.equal(body.ok, false);
    assert.match(body.message, /not configured/i);
    passed++;
  }

  // ── GET / — empty memberships → empty list ─────────────────────
  {
    const mock = createMockDb();
    mock.queueResponse("organization_members", { data: [], error: null });
    setDbClientProviderForTests(() => mock.client);
    const res = await app.request("/api/studies", { method: "GET" });
    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; studies: unknown[] };
    assert.equal(body.ok, true);
    assert.deepEqual(body.studies, []);
    passed++;
  }

  // ── GET / — memberships + studies happy path ───────────────────
  {
    const mock = createMockDb();
    mock.queueResponse("organization_members", {
      data: [{ organization_id: ORG_A_ID, role: "owner" }],
      error: null,
    });
    mock.queueResponse("studies", {
      data: [{
        id: STUDY_A_ID, organization_id: ORG_A_ID, name: "FY26 Fee Study",
        fiscal_year: "FY 2025-26", created_by: TEST_USER.id,
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-15T00:00:00Z",
        archived_at: null,
      }],
      error: null,
    });
    setDbClientProviderForTests(() => mock.client);
    const res = await app.request("/api/studies", { method: "GET" });
    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; studies: Array<{ id: string; name: string }> };
    assert.equal(body.ok, true);
    assert.equal(body.studies.length, 1);
    assert.equal(body.studies[0].id, STUDY_A_ID);
    // Verify the handler scoped the query by user_id + filtered the
    // study list by the owned org.
    const memCall = mock.calls.find((c) => c.table === "organization_members");
    assert.ok(memCall?.filters.some((f) => f.kind === "eq" && f.args[0] === "user_id" && f.args[1] === TEST_USER.id));
    const studiesCall = mock.calls.find((c) => c.table === "studies");
    assert.ok(studiesCall?.filters.some((f) => f.kind === "in" && f.args[0] === "organization_id"));
    passed++;
  }

  // ── POST / — viewer is forbidden ───────────────────────────────
  {
    const mock = createMockDb();
    // Role lookup for the target org returns viewer.
    mock.queueResponse("organization_members", {
      data: { role: "viewer" },
      error: null,
    });
    setDbClientProviderForTests(() => mock.client);
    const res = await app.request("/api/studies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId: ORG_A_ID, name: "Read-only attempt" }),
    });
    assert.equal(res.status, 403);
    const body = await res.json() as { ok: boolean; message: string };
    assert.equal(body.ok, false);
    assert.match(body.message, /don't have permission/i);
    // Handler stopped after the role lookup — no insert was attempted.
    assert.equal(
      mock.calls.filter((c) => c.table === "studies" && c.op === "insert").length,
      0,
    );
    passed++;
  }

  // ── POST / — analyst happy path ───────────────────────────────
  {
    const mock = createMockDb();
    mock.queueResponse("organization_members", {
      data: { role: "analyst" }, error: null,
    });
    mock.queueResponse("studies", {
      data: {
        id: STUDY_A_ID, organization_id: ORG_A_ID, name: "FY27 Fee Study",
        fiscal_year: "FY 2026-27", created_by: TEST_USER.id,
        created_at: "2026-06-01T00:00:00Z",
        updated_at: "2026-06-01T00:00:00Z",
        archived_at: null,
      },
      error: null,
    });
    mock.queueResponse("study_audit_events", { data: null, error: null });
    setDbClientProviderForTests(() => mock.client);
    const res = await app.request("/api/studies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizationId: ORG_A_ID,
        name: "FY27 Fee Study",
        fiscalYear: "FY 2026-27",
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json() as { ok: boolean; study: { id: string } };
    assert.equal(body.ok, true);
    assert.equal(body.study.id, STUDY_A_ID);
    // Audit event was inserted with the actor id.
    const auditCall = mock.calls.find((c) => c.table === "study_audit_events");
    const auditPayload = auditCall?.payload as { event_type?: string; actor_user_id?: string } | undefined;
    assert.equal(auditPayload?.event_type, "study.created");
    assert.equal(auditPayload?.actor_user_id, TEST_USER.id);
    passed++;
  }

  // ── POST / — body validation 422 ──────────────────────────────
  {
    setDbClientProviderForTests(() => createMockDb().client);
    const res = await app.request("/api/studies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId: "not-a-uuid", name: "x" }),
    });
    assert.equal(res.status, 422);
    const body = await res.json() as { ok: boolean; message: string };
    assert.match(body.message, /UUID/i);
    passed++;
  }

  // ── GET /:id — non-UUID 400 ───────────────────────────────────
  {
    setDbClientProviderForTests(() => createMockDb().client);
    const res = await app.request("/api/studies/not-uuid", { method: "GET" });
    assert.equal(res.status, 400);
    const body = await res.json() as { ok: boolean; message: string };
    assert.match(body.message, /must be a UUID/i);
    passed++;
  }

  // ── GET /:id — study not found ────────────────────────────────
  {
    const mock = createMockDb();
    mock.queueResponse("studies", { data: null, error: null });
    setDbClientProviderForTests(() => mock.client);
    const res = await app.request(`/api/studies/${STUDY_A_ID}`, { method: "GET" });
    assert.equal(res.status, 404);
    const body = await res.json() as { ok: boolean; message: string };
    assert.match(body.message, /not found/i);
    passed++;
  }

  // ── GET /:id — happy path returns study + draft ──────────────
  {
    const mock = createMockDb();
    // lookupRoleForStudy: studies lookup → membership role.
    mock.queueResponse("studies", {
      data: { id: STUDY_A_ID, organization_id: ORG_A_ID }, error: null,
    });
    mock.queueResponse("organization_members", {
      data: { role: "owner" }, error: null,
    });
    // Main study row read.
    mock.queueResponse("studies", {
      data: {
        id: STUDY_A_ID, organization_id: ORG_A_ID, name: "FY26",
        fiscal_year: "FY 2025-26", created_by: TEST_USER.id,
        created_at: "x", updated_at: "y", archived_at: null,
      },
      error: null,
    });
    // Draft row.
    mock.queueResponse("study_drafts", {
      data: { snapshot: VALID_SNAPSHOT, updated_by: TEST_USER.id, updated_at: "z" },
      error: null,
    });
    setDbClientProviderForTests(() => mock.client);
    const res = await app.request(`/api/studies/${STUDY_A_ID}`, { method: "GET" });
    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; study: { id: string }; draft: { snapshot: unknown } | null };
    assert.equal(body.ok, true);
    assert.equal(body.study.id, STUDY_A_ID);
    assert.ok(body.draft);
    passed++;
  }

  // ── PUT /:id/snapshot — invalid payload 422 ──────────────────
  {
    setDbClientProviderForTests(() => createMockDb().client);
    const res = await app.request(`/api/studies/${STUDY_A_ID}/snapshot`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshot: { random: 1 } }),  // no canonical field
    });
    assert.equal(res.status, 422);
    const body = await res.json() as { ok: boolean; message: string };
    assert.match(body.message, /does not look like a BuildSnapshot/);
    passed++;
  }

  // ── PUT /:id/snapshot — happy path upserts + audits ──────────
  {
    const mock = createMockDb();
    // lookupRoleForStudy.
    mock.queueResponse("studies", {
      data: { id: STUDY_A_ID, organization_id: ORG_A_ID }, error: null,
    });
    mock.queueResponse("organization_members", {
      data: { role: "owner" }, error: null,
    });
    // study_drafts upsert.
    mock.queueResponse("study_drafts", { data: null, error: null });
    // studies updated_at bump.
    mock.queueResponse("studies", { data: null, error: null });
    // audit event.
    mock.queueResponse("study_audit_events", { data: null, error: null });
    setDbClientProviderForTests(() => mock.client);
    const res = await app.request(`/api/studies/${STUDY_A_ID}/snapshot`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshot: VALID_SNAPSHOT }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean };
    assert.equal(body.ok, true);
    // Upsert was actually issued with the user_id and the snapshot.
    const upsert = mock.calls.find((c) => c.table === "study_drafts" && c.op === "upsert");
    const payload = upsert?.payload as { study_id: string; updated_by: string; snapshot: unknown } | undefined;
    assert.equal(payload?.study_id, STUDY_A_ID);
    assert.equal(payload?.updated_by, TEST_USER.id);
    assert.ok(payload?.snapshot);
    // Audit recorded.
    const audit = mock.calls.find((c) => c.table === "study_audit_events");
    const auditPayload = audit?.payload as { event_type?: string };
    assert.equal(auditPayload?.event_type, "draft.upsert");
    passed++;
  }

  // ── POST /:id/versions — uses current draft when snapshot omitted ─
  {
    const mock = createMockDb();
    // lookupRoleForStudy.
    mock.queueResponse("studies", {
      data: { id: STUDY_A_ID, organization_id: ORG_A_ID }, error: null,
    });
    mock.queueResponse("organization_members", {
      data: { role: "analyst" }, error: null,
    });
    // study_drafts.select(snapshot)
    mock.queueResponse("study_drafts", { data: { snapshot: VALID_SNAPSHOT }, error: null });
    // study_versions.select max(version_number)
    mock.queueResponse("study_versions", { data: [{ version_number: 3 }], error: null });
    // study_versions.insert
    mock.queueResponse("study_versions", {
      data: {
        id: "33333333-3333-3333-3333-333333333333",
        study_id: STUDY_A_ID, version_number: 4, label: "Mid-year",
        status: "draft", notes: null, created_by: TEST_USER.id,
        created_at: "2026-06-01T00:00:00Z",
      },
      error: null,
    });
    // audit
    mock.queueResponse("study_audit_events", { data: null, error: null });
    setDbClientProviderForTests(() => mock.client);
    const res = await app.request(`/api/studies/${STUDY_A_ID}/versions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "Mid-year" }),
    });
    assert.equal(res.status, 201);
    const body = await res.json() as { ok: boolean; version: { version_number: number; label: string } };
    assert.equal(body.ok, true);
    assert.equal(body.version.version_number, 4);
    assert.equal(body.version.label, "Mid-year");
    const insertCall = mock.calls.find((c) => c.table === "study_versions" && c.op === "insert");
    const payload = insertCall?.payload as { version_number: number; created_by: string };
    assert.equal(payload.version_number, 4);
    assert.equal(payload.created_by, TEST_USER.id);
    passed++;
  }

  // ── POST /:id/versions — no snapshot AND no draft → 422 ──────
  {
    const mock = createMockDb();
    mock.queueResponse("studies", {
      data: { id: STUDY_A_ID, organization_id: ORG_A_ID }, error: null,
    });
    mock.queueResponse("organization_members", {
      data: { role: "owner" }, error: null,
    });
    mock.queueResponse("study_drafts", { data: null, error: null });
    setDbClientProviderForTests(() => mock.client);
    const res = await app.request(`/api/studies/${STUDY_A_ID}/versions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "Cut" }),
    });
    assert.equal(res.status, 422);
    const body = await res.json() as { ok: boolean; message: string };
    assert.match(body.message, /no draft exists/i);
    passed++;
  }

  resetDbClientProviderForTests();
  console.log(`PASS: studiesRoutes.fixture — ${passed} cases`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
