/* Smoke: the optional Fee Study card's static surface on the Source Data
 * page. Fee Study is a composite, PDF-only upload surface — not a Domain.
 * We confirm the card is marked Optional and only exposes "Upload PDF"
 * (no Excel, no Paste JSON). The upload → extract → apply flow itself is
 * covered separately in tests/smoke/feeStudyImport.spec.ts, which mocks
 * the parse endpoint rather than depending on a real AI call. */

import { test, expect } from "@playwright/test";

test.describe("Source Data — Fee Study card", () => {
  test("is optional and PDF-only", async ({ page }) => {
    await page.goto("/source-data");

    const card = page.getByRole("button", { name: /Fee Study — (expand|collapse) details/ });
    await expect(card).toBeVisible();
    await expect(card.getByText("Optional")).toBeVisible();
    await expect(card.getByText("Not Imported")).toBeVisible();

    await card.click();

    await expect(page.getByRole("button", { name: "Upload PDF" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload Excel" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Paste JSON" })).toHaveCount(0);
  });
});
