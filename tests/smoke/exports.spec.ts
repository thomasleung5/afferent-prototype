/* Smoke: Excel export button is reachable and doesn't crash.
 *
 * The Fee Schedule page surfaces ExportMenu — an Export button that
 * opens a dropdown with "Excel workbook (.xlsx)" + a PDF report
 * link. We just confirm the menu opens (the dropdown content
 * appears); we don't trigger the actual download to keep the test
 * fast and free of file-system side effects. */

import { test, expect } from "@playwright/test";

test.describe("Excel export", () => {
  test("Fee Schedule Export menu opens and lists the Excel item", async ({ page }) => {
    await page.goto("/build/fee-schedule");
    const exportBtn = page.getByRole("button", { name: "Export" }).first();
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();
    // The dropdown item; clicking it would trigger the xlsx download.
    await expect(page.getByText("Excel workbook (.xlsx)")).toBeVisible();
  });
});
