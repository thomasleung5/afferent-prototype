/* Route-handler fixture for /api/organizations.
 *
 * Run with: npm run test:organizations-routes
 *
 * Drives the Hono router via app.request() with the DB client swapped
 * for the chainable mock. Covers:
 *
 *   - 503 when getDbClient() is null,
 *   - empty memberships → empty list,
 *   - happy path joins memberships with orgs and preserves the
 *     caller's role per-org. */

import assert from "node:assert/strict";
import { Hono } from "hono";
import type { Context, MiddlewareHandler, Next } from "hono";
import {
  resetDbClientProviderForTests, setDbClientProviderForTests,
} from "../db";
import { organizationsRoutes } from "../organizations";
import type { AuthEnv } from "../requireAuth";
import { createMockDb } from "./_supabaseMock";

const TEST_USER = { id: "00000000-0000-0000-0000-000000000001", email: "test@example.com" } as const;
const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function injectUser(): MiddlewareHandler<AuthEnv> {
  return async (c: Context<AuthEnv>, next: Next) => {
    c.set("user", { id: TEST_USER.id, email: TEST_USER.email });
    await next();
  };
}

function buildApp() {
  const app = new Hono<AuthEnv>();
  app.use("/api/organizations/*", injectUser());
  app.route("/api/organizations", organizationsRoutes);
  return app;
}

async function main(): Promise<void> {
  let passed = 0;
  const app = buildApp();

  // ── 503 when DB is not configured ──────────────────────────────
  {
    setDbClientProviderForTests(() => null);
    const res = await app.request("/api/organizations", { method: "GET" });
    assert.equal(res.status, 503);
    const body = await res.json() as { ok: boolean; message: string };
    assert.match(body.message, /not configured/i);
    passed++;
  }

  // ── No memberships → empty list ────────────────────────────────
  {
    const mock = createMockDb();
    mock.queueResponse("organization_members", { data: [], error: null });
    setDbClientProviderForTests(() => mock.client);
    const res = await app.request("/api/organizations", { method: "GET" });
    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; organizations: unknown[] };
    assert.equal(body.ok, true);
    assert.deepEqual(body.organizations, []);
    // The handler should NOT have queried `organizations` when the
    // membership list was empty.
    assert.equal(mock.calls.filter((c) => c.table === "organizations").length, 0);
    passed++;
  }

  // ── Happy path joins memberships with org rows + preserves role ─
  {
    const mock = createMockDb();
    mock.queueResponse("organization_members", {
      data: [
        { organization_id: ORG_A, role: "owner" },
        { organization_id: ORG_B, role: "viewer" },
      ],
      error: null,
    });
    mock.queueResponse("organizations", {
      data: [
        { id: ORG_A, name: "Los Altos Hills", created_at: "2026-01-01T00:00:00Z" },
        { id: ORG_B, name: "Goleta",          created_at: "2026-02-01T00:00:00Z" },
      ],
      error: null,
    });
    setDbClientProviderForTests(() => mock.client);
    const res = await app.request("/api/organizations", { method: "GET" });
    assert.equal(res.status, 200);
    const body = await res.json() as {
      ok: boolean;
      organizations: Array<{ id: string; name: string; role: string }>;
    };
    assert.equal(body.ok, true);
    assert.equal(body.organizations.length, 2);
    const byId = new Map(body.organizations.map((o) => [o.id, o]));
    assert.equal(byId.get(ORG_A)?.role, "owner");
    assert.equal(byId.get(ORG_A)?.name, "Los Altos Hills");
    assert.equal(byId.get(ORG_B)?.role, "viewer");
    // Verify the second query was scoped by the membership ids.
    const orgsCall = mock.calls.find((c) => c.table === "organizations");
    const inFilter = orgsCall?.filters.find((f) => f.kind === "in");
    assert.deepEqual(inFilter?.args, ["id", [ORG_A, ORG_B]]);
    passed++;
  }

  // ── Membership query errors → 500 ──────────────────────────────
  {
    const mock = createMockDb();
    mock.queueResponse("organization_members", {
      data: null, error: { message: "db down" },
    });
    setDbClientProviderForTests(() => mock.client);
    const res = await app.request("/api/organizations", { method: "GET" });
    assert.equal(res.status, 500);
    const body = await res.json() as { ok: boolean; message: string };
    assert.match(body.message, /Failed to load organizations/i);
    passed++;
  }

  resetDbClientProviderForTests();
  console.log(`PASS: organizationsRoutes.fixture — ${passed} cases`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
