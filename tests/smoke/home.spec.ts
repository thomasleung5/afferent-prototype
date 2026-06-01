/* Smoke: app shell + deep-link refresh.
 *
 * Runs against the dev Vite server with VITE_AUTH_DISABLED=1 set
 * (see playwright.config.ts → webServer). The auth context lands in
 * "no-supabase" mode, the route guard passes through, and the
 * TopBar's legacy "MR" stub stands in for the user chip. */

import { test, expect } from "@playwright/test";

test.describe("App shell", () => {
  test("/ renders the SPA shell + nav", async ({ page }) => {
    await page.goto("/");
    // The brand wordmark in TopBar wraps every non-export route.
    await expect(page.getByText("Afferent", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Source Data" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Build Model" })).toBeVisible();
  });

  test("direct refresh of a deep route renders the right page", async ({ page }) => {
    await page.goto("/source-data");
    // The Source Data page subtitle is unique to the route — using
    // it instead of the title text avoids collisions with the
    // "Source Data" nav link in the TopBar.
    await expect(page.getByText("Upload and manage model inputs.")).toBeVisible();
  });
});
