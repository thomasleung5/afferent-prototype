#!/usr/bin/env node
/* Build-time guard for client env vars that get inlined into the SPA.
 *
 * VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are read by
 * lib/auth/supabaseClient.ts at build time. If they're missing during
 * `vite build`, the resulting bundle ships without Supabase credentials
 * and the deployed login page silently fails to talk to auth.
 *
 * Modes:
 *   STRICT_BUILD=1                 → missing vars → exit 1 (Docker, deploy CI)
 *   VITE_AUTH_DISABLED=1           → silent (smoke-test builds + Playwright)
 *   otherwise                       → warn to stderr, exit 0 (local dev)
 *
 * Wired as the prefix of `build:client` in package.json so every
 * production build runs it.
 */

const REQUIRED = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"];

const missing = REQUIRED.filter((k) => {
  const v = process.env[k];
  return !v || v.trim() === "";
});

if (missing.length === 0) process.exit(0);
if (process.env.VITE_AUTH_DISABLED === "1") process.exit(0);

const strict = process.env.STRICT_BUILD === "1";
const lines = [
  `Production client build is missing: ${missing.join(", ")}`,
  `The SPA bundle will not be able to talk to Supabase without these.`,
  `Set them in the build environment, or set VITE_AUTH_DISABLED=1 for test builds.`,
];
const tag = strict ? "error" : "warn";
for (const line of lines) {
  process.stderr.write(`[build-env ${tag}] ${line}\n`);
}
if (strict) process.exit(1);
