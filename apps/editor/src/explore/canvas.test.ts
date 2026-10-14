import { describe, expect, it } from "vitest";
import {
  clampRect,
  hitTestHandle,
  hitTestHotspots,
  moveRect,
  normalizeRect,
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
});
