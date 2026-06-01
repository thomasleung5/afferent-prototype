/* Auth fixture for Supabase JWT verification + requireAuth middleware.
 *
 * Run with: npm run test:auth
 *
 * Mints test JWTs using `jose` with a known secret, drives the
 * `verifySupabaseJwt` helper across the meaningful failure modes,
 * and exercises the `requireAuth` Hono middleware end-to-end against
 * in-memory Requests.
 *
 * Covers the spec checklist:
 *   - missing auth → 401 JSON
 *   - invalid token → 401 JSON
 *   - valid token → next()  + user attached to context
 *   - /healthz remains public (it's registered before requireAuth)
 *   - dev bypass + env flag → allow, with synthetic user
 *   - JSON `{ ok: false, message }` error shape preserved */

import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { Hono } from "hono";
import { verifySupabaseJwt } from "../auth";
import {
  DEV_BYPASS_USER, devBypassEnabled, requireAuth, type AuthEnv,
} from "../requireAuth";

const TEST_SECRET = "test-secret-value-min-32-bytes-please-12345";
const secretBytes = new TextEncoder().encode(TEST_SECRET);

async function mintToken(claims: Record<string, unknown>, opts: { exp?: string } = {}): Promise<string> {
  return new SignJWT({ role: "authenticated", ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience("authenticated")
    .setExpirationTime(opts.exp ?? "1h")
    .setSubject(typeof claims.sub === "string" ? claims.sub : "user-1")
    .sign(secretBytes);
}

interface ReadBody { ok: boolean; message?: string }

async function main(): Promise<void> {
  // ── verifySupabaseJwt: missing token ──────────────────────────────────
  {
    const r = await verifySupabaseJwt({ authorization: null, jwtSecret: TEST_SECRET });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "no-token");
    console.log("  ✓ verifySupabaseJwt: no token → no-token");
  }

  // ── verifySupabaseJwt: not configured ─────────────────────────────────
  {
    const r = await verifySupabaseJwt({ authorization: "Bearer abc", jwtSecret: undefined });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "not-configured");
    console.log("  ✓ verifySupabaseJwt: missing secret → not-configured");
  }

  // ── verifySupabaseJwt: bad signature ──────────────────────────────────
  {
    const bogus = "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.signature";
    const r = await verifySupabaseJwt({ authorization: bogus, jwtSecret: TEST_SECRET });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "bad-token");
    console.log("  ✓ verifySupabaseJwt: bad signature → bad-token");
  }

  // ── verifySupabaseJwt: expired token ──────────────────────────────────
  {
    const past = Math.floor(Date.now() / 1000) - 60;
    const expired = await new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience("authenticated")
      .setSubject("user-1")
      .setExpirationTime(past)
      .sign(secretBytes);
    const r = await verifySupabaseJwt({ authorization: `Bearer ${expired}`, jwtSecret: TEST_SECRET });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "expired");
    console.log("  ✓ verifySupabaseJwt: expired → expired");
  }

  // ── verifySupabaseJwt: wrong audience ─────────────────────────────────
  {
    const wrongAud = await new SignJWT({ role: "service_role" })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience("other")
      .setSubject("user-1")
      .setExpirationTime("1h")
      .sign(secretBytes);
    const r = await verifySupabaseJwt({ authorization: `Bearer ${wrongAud}`, jwtSecret: TEST_SECRET });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "wrong-audience");
    console.log("  ✓ verifySupabaseJwt: wrong aud → wrong-audience");
  }

  // ── verifySupabaseJwt: happy path ─────────────────────────────────────
  {
    const token = await mintToken({ sub: "user-42", email: "ana@example.com" });
    const r = await verifySupabaseJwt({ authorization: `Bearer ${token}`, jwtSecret: TEST_SECRET });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.user.id, "user-42");
      assert.equal(r.user.email, "ana@example.com");
      assert.equal(r.user.role, "authenticated");
    }
    console.log("  ✓ verifySupabaseJwt: valid token → user payload");
  }

  // ── devBypassEnabled decision matrix ──────────────────────────────────
  {
    assert.equal(devBypassEnabled({ bypassFlag: "1", isProduction: false }), true);
    assert.equal(devBypassEnabled({ bypassFlag: "true", isProduction: false }), true);
    assert.equal(devBypassEnabled({ bypassFlag: "1", isProduction: true }), false,
      "dev bypass MUST NOT activate in production even with the flag set");
    assert.equal(devBypassEnabled({ bypassFlag: undefined, isProduction: false }), false);
    assert.equal(devBypassEnabled({ bypassFlag: "0", isProduction: false }), false);
    console.log("  ✓ devBypassEnabled: flag honored in dev only");
  }

  // ── End-to-end middleware tests ───────────────────────────────────────
  //   Build a tiny Hono app that mirrors the real wiring: /healthz public,
  //   /api/ai/parse-fees protected by requireAuth.

  const originalEnv = { ...process.env };
  function setEnv(vars: Record<string, string | undefined>) {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  function restoreEnv() {
    for (const k of Object.keys(process.env)) {
      if (!(k in originalEnv)) delete process.env[k];
    }
    Object.assign(process.env, originalEnv);
  }

  function makeApp() {
    const app = new Hono<AuthEnv>();
    app.get("/healthz", (c) => c.json({ ok: true }));
    app.use("/api/ai/*", requireAuth());
    app.post("/api/ai/parse-fees", (c) => {
      const user = c.get("user");
      return c.json({ ok: true, user });
    });
    return app;
  }

  async function readJsonBody(res: Response): Promise<ReadBody> {
    return res.json() as Promise<ReadBody>;
  }

  // /healthz remains public — registered before the middleware.
  {
    setEnv({ NODE_ENV: "production", SUPABASE_JWT_SECRET: TEST_SECRET, AUTH_DEV_BYPASS: undefined });
    const app = makeApp();
    const res = await app.request("/healthz");
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean };
    assert.equal(body.ok, true);
    restoreEnv();
    console.log("  ✓ /healthz remains public, no auth required");
  }

  // Missing auth header → 401 JSON.
  {
    setEnv({ NODE_ENV: "production", SUPABASE_JWT_SECRET: TEST_SECRET, AUTH_DEV_BYPASS: undefined });
    const app = makeApp();
    const res = await app.request("/api/ai/parse-fees", { method: "POST" });
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("content-type"), "application/json");
    const body = await readJsonBody(res);
    assert.equal(body.ok, false);
    assert.match(body.message ?? "", /Authentication/);
    restoreEnv();
    console.log("  ✓ missing auth → 401 JSON");
  }

  // Invalid token → 401 JSON.
  {
    setEnv({ NODE_ENV: "production", SUPABASE_JWT_SECRET: TEST_SECRET, AUTH_DEV_BYPASS: undefined });
    const app = makeApp();
    const res = await app.request("/api/ai/parse-fees", {
      method: "POST",
      headers: { Authorization: "Bearer not-a-real-jwt" },
    });
    assert.equal(res.status, 401);
    const body = await readJsonBody(res);
    assert.equal(body.ok, false);
    restoreEnv();
    console.log("  ✓ invalid token → 401 JSON");
  }

  // Valid token → request reaches the handler with user context attached.
  {
    setEnv({ NODE_ENV: "production", SUPABASE_JWT_SECRET: TEST_SECRET, AUTH_DEV_BYPASS: undefined });
    const token = await mintToken({ sub: "user-7", email: "carlos@city.gov" });
    const app = makeApp();
    const res = await app.request("/api/ai/parse-fees", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; user: { id: string; email?: string } };
    assert.equal(body.ok, true);
    assert.equal(body.user.id, "user-7");
    assert.equal(body.user.email, "carlos@city.gov");
    restoreEnv();
    console.log("  ✓ valid token → handler runs with user attached");
  }

  // Production + missing SUPABASE_JWT_SECRET → 503 (fail closed).
  {
    setEnv({ NODE_ENV: "production", SUPABASE_JWT_SECRET: undefined, AUTH_DEV_BYPASS: undefined });
    const app = makeApp();
    const res = await app.request("/api/ai/parse-fees", { method: "POST" });
    assert.equal(res.status, 503);
    const body = await readJsonBody(res);
    assert.match(body.message ?? "", /not configured/i);
    restoreEnv();
    console.log("  ✓ production + missing secret → 503 fail-closed");
  }

  // Dev bypass: NODE_ENV=development + AUTH_DEV_BYPASS=1 → synthetic user.
  {
    setEnv({ NODE_ENV: "development", SUPABASE_JWT_SECRET: undefined, AUTH_DEV_BYPASS: "1" });
    const app = makeApp();
    const res = await app.request("/api/ai/parse-fees", { method: "POST" });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; user: { id: string } };
    assert.equal(body.user.id, DEV_BYPASS_USER.id);
    restoreEnv();
    console.log("  ✓ dev bypass + non-prod → allow with synthetic user");
  }

  // Dev bypass NOT honored in production even with flag set.
  {
    setEnv({ NODE_ENV: "production", SUPABASE_JWT_SECRET: TEST_SECRET, AUTH_DEV_BYPASS: "1" });
    const app = makeApp();
    const res = await app.request("/api/ai/parse-fees", { method: "POST" });
    assert.equal(res.status, 401, "production must reject even with AUTH_DEV_BYPASS=1");
    restoreEnv();
    console.log("  ✓ dev bypass refuses to fire in production");
  }
}

main()
  .then(() => console.log("\nAll auth assertions passed."))
  .catch((err) => { console.error(err); process.exit(1); });
