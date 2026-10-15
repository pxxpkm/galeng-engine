import { describe, expect, it } from "vitest";
import { dispatch, emptyBus } from "./commandBus";
import { addCharacter, addHotspot, addSwitch, setInteraction, updateHotspot } from "./commands";
import { blankExploreDoc } from "./fixture";
import { emptySwitchPred, isEditablePred } from "./inspectorModel";
import { hitTestHotspots, pointInPolygon } from "./canvas";

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
