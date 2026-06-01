/* Smoke: auth pages render.
 *
 * Auth is intentionally disabled (VITE_AUTH_DISABLED=1 in
 * playwright.config.ts) so the SPA mounts without redirecting. We
 * just verify /login and /reset-password are reachable, render the
 * expected affordances, and the recovery toggle works.
 *
 * The signed-in redirect path is covered by the server-side
 * auth.fixture.ts (which exercises the /api/* auth gate end-to-end).
 *
 * Titles on the login/reset pages are styled divs (no h1 role), so
 * we lean on form controls + the "not configured" banner — both
 * unique to those pages in this test mode. */

import { test, expect } from "@playwright/test";

test.describe("Auth pages", () => {
  test("/login renders the sign-in form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    // The exact-text submit button. There's also a secondary
    // "Back to sign in" toggle once you switch to recovery mode,
    // hence the strict button-role match.
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Forgot password?" })).toBeVisible();
  });

  test("forgot-password toggle swaps the form into recovery mode", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByRole("button", { name: "Send recovery email" })).toBeVisible();
    // The password input disappears in recovery mode.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });

  test("/reset-password renders without throwing", async ({ page }) => {
    // No recovery hash — the page mounts in the "checking" phase,
    // then flips to "expired" after a few seconds when no Supabase
    // session lands. We don't wait for that here; the important
    // assertion is the route mounted at all. In not-configured
    // mode the page surfaces the explicit "Authentication isn't
    // configured" warning box.
    await page.goto("/reset-password");
    await expect(page.getByText(/Authentication isn't configured/i)).toBeVisible();
  });
});
