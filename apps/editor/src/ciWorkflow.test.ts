import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

// Q02. The editor production build runs after a frozen install.
// Playwright, two-tab, and slow-network checks stay out of this workflow.
// Push stays on master only.
describe("ci editor build", () => {
  const yml = readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8");

  it("builds the editor after install and leaves push on master", () => {
    const installAt = yml.indexOf("pnpm install --frozen-lockfile");
    const buildAt = yml.indexOf("pnpm --filter @galeng/editor build");
    expect(installAt).toBeGreaterThanOrEqual(0);
    expect(buildAt).toBeGreaterThan(installAt);
    expect(yml).toMatch(/branches:\s*\[master\]/);
    expect(yml).not.toMatch(/playwright/i);
    expect(yml).not.toMatch(/branches:\s*\[[^\]]*work/);
  });
});
