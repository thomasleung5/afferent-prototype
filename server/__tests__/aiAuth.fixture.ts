/* Auth-gate fixture.
 *
 * Run with: npm run test:ai-auth
 *
 * Exercises checkBearerAuth across the four meaningful cells of the
 * decision table:
 *
 *                | dev (NODE_ENV != production) | production
 *   no token     | allow                        | 503 (fail closed)
 *   token set    | allow when bearer matches    | allow when bearer matches
 *                | 401 otherwise                | 401 otherwise
 *
 * Plus readBearer header parsing (case-insensitive scheme, whitespace
 * trimming) and constant-time mismatch detection on length-equal
 * inputs. */

import assert from "node:assert/strict";
import { checkBearerAuth, readBearer } from "../aiAuth";

// ── 1. No token, dev → allow ─────────────────────────────────────────────
{
  const d = checkBearerAuth({
    authorization: null,
    envToken: undefined,
    isProduction: false,
  });
  assert.equal(d.allow, true,
    "dev without AI_API_TOKEN should be permissive — local dev with no env should just work");
  console.log("  ✓ no token + dev → allow");
}

// ── 2. No token, production → 503 (fail closed) ──────────────────────────
{
  const d = checkBearerAuth({
    authorization: "Bearer anything",
    envToken: undefined,
    isProduction: true,
  });
  assert.equal(d.allow, false);
  if (!d.allow) {
    assert.equal(d.status, 503,
      "production without AI_API_TOKEN must fail closed, not silently accept");
    assert.match(d.message, /production/);
  }
  console.log("  ✓ no token + production → 503");
}

// ── 3. Token set, matching bearer → allow ────────────────────────────────
{
  const d = checkBearerAuth({
    authorization: "Bearer secret-123",
    envToken: "secret-123",
    isProduction: true,
  });
  assert.equal(d.allow, true);
  console.log("  ✓ matching bearer → allow");
}

// ── 4. Token set, mismatched bearer → 401 ────────────────────────────────
{
  const d = checkBearerAuth({
    authorization: "Bearer wrong-token",
    envToken: "secret-123",
    isProduction: true,
  });
  assert.equal(d.allow, false);
  if (!d.allow) assert.equal(d.status, 401);
  console.log("  ✓ mismatched bearer → 401");
}

// ── 5. Token set, missing header → 401 ───────────────────────────────────
{
  const d = checkBearerAuth({
    authorization: null,
    envToken: "secret-123",
    isProduction: false,
  });
  assert.equal(d.allow, false);
  if (!d.allow) assert.equal(d.status, 401);
  console.log("  ✓ missing Authorization header → 401");
}

// ── 6. Token set, non-Bearer scheme → 401 ────────────────────────────────
{
  const d = checkBearerAuth({
    authorization: "Basic Zm9vOmJhcg==",
    envToken: "secret-123",
    isProduction: false,
  });
  assert.equal(d.allow, false);
  if (!d.allow) assert.equal(d.status, 401);
  console.log("  ✓ non-Bearer scheme → 401");
}

// ── 7. Token set, length-equal mismatch → 401 (constant-time check) ──────
{
  // Both 10 chars — exercises the byte-level loop in constantTimeEqual.
  const d = checkBearerAuth({
    authorization: "Bearer wrongstuff",
    envToken: "rightstuff",
    isProduction: false,
  });
  assert.equal(d.allow, false,
    "length-equal mismatch should still be rejected by the byte loop");
  console.log("  ✓ length-equal mismatch → 401");
}

// ── 8. Empty / whitespace token treated as unset ─────────────────────────
{
  const d = checkBearerAuth({
    authorization: null,
    envToken: "   ",
    isProduction: false,
  });
  assert.equal(d.allow, true,
    "whitespace-only AI_API_TOKEN should fall back to unset semantics");
  console.log("  ✓ whitespace-only token treated as unset");
}

// ── 9. readBearer — header parsing ────────────────────────────────────────
{
  assert.equal(readBearer("Bearer abc"), "abc");
  assert.equal(readBearer("bearer xyz"), "xyz",
    "scheme is case-insensitive per RFC 6750");
  assert.equal(readBearer("  Bearer   spacedheader  "), "spacedheader",
    "leading/trailing whitespace stripped");
  assert.equal(readBearer("Basic Zm9v"), null);
  assert.equal(readBearer(""), null);
  assert.equal(readBearer(null), null);
  assert.equal(readBearer(undefined), null);
  console.log("  ✓ readBearer parses Bearer scheme, returns null otherwise");
}

console.log("\nAll aiAuth assertions passed.");
