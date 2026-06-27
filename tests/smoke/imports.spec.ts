/* Smoke: import UIs surface on the Source Data page.
 *
 * Source Data is where the PDF + Excel import buttons live on the
 * Fees source card. Cards aren't expandable — the InlineImportCard
 * (PDF upload primary) and the Excel mapping accessory are always
 * visible, no click needed.
 *
 * We don't actually upload a file — just confirm the buttons are
 * present so a future refactor that breaks the import surface fails
 * loudly. */

import { test, expect } from "@playwright/test";

test.describe("Source Data imports", () => {
  test("Fees card surfaces PDF + Excel upload buttons", async ({ page }) => {
    await page.goto("/source-data");

    // Scoped to #fees — every other source card on the page also
    // renders its own "Upload PDF" button, so an unscoped locator
    // would match more than one element.
    const fees = page.locator("#fees");
    await expect(fees.getByText("Fee Schedule", { exact: true })).toBeVisible();
    await expect(fees.getByRole("button", { name: "Upload PDF" })).toBeVisible();
    await expect(fees.getByRole("button", { name: "Upload Excel" })).toBeVisible();

    // Paste JSON (and the Advanced disclosure that hid it) is removed
    // from every source card.
    await expect(fees.getByRole("button", { name: "Paste JSON" })).toHaveCount(0);
    await expect(fees.getByText("Advanced", { exact: true })).toHaveCount(0);
  });
});
