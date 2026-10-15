import { describe, expect, it } from "vitest";
import { dispatch, emptyBus } from "./commandBus";
import { addHotspot, convertHotspotToPolygon, convertHotspotToRect } from "./commands";
import {
  canvasContextMenuItems,
  canvasContextMenuTarget,
  convertHotspotShape,
  defaultQuadAround,
  polygonShapeToRect,
  rectCenteredAt,
  rectShapeToPolygon,
} from "./canvasContextMenu";
import { blankExploreDoc } from "./fixture";
import { hitTestHotspots } from "./canvas";

describe("canvasContextMenu helpers", () => {
  it("rectCenteredAt centres and clamps", () => {
    const r = rectCenteredAt(100, 80, { w: 40, h: 20 });
    expect(r).toEqual({ x: 80, y: 70, w: 40, h: 20 });
    const clamped = rectCenteredAt(5, 5, { w: 40, h: 20 }, { width: 100, height: 100 });
    expect(clamped.x).toBe(0);
    expect(clamped.y).toBe(0);
  });

  it("defaultQuadAround yields selectable quad", () => {
    const pts = defaultQuadAround(200, 200, { w: 100, h: 80 });
    expect(pts).toHaveLength(4);
    expect(hitTestHotspots(
      [{ id: "p", name: "p", shape: { type: "polygon", points: pts } }],
      200,
      200,
    )).toBe("p");
  });

  it("rect ↔ polygon convert helpers", () => {
    const poly = rectShapeToPolygon({ type: "rect", x: 10, y: 20, w: 30, h: 40 });
    expect(poly.points).toEqual([
      [10, 20],
      [40, 20],
      [40, 60],
      [10, 60],
    ]);
    const back = polygonShapeToRect(poly.points);
    expect(back).toEqual({ type: "rect", x: 10, y: 20, w: 30, h: 40 });
    expect(convertHotspotShape({ type: "rect", x: 0, y: 0, w: 1, h: 1 }, "rect")).toBeNull();
    expect(convertHotspotShape(poly, "polygon")).toBeNull();
  });

  it("menu items by target kind", () => {
    expect(canvasContextMenuItems({ kind: "blank", stageX: 0, stageY: 0 }).map((i) => i.id)).toEqual([
      "addRect",
      "addPolygon",
      "cancel",
    ]);
    expect(
      canvasContextMenuItems({ kind: "rect", hotspotId: "a", stageX: 0, stageY: 0 }).map((i) => i.id),
    ).toEqual(["toPolygon", "delete", "cancel"]);
    expect(
      canvasContextMenuItems({
        kind: "polygon",
        hotspotId: "a",
        stageX: 0,
        stageY: 0,
      }).map((i) => i.id),
    ).toEqual(["toRect", "delete", "cancel"]);
  });

  it("target from hit id", () => {
    const hotspots = [
      { id: "r", name: "r", shape: { type: "rect" as const, x: 0, y: 0, w: 10, h: 10 } },
      {
        id: "p",
        name: "p",
        shape: {
          type: "polygon" as const,
          points: [
            [0, 0],
            [10, 0],
            [10, 10],
          ] as [number, number][],
        },
      },
    ];
    expect(canvasContextMenuTarget(hotspots, 1, 1, null).kind).toBe("blank");
    expect(canvasContextMenuTarget(hotspots, 1, 1, "r")).toEqual({
      kind: "rect",
      hotspotId: "r",
      stageX: 1,
      stageY: 1,
    });
    expect(canvasContextMenuTarget(hotspots, 1, 1, "p").kind).toBe("polygon");
  });
});

describe("convertHotspot commands", () => {
  it("rect → polygon → rect via commands", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(
      bus,
      doc,
      addHotspot({ id: "desk", shape: { type: "rect", x: 50, y: 60, w: 100, h: 80 } }),
    ));
    ({ bus, doc } = dispatch(bus, doc, convertHotspotToPolygon("desk")));
    const poly = doc.scene.hotspots[0]!.shape;
    expect(poly.type).toBe("polygon");
    if (poly.type === "polygon") {
      expect(poly.points).toEqual([
        [50, 60],
        [150, 60],
        [150, 140],
        [50, 140],
      ]);
    }
    ({ bus, doc } = dispatch(bus, doc, convertHotspotToRect("desk")));
    expect(doc.scene.hotspots[0]!.shape).toEqual({
      type: "rect",
      x: 50,
      y: 60,
      w: 100,
      h: 80,
    });
  });
});
