import { describe, expect, it } from "vitest";
import {
  HANDLES,
  HANDLE_PAD,
  HANDLE_SCREEN_PX,
  clampRect,
  handleCenters,
  handlePadStage,
  hitTestHandle,
  hitTestHotspots,
  moveRect,
  normalizeRect,
  resizeHandleTestId,
  resizeRect,
} from "./canvas";
import type { Hotspot } from "./types";

describe("canvas geometry", () => {
  it("normalizes drag rect", () => {
    expect(normalizeRect({ x: 10, y: 20 }, { x: 5, y: 8 })).toEqual({
      x: 5,
      y: 8,
      w: 5,
      h: 12,
    });
  });

  it("hit-tests later hotspot first", () => {
    const hs: Hotspot[] = [
      { id: "a", name: "a", shape: { type: "rect", x: 0, y: 0, w: 100, h: 100 } },
      { id: "b", name: "b", shape: { type: "rect", x: 50, y: 50, w: 100, h: 100 } },
    ];
    expect(hitTestHotspots(hs, 60, 60)).toBe("b");
    expect(hitTestHotspots(hs, 10, 10)).toBe("a");
  });

  it("ignores polygons for edit hit", () => {
    const hs: Hotspot[] = [
      {
        id: "poly",
        name: "p",
        shape: { type: "polygon", points: [[0, 0], [100, 0], [100, 100]] },
      },
    ];
    expect(hitTestHotspots(hs, 10, 10)).toBeNull();
  });

  it("resizes from se handle", () => {
    const r = resizeRect({ x: 10, y: 10, w: 40, h: 40 }, "se", 80, 90);
    expect(r).toEqual({ x: 10, y: 10, w: 70, h: 80 });
  });

  it("clamps and moves", () => {
    expect(clampRect({ x: -10, y: 0, w: 50, h: 50 }, { width: 100, height: 100 })).toEqual({
      x: 0,
      y: 0,
      w: 50,
      h: 50,
    });
    expect(moveRect({ x: 1, y: 2, w: 3, h: 4 }, 5, 6)).toEqual({ x: 6, y: 8, w: 3, h: 4 });
  });

  it("hits resize handles", () => {
    expect(hitTestHandle({ x: 0, y: 0, w: 100, h: 50 }, 0, 0)).toBe("nw");
    expect(hitTestHandle({ x: 0, y: 0, w: 100, h: 50 }, 100, 50)).toBe("se");
    expect(hitTestHandle({ x: 0, y: 0, w: 100, h: 50 }, 50, 25)).toBeNull();
  });

  it("rounds floats to integers (schema i32)", () => {
    expect(normalizeRect({ x: 10.4, y: 20.6 }, { x: 5.2, y: 8.1 })).toEqual({
      x: 5,
      y: 8,
      w: 5,
      h: 13,
    });
    expect(clampRect({ x: 1.2, y: 3.8, w: 10.4, h: 9.6 }, { width: 100, height: 100 })).toEqual({
      x: 1,
      y: 4,
      w: 10,
      h: 10,
    });
  });

  it("clamps w/h to at least 1", () => {
    expect(clampRect({ x: 10, y: 10, w: 0, h: -5 }, { width: 100, height: 100 })).toEqual({
      x: 10,
      y: 10,
      w: 1,
      h: 1,
    });
  });

  it("lists eight handle centers", () => {
    expect(HANDLES).toHaveLength(8);
    const centers = handleCenters({ x: 10, y: 20, w: 100, h: 40 });
    expect(centers.map((c) => c.h)).toEqual([...HANDLES]);
    expect(centers.find((c) => c.h === "se")).toEqual({ h: "se", cx: 110, cy: 60 });
    expect(centers.find((c) => c.h === "n")).toEqual({ h: "n", cx: 60, cy: 20 });
  });

  it("scales HANDLE_PAD for shrunk canvas display", () => {
    // 1920 stage shown at 640 CSS px → ~24 stage units ≈ 8 screen px
    expect(handlePadStage(1920, 640)).toBe(HANDLE_SCREEN_PX * (1920 / 640));
    expect(handlePadStage(1920, 640)).toBe(24);
    expect(handlePadStage(1920, 1920)).toBe(HANDLE_PAD);
    // default pad misses a point 16 stage-px from corner; scaled pad hits it
    const rect = { x: 0, y: 0, w: 100, h: 50 };
    expect(hitTestHandle(rect, 16, 0, HANDLE_PAD)).toBeNull();
    expect(hitTestHandle(rect, 16, 0, handlePadStage(1920, 640))).toBe("nw");
  });

  it("builds resize-handle test ids", () => {
    expect(resizeHandleTestId("desk", "se")).toBe("resize-handle-desk-se");
  });
});
