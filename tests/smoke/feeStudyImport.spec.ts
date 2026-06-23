/* Smoke: the Quick Import banner's Fee Study upload → extract → apply
 * flow.
 *
 * Mocks /api/ai/parse-fee-study rather than depending on a real AI call.
 * The banner row must run extracted sections through the EXISTING
 * services/volume/fees/positions converters and merges — this test
 * confirms the result lands on the actual Services Catalog / Volume of
 * Activity cards below (tagged "via Fee Study extraction" in their own
 * Recent Imports), since the banner itself has no Recent Imports or
 * "Applied" summary of its own. It also confirms a server failure
 * surfaces the existing warn-toned failure message inline on the row. */

import { test, expect } from "@playwright/test";

test.describe("Source Data — Fee Study import flow", () => {
  test("extracts and applies across domains, tagged via Fee Study on the receiving cards", async ({ page }) => {
    await page.route("**/api/ai/parse-fee-study", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        // No `volume` field here deliberately — services importing a
        // brand-new service with a positive volume auto-creates a paired
        // VolumeRow with that count already filled in, which would make
        // this test's volume row land as a "duplicate" (updated) rather
        // than newly "mapped". Leaving volume off keeps the paired
        // VolumeRow's `current` null, so the items[] row below resolves
        // as a fresh, independently-mapped row.
        services: [{
          name: "Test Permit Review", dept: "PLAN", hours: 2, fee: 500, confidence: "high",
        }],
        positions: [],
        items: [{
          name: "Test Permit Review", dept: "PLAN", prior: 8, current: 10, unit: "permits", confidence: "high",
        }],
        fees: [],
      }),
    }));

    await page.goto("/source-data");

    const fileInput = page.locator("#quick-import-fee-study input[type=\"file\"]");
    await fileInput.setInputFiles({
      name: "fee-study.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 fake"),
    });

    // Cards aren't expandable — status and the upload action are visible
    // without clicking anything. Recent Imports is a collapsed disclosure;
    // click the toggle to reveal the provenance-tagged entry.
    const services = page.locator("#services");
    await expect(services.getByText(/Imported.*1\s*service/)).toBeVisible();
    await services.getByRole("button", { name: /Recent imports/ }).click();
    await expect(services.getByText("Recent imports", { exact: true })).toBeVisible();
    await expect(services.getByText(/fee-study\.pdf.*via Fee Study extraction/)).toBeVisible();

    const volume = page.locator("#volume");
    await expect(volume.getByText(/Imported.*1\s*row/)).toBeVisible();
  });

  test("surfaces a failure message when the endpoint reports an error", async ({ page }) => {
    await page.route("**/api/ai/parse-fee-study", (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        message: "AI parsing is temporarily unavailable. Please try again later.",
      }),
    }));

    await page.goto("/source-data");

    const fileInput = page.locator("#quick-import-fee-study input[type=\"file\"]");
    await fileInput.setInputFiles({
      name: "fee-study.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 fake"),
    });

    await expect(page.locator("#quick-import-fee-study").getByText(/temporarily unavailable/)).toBeVisible();
  });
});
