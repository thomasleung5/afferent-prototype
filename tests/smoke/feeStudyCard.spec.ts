/* Smoke: the Fee Study and Cost Allocation Plan source cards on the
 * Source Data page. Both render through the same SourceCardShell as
 * every other source — title, description, import status, Upload PDF
 * action, no Excel or Paste JSON (PDF-only sources) — distinct only in
 * being marked "Optional". The upload → extract → apply flow itself is
 * covered separately in tests/smoke/feeStudyImport.spec.ts, which mocks
 * the parse endpoint rather than depending on a real AI call. */

import { test, expect } from "@playwright/test";

test.describe("Source Data — Fee Study and CAP cards", () => {
  test("Fee Study card is upload-only with no Excel or Paste JSON", async ({ page }) => {
    await page.goto("/source-data");

    const card = page.locator("#fee-study");
    await expect(card).toBeVisible();
    await expect(card.getByText("Fee Study")).toBeVisible();
    await expect(card.getByText("Optional")).toBeVisible();
    await expect(card.getByText(/Populates.*Services Catalog/)).toBeVisible();
    await expect(card.getByText("Not Imported")).toBeVisible();
    await expect(card.getByRole("button", { name: "Upload PDF" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Upload Excel" })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Paste JSON" })).toHaveCount(0);
  });

  test("CAP card is upload-only with no Excel or Paste JSON", async ({ page }) => {
    await page.goto("/source-data");

    const card = page.locator("#cap");
    await expect(card).toBeVisible();
    await expect(card.getByText("Cost Allocation Plan")).toBeVisible();
    await expect(card.getByText("Optional")).toBeVisible();
    await expect(card.getByText(/Indirect cost methodology/)).toBeVisible();
    await expect(card.getByText("Not Imported")).toBeVisible();
    await expect(card.getByRole("button", { name: "Upload PDF" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Upload Excel" })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Paste JSON" })).toHaveCount(0);
  });

  test("required sources are not marked Optional", async ({ page }) => {
    await page.goto("/source-data");

    await expect(page.locator("#services").getByText("Optional")).toHaveCount(0);
    await expect(page.locator("#volume").getByText("Optional")).toHaveCount(0);
  });
});
