/* Smoke: Studies popover in the top bar.
 *
 * Runs against the chromium-studies project (port 3102) which mounts
 * the SPA with VITE_AUTH_TEST_FIXTURE=1 — the supabaseClient module
 * returns a synthetic signed-in session so AuthContext puts
 * `configured: true` + `session: !null` and the menu mounts.
 *
 * /api/studies and /api/organizations are mocked at the Playwright
 * route layer per-test so the suite remains hermetic — no live DB,
 * no SUPABASE_SERVICE_ROLE_KEY needed. */

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

test.describe("Studies popover", () => {
  test.beforeEach(async ({ page }) => {
    // Catch-all for any /api/* request not mocked by a specific route
    // below. Registered FIRST so the more-specific routes below win
    // (Playwright matches routes in REVERSE registration order, so
    // later route() calls take precedence).
    await page.route("**/api/**", async (route) => {
      await fulfillJson(route, 503, { ok: false, message: "test mock missing" });
    });
    // Default route mocks — happy path: the user belongs to one
    // owner org with one existing study. Individual tests can
    // override these with another page.route() before navigation.
    await page.route("**/api/studies", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await fulfillJson(route, 200, {
        ok: true,
        studies: [{
          id: TEST_STUDY_ID,
          organization_id: TEST_ORG_ID,
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

  test("Studies button is visible when a session is present", async ({ page }) => {
    await page.goto("/");
    // The trigger reads "Studies" when nothing is active, then flips
    // to the active study's name once one is selected. Using a
    // test-id keeps the assertion stable across both states (and
    // immune to the chevron suffix in the accessible name).
    await expect(page.getByTestId("study-menu-trigger")).toBeVisible();
    await expect(page.getByTestId("study-menu-trigger")).toContainText("Studies");
  });

  test("popover lists mocked studies and lets the user select one", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("study-menu-trigger").click();
    const row = page.getByRole("button", { name: /FY26 Fee Study/ });
    await expect(row).toBeVisible();
    await row.click();
    // Selecting a study flips the trigger label to the study name.
    await expect(page.getByTestId("study-menu-trigger")).toContainText("FY26 Fee Study");
  });

  test("'New study…' is enabled when a creatable membership is available", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("study-menu-trigger").click();
    // The "New study…" sub-text reads the org name from /api/organizations
    // when a creatable membership exists; this is the most specific
    // signal that the create path is wired (text + enabled state).
    await expect(page.getByText(/Create a study in Los Altos Hills/)).toBeVisible();
    const newStudy = page.getByRole("button", { name: /New study…/ });
    await expect(newStudy).toBeEnabled();
  });

  test("'New study…' disabled when only a viewer membership is available", async ({ page }) => {
    // Override the organizations mock with a viewer-only response.
    await page.route("**/api/organizations", async (route) => {
      await fulfillJson(route, 200, {
        ok: true,
        organizations: [{
          id: TEST_ORG_ID,
          name: "Los Altos Hills",
          role: "viewer",
          created_at: "2026-01-01T00:00:00Z",
        }],
      });
    });
    // Override studies to be empty so the popover shows the
    // no-studies body text and the disabled "New study…" action.
    await page.route("**/api/studies", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await fulfillJson(route, 200, { ok: true, studies: [] });
    });
    await page.goto("/");
    await page.getByTestId("study-menu-trigger").click();
    // The full empty-state sentence is unique to the no-studies body
    // — the "New study…" sub-text shares a similar fragment, so we
    // anchor to the leading "No studies yet" to scope the match.
    await expect(
      page.getByText(/No studies yet, and you don't have permission/i),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /New study…/ })).toBeDisabled();
  });

  test("503 from /api/studies surfaces 'Storage not configured' notice", async ({ page }) => {
    // 503 from either endpoint maps to the "not configured" branch.
    await page.route("**/api/studies", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await fulfillJson(route, 503, {
        ok: false,
        message: "Study persistence is not configured on this server.",
      });
    });
    await page.goto("/");
    await page.getByTestId("study-menu-trigger").click();
    await expect(page.getByText(/Server study storage isn't configured/i)).toBeVisible();
  });

  test("multi-org picker appears when the user is owner/admin/analyst in >1 org", async ({ page }) => {
    const ORG_B_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    await page.route("**/api/organizations", async (route) => {
      await fulfillJson(route, 200, {
        ok: true,
        organizations: [
          {
            id: TEST_ORG_ID,
            name: "Los Altos Hills",
            role: "owner",
            created_at: "2026-01-01T00:00:00Z",
          },
          {
            id: ORG_B_ID,
            name: "Goleta",
            role: "analyst",
            created_at: "2026-02-01T00:00:00Z",
          },
        ],
      });
    });
    await page.goto("/");
    await page.getByTestId("study-menu-trigger").click();
    // The picker is the <select> with the test-id below; absent in
    // the single-org default case.
    const picker = page.getByTestId("study-menu-create-org");
    await expect(picker).toBeVisible();
    const options = await picker.locator("option").allTextContents();
    expect(options).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Los Altos Hills"),
        expect.stringContaining("Goleta"),
      ]),
    );
  });

  test("single-org case stays hidden (no picker)", async ({ page }) => {
    // The default beforeEach mocks the single-org happy path.
    await page.goto("/");
    await page.getByTestId("study-menu-trigger").click();
    await expect(page.getByTestId("study-menu-create-org")).toHaveCount(0);
  });

  test("Versions… enters the versions view + Load triggers confirm", async ({ page }) => {
    const VERSION_ID = "44444444-4444-4444-4444-444444444444";
    // Mock the versions list endpoint that the Versions view fetches.
    await page.route(`**/api/studies/${TEST_STUDY_ID}/versions`, async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await fulfillJson(route, 200, {
        ok: true,
        versions: [{
          id: VERSION_ID,
          study_id: TEST_STUDY_ID,
          version_number: 3,
          label: "Q3 cut",
          status: "draft",
          notes: null,
          created_by: "00000000-0000-0000-0000-0000000000aa",
          created_at: "2026-06-01T00:00:00Z",
        }],
      });
    });
    await page.goto("/");
    await page.getByTestId("study-menu-trigger").click();
    // Select the mocked study so the Actions section enables. The
    // popover stays open through this click (selection happens via
    // setActiveStudy in the row's onClick; no setOpen toggle).
    await page.getByRole("button", { name: /FY26 Fee Study/ }).click();
    await page.getByRole("button", { name: /Versions…/ }).click();
    // Versions sub-view header + the version row.
    await expect(page.getByText(/Versions of FY26 Fee Study/i)).toBeVisible();
    await expect(page.getByText(/v3/)).toBeVisible();
    await expect(page.getByText(/Q3 cut/)).toBeVisible();
    // Clicking Load fires a window.confirm dialog; reject so we stay
    // local and don't actually drive loadSnapshot in the smoke.
    page.once("dialog", (d) => { void d.dismiss(); });
    await page.getByRole("button", { name: "Load", exact: true }).click();
    // After dismiss we're still in the versions view; the version
    // row remains visible.
    await expect(page.getByText(/v3/)).toBeVisible();
  });
});
