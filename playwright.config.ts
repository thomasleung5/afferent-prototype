/* Playwright smoke-test config.
 *
 * Single chromium project. The dev server is started by Playwright
 * itself (webServer); auth is intentionally disabled via the
 * VITE_AUTH_DISABLED flag so the SPA mounts in "no-supabase" mode
 * regardless of what the developer has in .env.local. This keeps
 * the smoke suite deterministic and lets CI run without any
 * Supabase credentials. */

import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/smoke",
  // Smoke tests should be fast and uniform; favor low parallelism so
  // shared dev-server cold paths don't race.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    actionTimeout: 10_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    // Bind the smoke dev server to a dedicated port (3100) so a
    // developer's regular `npm run dev` on :3000 doesn't collide.
    // Only Vite runs here — the Hono API on :8787 isn't needed for
    // these tests (they verify markup renders, no /api/* calls).
    command: `npx vite --port ${PORT} --strictPort`,
    env: { VITE_AUTH_DISABLED: "1" },
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
