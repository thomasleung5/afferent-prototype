/* Origin guard fixture.
 *
 * Run with: npm run test:ai-origin
 *
 * Exercises checkOrigin across the four cells of the decision table:
 *
 *                | dev (NODE_ENV != production) | production
 *   allowlist    | allow when Origin/Referer    | allow when Origin/Referer
 *   configured   |   matches; 403 otherwise     |   matches; 403 otherwise
 *   no allowlist | allow                        | 503 (fail closed)
 *
 * Plus the URL-normalization helpers parseAllowedOrigins and originOf. */

import assert from "node:assert/strict";
import {
  checkOrigin, originOf, parseAllowedOrigins,
} from "../aiOriginGuard";

// ── 1. parseAllowedOrigins — env normalization ───────────────────────────
{
  assert.deepEqual(parseAllowedOrigins(undefined), []);
  assert.deepEqual(parseAllowedOrigins(""), []);
  assert.deepEqual(parseAllowedOrigins("   "), []);
  assert.deepEqual(
    parseAllowedOrigins("https://app.example.com"),
    ["https://app.example.com"],
  );
  assert.deepEqual(
    parseAllowedOrigins("https://A.example.com/, ,  https://b.example.com  "),
    ["https://a.example.com", "https://b.example.com"],
    "lowercases, trims, drops empty entries, strips trailing slash",
  );
  console.log("  ✓ parseAllowedOrigins handles whitespace + casing + empties");
}

// ── 2. originOf — extract scheme+host from URL ───────────────────────────
{
  assert.equal(originOf("https://app.example.com/path?q=1"), "https://app.example.com");
  assert.equal(originOf("HTTPS://App.Example.com"), "https://app.example.com",
    "casing normalized");
  assert.equal(originOf("http://localhost:3000/anything"), "http://localhost:3000",
    "port preserved");
  assert.equal(originOf(null), null);
  assert.equal(originOf(""), null);
  assert.equal(originOf("not-a-url"), null,
    "unparseable strings → null, not exception");
  console.log("  ✓ originOf extracts scheme+host, returns null for junk");
}

// ── 3. No allowlist, dev → allow ─────────────────────────────────────────
{
  const d = checkOrigin({
    origin: null,
    referer: null,
    allowed: [],
    isProduction: false,
  });
  assert.equal(d.allow, true,
    "dev with no allowlist should be permissive — bare requests work locally");
  console.log("  ✓ no allowlist + dev → allow");
}

// ── 4. No allowlist, production → 503 (fail closed) ──────────────────────
{
  const d = checkOrigin({
    origin: "https://app.example.com",
    referer: null,
    allowed: [],
    isProduction: true,
  });
  assert.equal(d.allow, false);
  if (!d.allow) {
    assert.equal(d.status, 503,
      "production with no allowlist must fail closed");
    assert.match(d.message, /ALLOWED_ORIGINS/);
  }
  console.log("  ✓ no allowlist + production → 503");
}

// ── 5. Allowlist matches Origin → allow ──────────────────────────────────
{
  const d = checkOrigin({
    origin: "https://app.example.com",
    referer: null,
    allowed: ["https://app.example.com"],
    isProduction: true,
  });
  assert.equal(d.allow, true);
  console.log("  ✓ matching Origin → allow");
}

// ── 6. Origin mismatches → 403 ───────────────────────────────────────────
{
  const d = checkOrigin({
    origin: "https://evil.example.com",
    referer: null,
    allowed: ["https://app.example.com"],
    isProduction: false,
  });
  assert.equal(d.allow, false);
  if (!d.allow) assert.equal(d.status, 403);
  console.log("  ✓ mismatched Origin → 403");
}

// ── 7. No Origin, Referer falls back and matches → allow ─────────────────
{
  const d = checkOrigin({
    origin: null,
    referer: "https://app.example.com/build/services",
    allowed: ["https://app.example.com"],
    isProduction: false,
  });
  assert.equal(d.allow, true,
    "Referer should be consulted when Origin is absent (some clients omit it)");
  console.log("  ✓ Referer fallback when Origin missing");
}

// ── 8. Neither Origin nor Referer present → 403 ──────────────────────────
{
  const d = checkOrigin({
    origin: null,
    referer: null,
    allowed: ["https://app.example.com"],
    isProduction: false,
  });
  assert.equal(d.allow, false,
    "no derivable origin must reject when an allowlist is configured");
  if (!d.allow) assert.equal(d.status, 403);
  console.log("  ✓ no origin header → 403 when allowlist configured");
}

// ── 9. Trailing slashes + case differences shouldn't matter ──────────────
{
  const d = checkOrigin({
    origin: "https://App.Example.com",
    referer: null,
    allowed: parseAllowedOrigins("https://app.example.com/"),
    isProduction: false,
  });
  assert.equal(d.allow, true,
    "case + trailing-slash normalization keeps config tolerant");
  console.log("  ✓ case + trailing-slash tolerance");
}

console.log("\nAll aiOriginGuard assertions passed.");
