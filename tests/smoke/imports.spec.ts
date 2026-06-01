/* Smoke: import UIs surface on the Source Data page.
 *
 * Source Data is where the PDF + Excel import buttons live on the
 * Fees source card. Expanding the card reveals the InlineImportCard
 * (PDF upload primary) and the Excel mapping accessory.
 *
 * We don't actually upload a file — just confirm the buttons are
 * present so a future refactor that breaks the import surface fails
 * loudly. */

import { test, expect } from "@playwright/test";

test.describe("Source Data imports", () => {
  test("Fees card surfaces PDF + Excel upload buttons", async ({ page }) => {
    await page.goto("/source-data");

    // Each domain card collapses by default; the Fees card header is
    // a button with aria-label "Fee Schedule — expand details". Click
    // it to reveal the import affordances.
    const feesCard = page.getByRole("button", { name: /Fee Schedule — (expand|collapse) details/ });
    await expect(feesCard).toBeVisible();
    await feesCard.click();

    // The PDF upload button (primary action) and the Excel button
    // (accessory in the same row) both render once expanded.
    await expect(page.getByRole("button", { name: "Upload PDF" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload Excel" })).toBeVisible();
  });
});
