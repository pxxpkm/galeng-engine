import { describe, expect, it } from "vitest";
import { dispatch, emptyBus } from "./commandBus";
import {
  addCharacter,
  addHotspot,
  addItem,
  addSwitch,
  setInteraction,
  setOnEnter,
  updateHotspot,
} from "./commands";
import { blankExploreDoc } from "./fixture";
import {
  confirmDeleteCharacterMessage,
  confirmDeleteHotspotMessage,
  confirmDeleteItemMessage,
  confirmDeleteSwitchMessage,
  countCharacterRefs,
  countHotspotDeleteImpact,
  countItemRefs,
  countSwitchRefs,
} from "./refCounts";

describe("refCounts", () => {
  it("counts hotspot interactions and rules", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "desk" })));
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "door" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("desk", { verb: "look" }, [
        { when: [], do: [{ type: "say", text: "a" }] },
      ]),
    ));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("desk", { verb: "take" }, [
        { when: [{ switch: "x", is: true }], do: [{ type: "say", text: "b" }] },
        { when: [], do: [{ type: "say", text: "c" }] },
      ]),
    ));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("door", { verb: "look" }, [
        { when: [], do: [{ type: "say", text: "d" }] },
      ]),
    ));
    expect(countHotspotDeleteImpact(doc, "desk")).toEqual({
      interactions: 2,
      rules: 3,
    });
    expect(countHotspotDeleteImpact(doc, "door")).toEqual({
      interactions: 1,
      rules: 1,
    });
    expect(countHotspotDeleteImpact(doc, "missing")).toEqual({
      interactions: 0,
      rules: 0,
    });
    expect(confirmDeleteHotspotMessage("desk", { interactions: 2, rules: 3 })).toContain(
      "2 個互動",
    );
    expect(confirmDeleteHotspotMessage("empty", { interactions: 0, rules: 0 })).toBe(
      "確定刪除熱區「empty」？",
    );
  });

  it("counts switch refs in when / visibleIf / setSwitch", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "door" })));
    ({ bus, doc } = dispatch(bus, doc, addSwitch({ id: "open", name: "開" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      updateHotspot("door", { visibleIf: [{ switch: "open", is: true }] }),
    ));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("door", { verb: "move" }, [
        {
          when: [{ switch: "open", is: false }],
          do: [{ type: "setSwitch", id: "open", value: true }],
        },
      ]),
    ));
    expect(countSwitchRefs(doc, "open")).toBe(3);
    expect(countSwitchRefs(doc, "other")).toBe(0);
    expect(confirmDeleteSwitchMessage("open", 3)).toBe(
      "此開關被 3 處引用，確定刪除「open」？",
    );
  });

  it("counts item refs in on.item / hasItem / giveItem / takeItem", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "chest" })));
    ({ bus, doc } = dispatch(bus, doc, addItem({ id: "key", name: "鎖匙" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("chest", { item: "key" }, [
        {
          when: [{ hasItem: "key" }],
          do: [
            { type: "takeItem", id: "key" },
            { type: "giveItem", id: "key" },
          ],
        },
      ]),
    ));
    expect(countItemRefs(doc, "key")).toBe(4); // on.item + hasItem + take + give
    expect(confirmDeleteItemMessage("key", 4)).toBe(
      "此物品被 4 處引用，確定刪除「key」？",
    );
  });

  it("counts character refs via say.speaker including onEnter", () => {
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
        { when: [], do: [{ type: "say", text: "您好", speaker: "butler" }] },
      ]),
    ));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setOnEnter([{ type: "say", text: "進門", speaker: "butler" }]),
    ));
    expect(countCharacterRefs(doc, "butler")).toBe(2);
    expect(confirmDeleteCharacterMessage("butler", 2)).toBe(
      "此角色被 2 處引用，確定刪除「butler」？",
    );
    expect(confirmDeleteCharacterMessage("x", 0)).toBe("確定刪除角色「x」？");
  });
});
