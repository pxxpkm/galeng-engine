import { describe, expect, it } from "vitest";
import { dispatch, emptyBus, undo } from "./commandBus";
import {
  addCharacter,
  addHotspot,
  addSwitch,
  convertHotspotToPolygon,
  setHotspotPolygonPoints,
  setInteraction,
  updateHotspot,
} from "./commands";
import { blankExploreDoc } from "./fixture";
import { emptySwitchPred, isEditablePred } from "./inspectorModel";
import { hitTestHotspots, pointInPolygon, setPolygonVertex } from "./canvas";

describe("hotspot caps M9", () => {
  it("selects polygon hotspot via hit-test", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(
      bus,
      doc,
      addHotspot({
        id: "rug",
        name: "地毯",
        shape: {
          type: "polygon",
          points: [
            [100, 100],
            [300, 100],
            [300, 250],
            [100, 250],
          ],
        },
      }),
    ));
    const hit = hitTestHotspots(doc.scene.hotspots, 200, 180);
    expect(hit).toBe("rug");
    expect(pointInPolygon(50, 50, [
      [100, 100],
      [300, 100],
      [300, 250],
      [100, 250],
    ])).toBe(false);
  });

  it("updateHotspot writes visibleIf / enabledIf switch preds", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "door" })));
    ({ bus, doc } = dispatch(bus, doc, addSwitch({ id: "open", name: "開" })));
    const vis = [emptySwitchPred("open")];
    expect(isEditablePred(vis[0]!)).toBe(true);
    ({ bus, doc } = dispatch(
      bus,
      doc,
      updateHotspot("door", { visibleIf: vis, enabledIf: [{ switch: "open", is: false }] }),
    ));
    expect(doc.scene.hotspots[0]!.visibleIf).toEqual([{ switch: "open", is: true }]);
    expect(doc.scene.hotspots[0]!.enabledIf).toEqual([{ switch: "open", is: false }]);
  });

  it("say speaker is preserved when patching text via setInteraction", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "npc" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      addCharacter({ id: "butler", display: { "zh-Hant": "管家" } }),
    ));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("npc", { verb: "talk" }, [
        { when: [], do: [{ type: "say", text: "舊", speaker: "butler" }] },
      ]),
    ));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("npc", { verb: "talk" }, [
        { when: [], do: [{ type: "say", text: "新文", speaker: "butler" }] },
      ]),
    ));
    const say = doc.scene.interactions[0]!.rules[0]!.do[0]!;
    expect(say).toEqual({ type: "say", text: "新文", speaker: "butler" });
  });
});

describe("polygon vertex command", () => {
  it("setHotspotPolygonPoints updates shape and undoes", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(
      bus,
      doc,
      addHotspot({
        id: "poly",
        shape: {
          type: "polygon",
          points: [
            [0, 0],
            [100, 0],
            [100, 100],
            [0, 100],
          ],
        },
      }),
    ));
    const next: [number, number][] = [
      [0, 0],
      [120, 10],
      [100, 100],
      [0, 100],
    ];
    ({ bus, doc } = dispatch(bus, doc, setHotspotPolygonPoints("poly", next)));
    const shape = doc.scene.hotspots[0]!.shape;
    expect(shape.type).toBe("polygon");
    if (shape.type === "polygon") expect(shape.points).toEqual(next);

    const u = undo(bus, doc)!;
    bus = u.bus;
    doc = u.doc;
    const back = doc.scene.hotspots[0]!.shape;
    expect(back.type === "polygon" && back.points[1]).toEqual([100, 0]);
  });

  it("convert rect→polygon then set points end-to-end", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(
      bus,
      doc,
      addHotspot({ id: "box", shape: { type: "rect", x: 10, y: 20, w: 80, h: 60 } }),
    ));
    ({ bus, doc } = dispatch(bus, doc, convertHotspotToPolygon("box")));
    const poly = doc.scene.hotspots[0]!.shape;
    expect(poly.type).toBe("polygon");
    if (poly.type !== "polygon") throw new Error("expected polygon");
    const edited = setPolygonVertex(poly.points, 2, 200, 200);
    ({ bus, doc } = dispatch(bus, doc, setHotspotPolygonPoints("box", edited)));
    const final = doc.scene.hotspots[0]!.shape;
    expect(final.type === "polygon" && final.points[2]).toEqual([200, 200]);
    expect(hitTestHotspots(doc.scene.hotspots, 80, 60)).toBe("box");
  });

  it("no-ops when fewer than 3 points", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(
      bus,
      doc,
      addHotspot({
        id: "poly",
        shape: { type: "polygon", points: [[0, 0], [10, 0], [10, 10]] },
      }),
    ));
    const before = structuredClone(doc.scene.hotspots[0]!.shape);
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setHotspotPolygonPoints("poly", [[0, 0], [1, 1]]),
    ));
    expect(doc.scene.hotspots[0]!.shape).toEqual(before);
  });
});
