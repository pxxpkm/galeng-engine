import { describe, expect, it } from "vitest";
import {
  HANDLES,
  HANDLE_SCREEN_PX,
  handlePadStage,
  resizeHandleTestId,
} from "./canvas";

/**
 * Contract for ExploreCanvas visible resize handles (no RTL — ids + pad math).
 * Selected rect hotspot must render data-testid={resizeHandleTestId(id, h)}
 * for each of HANDLES; hit pad via handlePadStage(stageW, displayW).
 */
describe("explore canvas resize handles", () => {
  it("exposes eight handles and stable test ids", () => {
    expect(HANDLES).toEqual(["nw", "ne", "sw", "se", "n", "s", "e", "w"]);
    for (const h of HANDLES) {
      expect(resizeHandleTestId("door", h)).toBe(`resize-handle-door-${h}`);
    }
  });

  it("keeps ~HANDLE_SCREEN_PX screen hit size when canvas is scaled down", () => {
    const stageW = 1920;
    const displayW = 640;
    const pad = handlePadStage(stageW, displayW);
    // pad (stage) * (display/stage) ≈ HANDLE_SCREEN_PX
    expect((pad * displayW) / stageW).toBeCloseTo(HANDLE_SCREEN_PX, 5);
    expect(pad).toBeGreaterThan(HANDLE_SCREEN_PX);
  });
});
