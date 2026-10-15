import { describe, expect, it } from "vitest";
import {
  HANDLES,
  HANDLE_PAD,
  HANDLE_SCREEN_PX,
  clampPoint,
  clampRect,
  defaultHotspotPlacement,
  handleCenters,
  handlePadStage,
  hitTestHandle,
  hitTestHotspots,
  hitTestPolygonEdge,
  hitTestVertex,
  insertPolygonVertex,
  moveRect,
  normalizeRect,
  pastDragThreshold,
  pointInPolygon,
  pointsEqual,
  polygonBounds,
  polygonSvgPoints,
  removePolygonVertex,
  resizeHandleTestId,
  resizeRect,
  setPolygonVertex,
  vertexHandleTestId,
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

  it("hits polygons via point-in-polygon", () => {
    const hs: Hotspot[] = [
      {
        id: "poly",
        name: "p",
        shape: { type: "polygon", points: [[0, 0], [100, 0], [100, 100]] },
      },
    ];
    expect(hitTestHotspots(hs, 10, 10)).toBe("poly");
    expect(hitTestHotspots(hs, 10, 90)).toBeNull(); // outside triangle (above hypotenuse)
  });

  it("pointInPolygon / bounds / svg points helpers", () => {
    const pts: [number, number][] = [[0, 0], [100, 0], [100, 100]];
    expect(pointInPolygon(10, 10, pts)).toBe(true);
    expect(pointInPolygon(10, 90, pts)).toBe(false);
    expect(polygonBounds(pts)).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(polygonSvgPoints(pts)).toBe("0,0 100,0 100,100");
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

describe("drag threshold + hotspot placement", () => {
  it("pastDragThreshold uses screen pixels", () => {
    const start = { clientX: 10, clientY: 10 };
    expect(pastDragThreshold(start, { clientX: 12, clientY: 10 })).toBe(false);
    expect(pastDragThreshold(start, { clientX: 14, clientY: 10 })).toBe(true);
    expect(pastDragThreshold(start, { clientX: 10, clientY: 14 })).toBe(true);
  });

  it("defaultHotspotPlacement centres first then offsets", () => {
    const res = { width: 1920, height: 1080 };
    const first = defaultHotspotPlacement([], res);
    expect(first).toEqual({
      x: Math.round((1920 - 200) / 2),
      y: Math.round((1080 - 160) / 2),
      w: 200,
      h: 160,
    });
    const hs: Hotspot[] = [
      { id: "a", name: "a", shape: { type: "rect", x: 100, y: 80, w: 200, h: 160 } },
    ];
    const second = defaultHotspotPlacement(hs, res);
    expect(second).toEqual({ x: 124, y: 104, w: 200, h: 160 });
  });
});

describe("polygon vertex editing helpers", () => {
  const quad: [number, number][] = [
    [100, 100],
    [300, 100],
    [300, 250],
    [100, 250],
  ];

  it("hitTestVertex finds corners within pad", () => {
    expect(hitTestVertex(quad, 100, 100, 8)).toBe(0);
    expect(hitTestVertex(quad, 305, 100, 8)).toBe(1);
    expect(hitTestVertex(quad, 200, 180, 8)).toBeNull();
  });

  it("setPolygonVertex / clampPoint / pointsEqual", () => {
    const moved = setPolygonVertex(quad, 1, 350.4, 90.6);
    expect(moved[1]).toEqual([350, 91]);
    expect(pointsEqual(quad, moved)).toBe(false);
    expect(pointsEqual(quad, [...quad])).toBe(true);
    expect(clampPoint(-10, 2000, { width: 1920, height: 1080 })).toEqual([0, 1080]);
  });

  it("hitTestPolygonEdge prefers mid-edge and skips near vertices", () => {
    const edge = hitTestPolygonEdge(quad, 200, 100, 10);
    expect(edge).not.toBeNull();
    expect(edge!.edgeIndex).toBe(0);
    expect(edge!.qy).toBeCloseTo(100, 0);
    // Near a vertex: skipped so vertex handle wins
    expect(hitTestPolygonEdge(quad, 102, 100, 10)).toBeNull();
  });

  it("insertPolygonVertex after edge; remove keeps ≥3", () => {
    const withMid = insertPolygonVertex(quad, 0, 200, 100);
    expect(withMid).toHaveLength(5);
    expect(withMid[1]).toEqual([200, 100]);
    expect(removePolygonVertex(quad, 0)).toHaveLength(3);
    expect(removePolygonVertex(quad.slice(0, 3), 0)).toBeNull();
    expect(removePolygonVertex(quad, 99)).toBeNull();
  });

  it("vertexHandleTestId is stable", () => {
    expect(vertexHandleTestId("rug", 2)).toBe("vertex-handle-rug-2");
  });
});
