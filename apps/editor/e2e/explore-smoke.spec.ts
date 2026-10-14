import { test, expect } from "@playwright/test";

/**
 * Smoke: #explore mounts ExploreWorkspace.
 * Needs Vite (playwright webServer). Host API optional — boot error → blank study.
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

  test("loads Explore shell at #explore", async ({ page }) => {
    await page.goto("/#explore");
    await expect(page.getByTestId("explore-workspace")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("explore-topbar")).toBeVisible();
    await expect(page.getByTestId("explore-pack")).toBeVisible();
  });
});
