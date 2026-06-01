#!/usr/bin/env bash
#
# Production smoke for the compiled Afferent server.
#
# Boots `dist-server/index.mjs` with the production env contract and
# verifies /healthz responds 2xx. Optionally exercises /api/studies
# when a bearer token is provided via SMOKE_BEARER, which is the
# closest you can get to a live end-to-end check without driving
# the browser. Secrets stay outside the repo — pass them in via env
# and the script never logs them.
#
# Usage:
#   # Local (no Docker) — uses your local `node` runtime and the
#   # existing dist/ + dist-server/ build artifacts.
#   npm run build
#   SUPABASE_URL=https://<project>.supabase.co \
#   SUPABASE_SERVICE_ROLE_KEY=<service-role secret> \
#   ALLOWED_ORIGINS=http://localhost:8789 \
#     ./scripts/prod-smoke.sh
#
#   # With an authenticated study check:
#   SMOKE_BEARER=<user-access-token> \
#   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ALLOWED_ORIGINS=... \
#     ./scripts/prod-smoke.sh
#
#   # Override the port (defaults to 8789 so it doesn't fight a
#   # local `npm start` on 8787):
#   PORT=8790 ./scripts/prod-smoke.sh
#
# The script will FAIL fast if SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
# / ALLOWED_ORIGINS aren't set — the server's env validator now
# requires them in production builds (server/env.ts).

set -euo pipefail

PORT="${PORT:-8789}"
BIN="dist-server/index.mjs"
LOG="/tmp/afferent-prod-smoke.log"

# Required by the prod env validator.
require_env() {
  local var="$1"
  if [[ -z "${!var:-}" ]]; then
    echo "error: $var is required (server/env.ts treats it as required in NODE_ENV=production)." >&2
    exit 1
  fi
}
require_env SUPABASE_URL
require_env SUPABASE_SERVICE_ROLE_KEY
require_env ALLOWED_ORIGINS

if [[ ! -f "$BIN" ]]; then
  echo "error: $BIN not found. Run \`npm run build\` first." >&2
  exit 1
fi

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "[prod-smoke] starting $BIN on :$PORT"
NODE_ENV=production PORT="$PORT" node "$BIN" > "$LOG" 2>&1 &
SERVER_PID=$!

# Wait for /healthz to come up. The env validator now fails fast at
# boot when SUPABASE_SERVICE_ROLE_KEY is unset, so a misconfigured
# deploy exits in the first second and the loop below shouldn't loop.
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf "http://127.0.0.1:$PORT/healthz" > /dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[prod-smoke] server exited during boot. tail of log:" >&2
    tail -20 "$LOG" >&2
    exit 1
  fi
  sleep 0.5
done

# Final /healthz assert (won't loop a second time if the loop above
# already succeeded).
HEALTH_BODY="$(curl -sf "http://127.0.0.1:$PORT/healthz" || true)"
if [[ -z "$HEALTH_BODY" ]]; then
  echo "[prod-smoke] /healthz did not respond within ~5s" >&2
  tail -20 "$LOG" >&2
  exit 1
fi
echo "[prod-smoke] /healthz ok: $HEALTH_BODY"

# Optional: /api/studies with a real bearer token. The Origin
# header must be in the deploy's ALLOWED_ORIGINS list, so we use
# the first allowed origin from the env var for the request.
if [[ -n "${SMOKE_BEARER:-}" ]]; then
  ORIGIN="${ALLOWED_ORIGINS%%,*}"
  echo "[prod-smoke] GET /api/studies (Origin: $ORIGIN) with bearer …"
  STATUS=$(curl -sf -o /tmp/afferent-prod-smoke-studies.json -w "%{http_code}" \
    -H "Authorization: Bearer $SMOKE_BEARER" \
    -H "Origin: $ORIGIN" \
    "http://127.0.0.1:$PORT/api/studies" \
    || echo "000")
  echo "[prod-smoke] /api/studies status: $STATUS"
  if [[ "$STATUS" != "200" ]]; then
    echo "[prod-smoke] body:"
    cat /tmp/afferent-prod-smoke-studies.json
    echo
    echo "[prod-smoke] /api/studies did not return 200." >&2
    exit 1
  fi
  echo "[prod-smoke] /api/studies ok"
else
  echo "[prod-smoke] SMOKE_BEARER unset — skipping /api/studies auth round-trip."
fi

echo "[prod-smoke] PASS"
