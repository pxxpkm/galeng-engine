import { test, expect } from "@playwright/test";

/**
 * Smoke: #explore without host shows boot error + retry.
 * Needs Vite (playwright webServer). Host API is not running here — boot failure
 * must show the error UI and must not mount a blank study workspace.
 * Skip when Chromium missing: PLAYWRIGHT_SKIP=1 or browsers not installed.
 */
const skipReason = (() => {
  if (process.env.PLAYWRIGHT_SKIP === "1") {
    return "PLAYWRIGHT_SKIP=1 (deferred)";
  }
  return null;
})();

test.describe("explore smoke", () => {
  test.beforeEach(({ }, testInfo) => {
    if (skipReason) testInfo.skip(true, skipReason);
  });

  test("boot failure at #explore shows error and retry, not a blank workspace", async ({
    page,
  }) => {
    await page.goto("/#explore");
    const err = page.getByTestId("explore-boot-error");
    await expect(err).toBeVisible({ timeout: 30_000 });
    await expect(err).toContainText(/載入失敗|重試/);
    await expect(page.getByTestId("explore-boot-retry")).toBeVisible();
    await expect(page.getByTestId("explore-workspace")).toHaveCount(0);
  });
});
