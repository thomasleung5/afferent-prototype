/* Smoke: StudySelectionGate behavior.
 *
 * Runs against the chromium-studies project (port 3102) with the
 * VITE_AUTH_TEST_FIXTURE=1 fake-session so AuthContext reports
 * configured + signed in. No sandbox flag pre-set, no active study
 * — the production no-study path. /api/studies + /api/organizations
 * are mocked at the route layer per-test.
 *
 * Cases pinned:
 *   - configured + authenticated + no study → gate is mounted
 *     instead of the home page,
 *   - picking a study from the gate clears it (home renders),
 *   - clicking "Continue in sandbox" replaces the gate with the
 *     normal app shell,
 *   - public auth routes (/login, /reset-password) remain
 *     reachable when the gate would otherwise fire — but this
 *     project's fixture always shows a session, so /login bounces
 *     to / via the existing auth gate, not the study gate. */

import { test, expect, type Route } from "@playwright/test";

const TEST_ORG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TEST_STUDY_ID = "11111111-1111-1111-1111-111111111111";

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

test.describe("Study selection gate", () => {
  test.beforeEach(async ({ page }) => {
    // Default route mocks — one org with one existing study.
    // Individual tests can override these via additional page.route()
    // calls before navigation.
    await page.route("**/api/**", async (route) => {
      await fulfillJson(route, 503, { ok: false, message: "test mock missing" });
    });
    await page.route(/\/api\/studies(\?.*)?$/, async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await fulfillJson(route, 200, {
        ok: true,
        studies: [{
          id: TEST_STUDY_ID,
          organization_id: TEST_ORG_ID,
          // Must match the store's DEFAULT_JURISDICTION_ID ("los-altos-hills")
          // — the gate filters the list client-side by activeJurisdictionId.
          jurisdiction_id: "los-altos-hills",
          name: "FY26 Fee Study",
          fiscal_year: "FY 2025-26",
          created_by: "00000000-0000-0000-0000-0000000000aa",
          created_at: "2026-05-01T00:00:00Z",
          updated_at: "2026-05-15T00:00:00Z",
          archived_at: null,
        }],
      });
    });
    await page.route("**/api/organizations", async (route) => {
      await fulfillJson(route, 200, {
        ok: true,
        organizations: [{
          id: TEST_ORG_ID,
          name: "Los Altos Hills",
          role: "owner",
          created_at: "2026-01-01T00:00:00Z",
        }],
      });
    });
  });

  test("gate mounts when authenticated + no active study + not sandbox", async ({ page }) => {
    await page.goto("/");
    // The gate's centered panel is present.
    await expect(page.getByTestId("study-selection-gate")).toBeVisible();
    await expect(page.getByText("Select a study to continue")).toBeVisible();
    // The list of existing studies should render the mock row.
    const list = page.getByTestId("study-selection-gate-list");
    await expect(list).toBeVisible();
    await expect(list.getByText("FY26 Fee Study")).toBeVisible();
    // The top-bar StudyMenu trigger reads as a gate state, NOT as a
    // "Local" save destination — covers the copy requirement in the
    // task spec.
    await expect(page.getByTestId("study-menu-trigger")).toContainText("Select study");
  });

  test("picking a study clears the gate", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("study-selection-gate-list")
      .getByRole("button", { name: /FY26 Fee Study/ })
      .click();
    // Gate is gone; the trigger flips to "Saved" (idle status,
    // active study selected, DB reachable).
    await expect(page.getByTestId("study-selection-gate")).toHaveCount(0);
    await expect(page.getByTestId("study-menu-trigger")).toContainText("Saved");
  });

  test("'Continue in sandbox' bypasses the gate without picking a study", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("study-selection-gate")).toBeVisible();
    await page.getByTestId("study-selection-gate-sandbox").click();
    // Gate detaches; the trigger reads "Sandbox" (active study still
    // null but the user has opted into the explicit ephemeral mode).
    await expect(page.getByTestId("study-selection-gate")).toHaveCount(0);
    await expect(page.getByTestId("study-menu-trigger")).toContainText("Sandbox");
  });

  test("'+ New study…' is enabled when a creatable membership is available", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("study-selection-gate-create")).toBeEnabled();
  });

  test("503 from /api/studies surfaces the 'not configured' copy in the gate", async ({ page }) => {
    await page.route(/\/api\/studies(\?.*)?$/, async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await fulfillJson(route, 503, {
        ok: false,
        message: "Study persistence is not configured on this server.",
      });
    });
    await page.goto("/");
    await expect(page.getByTestId("study-selection-gate")).toBeVisible();
    // Confirms the gate's body surfaces the not-configured branch.
    await expect(
      page.getByTestId("study-selection-gate").getByText(/Server study storage isn't (?:configured|available)/i),
    ).toBeVisible();
  });
});
