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

  it("callTalk with no catalog does not write a call or dlg_butler", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "npc" })));
    doc = patchUi(doc, {
      selectedCell: { hotspotId: "npc", on: { verb: "talk" } },
      selectedHotspotId: "npc",
    });
    ({ bus, doc } = dispatch(bus, doc, applyPreset("action.callTalk")));
    const actions = doc.scene.interactions.flatMap((i) => i.rules.flatMap((r) => r.do));
    expect(actions.some((a) => a.type === "call")).toBe(false);
    expect(JSON.stringify(doc)).not.toContain("dlg_butler");
  });

  it("callTalk uses the first dialogue catalog entry that has return", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "npc" })));
    doc = patchUi(doc, {
      selectedCell: { hotspotId: "npc", on: { verb: "talk" } },
      selectedHotspotId: "npc",
    });
    const catalog = [
      { id: "study", kind: "explore" as const },
      { id: "dlg_dead", kind: "dialogue" as const, hasReturn: false },
      { id: "dlg_guest", kind: "dialogue" as const, hasReturn: true },
      { id: "dlg_later", kind: "dialogue" as const, hasReturn: true },
    ];
    ({ bus, doc } = dispatch(bus, doc, applyPreset("action.callTalk", catalog)));
    const inter = doc.scene.interactions.find(
      (i) => i.hotspot === "npc" && "verb" in i.on && i.on.verb === "talk",
    );
    const call = inter!.rules[0]!.do.find((a) => a.type === "call");
    expect(call).toMatchObject({ type: "call", scene: "dlg_guest" });
    expect(JSON.stringify(doc)).not.toContain("dlg_butler");
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
