import { describe, expect, it } from "vitest";
import { dispatch, emptyBus, undo } from "./commandBus";
import { addHotspot } from "./commands";
import { blankExploreDoc } from "./fixture";
import { applyPreset, setTransitionDefaults } from "./presets";
import { patchUi } from "./commandBus";

describe("presets", () => {
  it("fade defaults is single undoable command", () => {
    let doc = blankExploreDoc();
    doc = {
      ...doc,
      project: { ...doc.project, transitionDefaults: undefined },
    };
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, applyPreset("trans.fadeDefaults")));
    expect(doc.project.transitionDefaults?.toDialogue).toBe("fade_black");
    expect(bus.past).toHaveLength(1);
    const u = undo(bus, doc)!;
    expect(u.doc.project.transitionDefaults).toBeUndefined();
  });

  it("pickup preset fills take cell for selected hotspot", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "key" })));
    doc = patchUi(doc, { selectedHotspotId: "key" });
    ({ bus, doc } = dispatch(bus, doc, applyPreset("hotspot.pickup")));
    const inter = doc.scene.interactions.find(
      (i) => i.hotspot === "key" && "verb" in i.on && i.on.verb === "take",
    );
    expect(inter).toBeTruthy();
    expect(inter!.rules[0]!.do.some((a) => a.type === "giveItem")).toBe(true);
    // one undo reverts whole preset
    const beforePast = bus.past.length;
    expect(beforePast).toBeGreaterThanOrEqual(2); // addHotspot + preset
    const u = undo(bus, doc)!;
    expect(
      u.doc.scene.interactions.find(
        (i) => i.hotspot === "key" && "verb" in i.on && i.on.verb === "take",
      ),
    ).toBeUndefined();
  });

  it("callTalk preset adds call on selected cell", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "npc" })));
    doc = patchUi(doc, {
      selectedCell: { hotspotId: "npc", on: { verb: "talk" } },
      selectedHotspotId: "npc",
    });
    ({ bus, doc } = dispatch(bus, doc, applyPreset("action.callTalk")));
    const inter = doc.scene.interactions.find(
      (i) => i.hotspot === "npc" && "verb" in i.on && i.on.verb === "talk",
    );
    expect(inter!.rules[0]!.do.some((a) => a.type === "call")).toBe(true);
  });

  it("setTransitionDefaults patches fields", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setTransitionDefaults({ toDialogue: "crossfade" }),
    ));
    expect(doc.project.transitionDefaults?.toDialogue).toBe("crossfade");
    expect(doc.project.transitionDefaults?.fromDialogue).toBe("fade_black");
  });
});
