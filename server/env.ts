/* Production environment validation, called once at server startup.
 *
 * The downstream middlewares (origin guard, requireAuth) already
 * "fail closed" with 503s when their env vars are missing in
 * production — that protects callers but it's a bad operator
 * experience: the process appears healthy, then every /api/* call
 * returns 503 and you have to dig through logs to find the cause.
 *
 * Failing fast at boot is the better contract. If the deploy is
 * misconfigured, the container crashes before the load balancer ever
 * routes traffic to it.
 *
 * Required at runtime in production:
 *   SUPABASE_URL     — server-side JWKS verification of user tokens.
 *   ALLOWED_ORIGINS  — comma-separated origin allowlist for CORS gate.
 *
 * NOT validated here (build-time concerns inlined into the SPA bundle):
 *   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY — see
 *   scripts/checkBuildEnv.mjs. The server process can't enforce these
 *   because by the time it runs, the bundle has already been built.
 *
 * Local development is intentionally exempt: empty env + dev bypass
 * via .env.local + AUTH_DEV_BYPASS=1 stays a single-line setup. */

export interface EnvValidationResult {
  ok: boolean;
  isProduction: boolean;
  missing: string[];
  aiEnabled: boolean;
}

const PROD_REQUIRED = ["SUPABASE_URL", "ALLOWED_ORIGINS"] as const;

/** Pure check — accepts a snapshot of the env so fixtures can drive it
 *  without touching process.env. */
export function validateEnv(env: NodeJS.ProcessEnv): EnvValidationResult {
  const isProduction = env.NODE_ENV === "production";
  const missing = isProduction
    ? PROD_REQUIRED.filter((k) => {
        const v = env[k];
        return !v || v.trim() === "";
      })
    : [];
  const aiKey = env.ANTHROPIC_API_KEY;
  return {
    ok: missing.length === 0,
    isProduction,
    missing,
    aiEnabled: Boolean(aiKey && aiKey.trim() !== ""),
  };
}

/** Crash the process with a readable message if the validation failed.
 *  Idempotent — a passing result is a no-op so this is safe to call
 *  unconditionally at startup. */
export function ensureValidOrExit(
  r: EnvValidationResult,
  err: (s: string) => void = (s) => process.stderr.write(s + "\n"),
  exit: (code: number) => never = (code) => process.exit(code) as never,
): void {
  if (r.ok) return;
  err(`[server] missing required production env vars: ${r.missing.join(", ")}`);
  err(`[server] set them in the deployment environment before starting the server.`);
  err(`[server] for local development use NODE_ENV=development + AUTH_DEV_BYPASS=1 in .env.local.`);
  exit(1);
}

/** One-line startup summary so operators can confirm AI status without
 *  scraping logs. Goes to stdout (not the structured log stream) so
 *  it shows up in container/process logs even before the request
 *  logger boots. */
export function logEnvSummary(
  r: EnvValidationResult,
  log: (s: string) => void = (s) => process.stdout.write(s + "\n"),
): void {
  const mode = r.isProduction ? "production" : "development";
  const ai = r.aiEnabled
    ? "enabled"
    : "disabled (ANTHROPIC_API_KEY unset — /api/ai/* will return not-configured)";
  log(`[server] mode=${mode} ai=${ai}`);
}
