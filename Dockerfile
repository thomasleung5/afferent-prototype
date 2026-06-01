# Single-service deploy for the Afferent SPA + Hono API.
#
# Two-stage build:
#   1. `build` — installs ALL deps, runs the production build pipeline
#      (vite client → dist/, esbuild server bundle → dist-server/).
#      STRICT_BUILD=1 turns the missing-VITE-vars warning into a hard
#      fail so a misconfigured docker build can't ship a broken SPA.
#   2. `run`   — slim node image with only runtime dependencies and
#      the build outputs. No tsx, no TypeScript, no devDeps. Runs as
#      the non-root `node` user.
#
# Build-arg contract:
#   VITE_SUPABASE_URL       (required, baked into SPA)
#   VITE_SUPABASE_ANON_KEY  (required, baked into SPA)
#
# Run-time env contract (set when starting the container):
#   PORT                    default 8787
#   NODE_ENV                set to "production"
#   SUPABASE_URL            same project as VITE_SUPABASE_URL
#   ALLOWED_ORIGINS         comma-separated CORS / origin allowlist
#   ANTHROPIC_API_KEY       optional — when unset /api/ai/* returns 503

ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV STRICT_BUILD=1
RUN npm run build

FROM ${NODE_IMAGE} AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
USER node
EXPOSE 8787
# Container-internal healthcheck. Orchestrator-level health probes
# should hit /healthz directly on the published port; this is a
# defensive secondary in case the platform doesn't define its own.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist-server/index.mjs"]
