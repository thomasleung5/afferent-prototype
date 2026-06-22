/* Smoke: the Quick Import banner's Fee Study and CAP rows on the Source
 * Data page. Both are upload-only accelerants (no expand/collapse, no
 * Excel, no Paste JSON) — distinct from the individual source cards
 * below. The upload → extract → apply flow itself is covered separately
 * in tests/smoke/feeStudyImport.spec.ts, which mocks the parse endpoint
 * rather than depending on a real AI call. */

import { test, expect } from "@playwright/test";

test.describe("Source Data — Quick Import banner", () => {
  test("Fee Study row is upload-only with no Excel or Paste JSON", async ({ page }) => {
    await page.goto("/source-data");

    const row = page.locator("#quick-import-fee-study");
    await expect(row).toBeVisible();
    await expect(row.getByText("Fee Study")).toBeVisible();
    await expect(row.getByText(/Populates:.*Services Catalog/)).toBeVisible();
    await expect(row.getByRole("button", { name: "Upload PDF" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Upload Excel" })).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Paste JSON" })).toHaveCount(0);
  });

  test("CAP row is upload-only with no Excel or Paste JSON", async ({ page }) => {
    await page.goto("/source-data");

    const row = page.locator("#quick-import-cap");
    await expect(row).toBeVisible();
    await expect(row.getByText("Cost Allocation Plan")).toBeVisible();
    await expect(row.getByText(/Populates:.*indirect cost methodology/)).toBeVisible();
    await expect(row.getByRole("button", { name: "Upload PDF" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Upload Excel" })).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Paste JSON" })).toHaveCount(0);
  });

  test("neither row appears as a card in the required-sources grid", async ({ page }) => {
    await page.goto("/source-data");

    await expect(page.getByRole("button", { name: /Fee Study — (expand|collapse) details/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Cost Allocation Plan — (expand|collapse) details/ })).toHaveCount(0);
  });
});
