/* Playwright smoke-test config.
 *
 * Two webServers in parallel, each isolated to a project so the
 * existing auth-disabled smoke suite continues to render the
 * "no-supabase" surfaces while the new StudyMenu smoke runs against
 * a fake-fixture session.
 *
 *   chromium             port 3100   VITE_AUTH_DISABLED=1
 *                                    (auth.spec / home.spec / etc.)
 *   chromium-studies     port 3102   VITE_AUTH_TEST_FIXTURE=1
 *                                    (studyMenu.spec — needs a session)
 *
 * Both still avoid any real Supabase credentials. The studies project
 * uses Playwright's route layer to mock /api/studies + /api/organizations
 * so the smoke runs without a live DB. */

import { defineConfig, devices } from "@playwright/test";

const PORT_DEFAULT = 3100;
const PORT_STUDIES = 3102;

export default defineConfig({
  testDir: "./tests/smoke",
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    actionTimeout: 10_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 800 },
  },
  webServer: [
    {
      command: `npx vite --port ${PORT_DEFAULT} --strictPort`,
      env: { VITE_AUTH_DISABLED: "1" },
      url: `http://localhost:${PORT_DEFAULT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: `npx vite --port ${PORT_STUDIES} --strictPort`,
      env: { VITE_AUTH_TEST_FIXTURE: "1" },
      url: `http://localhost:${PORT_STUDIES}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${PORT_DEFAULT}`,
      },
      // Existing auth-disabled suite runs everything except the
      // session-required StudyMenu + study-gate specs.
      testIgnore: ["**/studyMenu.spec.ts", "**/studyGate.spec.ts"],
    },
    {
      name: "chromium-studies",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${PORT_STUDIES}`,
      },
      testMatch: ["**/studyMenu.spec.ts", "**/studyGate.spec.ts"],
    },
  ],
});
