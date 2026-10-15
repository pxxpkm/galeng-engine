import { describe, expect, it } from "vitest";
import { dispatch, emptyBus } from "./commandBus";
import { addHotspot } from "./commands";
import {
  appendDrawPolygonPoint,
  canFinishDrawPolygon,
  dedupePolygonDraft,
  drawPolygonKeyAction,
  drawPolygonPreviewGeometry,
  finalizeDrawPolygonPoints,
  undoDrawPolygonPoint,
} from "./drawPolygonDraft";
import { blankExploreDoc } from "./fixture";
import { isPolygon } from "./canvas";

describe("drawPolygonDraft helpers", () => {
  it("appends and undoes points", () => {
    let pts = appendDrawPolygonPoint([], 10.4, 20.6);
    expect(pts).toEqual([[10, 21]]);
    pts = appendDrawPolygonPoint(pts, 30, 40, { width: 100, height: 100 });
    expect(pts).toEqual([
      [10, 21],
      [30, 40],
    ]);
    pts = undoDrawPolygonPoint(pts);
    expect(pts).toEqual([[10, 21]]);
    expect(undoDrawPolygonPoint([])).toEqual([]);
  });

  it("clamps append to stage bounds", () => {
    expect(
      appendDrawPolygonPoint([], -5, 999, { width: 100, height: 80 }),
    ).toEqual([[0, 80]]);
  });

  it("dedupes consecutive and closing duplicates", () => {
    expect(
      dedupePolygonDraft([
        [0, 0],
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 0],
      ]),
    ).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
  });

  it("canFinish / finalize require ≥3 unique verts", () => {
    expect(canFinishDrawPolygon([[0, 0], [1, 0]])).toBe(false);
    expect(finalizeDrawPolygonPoints([[0, 0], [1, 0]])).toBeNull();
    const tri: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
    ];
    expect(canFinishDrawPolygon(tri)).toBe(true);
    expect(finalizeDrawPolygonPoints(tri)).toEqual(tri);
    // double-click duplicate last
    expect(
      finalizeDrawPolygonPoints([
        [0, 0],
        [10, 0],
        [10, 10],
        [10, 10],
      ]),
    ).toEqual(tri);
  });

  it("preview geometry includes polyline, fill, and close edge", () => {
    const empty = drawPolygonPreviewGeometry([], { x: 5, y: 5 });
    expect(empty.polyline).toBe("5,5");
    expect(empty.closedFill).toBeNull();
    expect(empty.closeEdge).toBeNull();

    const one = drawPolygonPreviewGeometry([[0, 0]], { x: 20, y: 0 });
    expect(one.polyline).toBe("0,0 20,0");
    expect(one.closeEdge).toEqual({ x1: 20, y1: 0, x2: 0, y2: 0 });

    const two = drawPolygonPreviewGeometry(
      [
        [0, 0],
        [10, 0],
      ],
      { x: 10, y: 10 },
    );
    expect(two.closedFill).toBe("0,0 10,0 10,10");
    expect(two.closeEdge).toEqual({ x1: 10, y1: 10, x2: 0, y2: 0 });
  });

  it("key actions: Enter finish, Esc cancel, Backspace undo", () => {
    expect(
      drawPolygonKeyAction("Enter", { inEditableField: false, pointCount: 2 }),
    ).toBeNull();
    expect(
      drawPolygonKeyAction("Enter", { inEditableField: false, pointCount: 3 }),
    ).toBe("finish");
    expect(
      drawPolygonKeyAction("Escape", { inEditableField: false, pointCount: 0 }),
    ).toBe("cancel");
    expect(
      drawPolygonKeyAction("Backspace", {
        inEditableField: false,
        pointCount: 2,
      }),
    ).toBe("undoPoint");
    expect(
      drawPolygonKeyAction("Delete", {
        inEditableField: true,
        pointCount: 3,
      }),
    ).toBeNull();
  });
});

describe("drawPolygon → CommandBus addHotspot", () => {
  it("finalize points create an undoable polygon hotspot", () => {
    const pts = finalizeDrawPolygonPoints([
      [100, 100],
      [200, 100],
      [200, 200],
      [200, 200], // dblclick dup
    ]);
    expect(pts).not.toBeNull();
    let bus = emptyBus();
    let doc = blankExploreDoc();
    ({ bus, doc } = dispatch(
      bus,
      doc,
      addHotspot({
        name: "多邊形",
        shape: { type: "polygon", points: pts! },
      }),
    ));
    const hs = doc.scene.hotspots[doc.scene.hotspots.length - 1]!;
    expect(hs.name).toBe("多邊形");
    expect(isPolygon(hs.shape)).toBe(true);
    if (isPolygon(hs.shape)) {
      expect(hs.shape.points).toEqual([
        [100, 100],
        [200, 100],
        [200, 200],
      ]);
    }
    expect(doc.ui.selectedHotspotId).toBe(hs.id);
  });
});
