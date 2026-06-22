/* Smoke: the Fee Study card's upload → extract → apply flow.
 *
 * Mocks /api/ai/parse-fee-study rather than depending on a real AI call.
 * The card must run extracted sections through the EXISTING
 * services/volume/fees/positions converters and merges — this test
 * confirms the resulting per-domain summary renders, and that a server
 * failure surfaces the existing warn-toned failure message (no new
 * failure UI). */

import { test, expect } from "@playwright/test";

test.describe("Source Data — Fee Study import flow", () => {
  test("extracts and applies across domains via a mocked endpoint", async ({ page }) => {
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
    const card = page.getByRole("button", { name: /Fee Study — (expand|collapse) details/ });
    await card.click();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "fee-study.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 fake"),
    });

    await expect(page.getByText("Applied", { exact: true })).toBeVisible();
    await expect(page.getByText(/services:\s*1\s*new/i)).toBeVisible();
    await expect(page.getByText(/volume:\s*1\s*new/i)).toBeVisible();

    await expect(page.getByText("Recent imports", { exact: true })).toBeVisible();
    await expect(page.getByText("fee-study.pdf")).toBeVisible();
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
    const card = page.getByRole("button", { name: /Fee Study — (expand|collapse) details/ });
    await card.click();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "fee-study.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 fake"),
    });

    await expect(page.getByText(/temporarily unavailable/)).toBeVisible();
  });
});
