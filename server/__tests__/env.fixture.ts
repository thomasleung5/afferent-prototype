/* Fixture for the production env validator.
 *
 * Run with: npm run test:env
 *
 * Covers:
 *   - dev mode is always ok (no required vars).
 *   - prod fully unset → ok=false, both vars in `missing`.
 *   - prod partially set → only the unset one in `missing`.
 *   - blank-string values count as missing (whitespace stripped).
 *   - prod fully configured → ok=true.
 *   - aiEnabled flag follows ANTHROPIC_API_KEY presence.
 *   - ensureValidOrExit exits non-zero on failure / no-op on success. */

import assert from "node:assert/strict";
import { validateEnv, ensureValidOrExit, logEnvSummary } from "../env";

let passed = 0;

// Dev mode — empty env is fine.
{
  const r = validateEnv({ NODE_ENV: "development" });
  assert.equal(r.ok, true, "dev mode should be ok");
  assert.equal(r.isProduction, false);
  assert.deepEqual(r.missing, []);
  passed++;
}

// No NODE_ENV → treated as non-prod.
{
  const r = validateEnv({});
  assert.equal(r.ok, true, "no NODE_ENV is treated as dev");
  assert.equal(r.isProduction, false);
  passed++;
}

// Prod with nothing set → both vars missing.
{
  const r = validateEnv({ NODE_ENV: "production" });
  assert.equal(r.ok, false);
  assert.equal(r.isProduction, true);
  assert.deepEqual(r.missing.sort(), ["ALLOWED_ORIGINS", "SUPABASE_URL"]);
  passed++;
}

// Prod with only SUPABASE_URL.
{
  const r = validateEnv({
    NODE_ENV: "production",
    SUPABASE_URL: "https://x.supabase.co",
  });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ["ALLOWED_ORIGINS"]);
  passed++;
}

// Prod with blank string values → treated as missing.
{
  const r = validateEnv({
    NODE_ENV: "production",
    SUPABASE_URL: "   ",
    ALLOWED_ORIGINS: "",
  });
  assert.equal(r.ok, false);
  assert.equal(r.missing.length, 2);
  passed++;
}

// Prod fully configured.
{
  const r = validateEnv({
    NODE_ENV: "production",
    SUPABASE_URL: "https://x.supabase.co",
    ALLOWED_ORIGINS: "https://app.example",
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.missing, []);
  passed++;
}

// AI enabled detection — present, non-blank.
{
  const r = validateEnv({
    NODE_ENV: "development",
    ANTHROPIC_API_KEY: "sk-ant-test",
  });
  assert.equal(r.aiEnabled, true);
  passed++;
}

// AI disabled — blank key.
{
  const r = validateEnv({
    NODE_ENV: "development",
    ANTHROPIC_API_KEY: "",
  });
  assert.equal(r.aiEnabled, false);
  passed++;
}

// AI disabled — unset key.
{
  const r = validateEnv({ NODE_ENV: "development" });
  assert.equal(r.aiEnabled, false);
  passed++;
}

// ensureValidOrExit — passes through on ok=true.
{
  let exited = false;
  ensureValidOrExit(
    { ok: true, isProduction: true, missing: [], aiEnabled: false },
    () => { /* silenced */ },
    (() => { exited = true; }) as never,
  );
  assert.equal(exited, false, "should not exit on ok=true");
  passed++;
}

// ensureValidOrExit — exits 1 on ok=false.
{
  let exitCode: number | null = null;
  const errLines: string[] = [];
  ensureValidOrExit(
    {
      ok: false,
      isProduction: true,
      missing: ["SUPABASE_URL", "ALLOWED_ORIGINS"],
      aiEnabled: false,
    },
    (s) => errLines.push(s),
    ((code: number) => { exitCode = code; }) as never,
  );
  assert.equal(exitCode, 1, "should exit 1");
  assert.equal(errLines.length, 3, "should print 3 stderr lines");
  assert.ok(errLines[0].includes("SUPABASE_URL"), "first line names missing vars");
  assert.ok(errLines[0].includes("ALLOWED_ORIGINS"), "first line names missing vars");
  passed++;
}

// logEnvSummary — formats mode + ai status.
{
  const lines: string[] = [];
  logEnvSummary(
    { ok: true, isProduction: true, missing: [], aiEnabled: true },
    (s) => lines.push(s),
  );
  assert.equal(lines.length, 1);
  assert.match(lines[0], /mode=production/);
  assert.match(lines[0], /ai=enabled/);
  passed++;
}

// logEnvSummary — ai disabled message includes the hint.
{
  const lines: string[] = [];
  logEnvSummary(
    { ok: true, isProduction: false, missing: [], aiEnabled: false },
    (s) => lines.push(s),
  );
  assert.match(lines[0], /mode=development/);
  assert.match(lines[0], /ai=disabled/);
  assert.match(lines[0], /ANTHROPIC_API_KEY/);
  passed++;
}

console.log(`PASS: env.fixture — ${passed} cases`);
