import { describe, expect, it } from "vitest";
import { dispatch, emptyBus } from "./commandBus";
import {
  addHotspot,
  addItem,
  addSwitch,
  setInteraction,
  updateHotspot,
} from "./commands";
import { blankExploreDoc } from "./fixture";
import {
  EDITABLE_ACTION_TYPES,
  addAction,
  addActionToList,
  addRule,
  addWhen,
  emptyEditableAction,
  moveRule,
  getCellRules,
  isEditableAction,
  patchAction,
  patchActionInList,
  patchPred,
  removeAction,
  removeActionFromList,
  sameProjectScene,
} from "./inspectorModel";
import { setOnEnter, updateItem } from "./commands";

describe("inspectorModel", () => {
  it("patchAction say text preserves when + sibling actions", () => {
    const rules = [
      {
        when: [{ switch: "door_open", is: true } as const],
        do: [
          { type: "setSwitch" as const, id: "door_open", value: true },
          { type: "say" as const, text: "開咗。" },
          { type: "call" as const, scene: "dlg_x" },
        ],
      },
      { when: [], do: [{ type: "say" as const, text: "鎖住。" }] },
    ];
    const next = patchAction(rules, 0, 1, { type: "say", text: "門開咗啦。" });
    expect(next[0]!.when).toEqual([{ switch: "door_open", is: true }]);
    expect(next[0]!.do[0]).toEqual({ type: "setSwitch", id: "door_open", value: true });
    expect(next[0]!.do[1]).toEqual({ type: "say", text: "門開咗啦。" });
    expect(next[0]!.do[2]).toEqual({ type: "call", scene: "dlg_x" });
    expect(next[1]!.do[0]).toEqual({ type: "say", text: "鎖住。" });
    expect(isEditableAction(next[0]!.do[2]!)).toBe(true); // M3: call editable
  });

  it("addWhen / patchPred / addAction keep unsupported", () => {
    let rules: import("./types").InteractionRule[] = [
      {
        when: [{ var: "n", eq: 1 }],
        do: [{ type: "gotoScene", scene: "ending" }],
      },
    ];
    rules = addWhen(rules, 0, "door_open");
    expect(rules[0]!.when).toHaveLength(2);
    expect(rules[0]!.when[0]).toEqual({ var: "n", eq: 1 });
    rules = patchPred(rules, 0, 1, { switch: "door_open", is: false });
    expect(rules[0]!.when[1]).toEqual({ switch: "door_open", is: false });
    rules = addAction(rules, 0, "say");
    expect(rules[0]!.do[0]).toEqual({ type: "gotoScene", scene: "ending" });
    expect(rules[0]!.do[1]).toEqual({ type: "say", text: "" });
    rules = removeAction(rules, 0, 1);
    expect(rules[0]!.do).toHaveLength(1);
    expect(rules[0]!.do[0]!.type).toBe("gotoScene");
  });

  it("GUI path: edit say without wiping setSwitch+when+call (via setInteraction)", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "door", name: "門" })));
    ({ bus, doc } = dispatch(bus, doc, addSwitch({ id: "door_open", name: "開" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("door", { verb: "move" }, [
        {
          when: [{ switch: "door_open", is: true }],
          do: [
            { type: "setSwitch", id: "door_open", value: true },
            { type: "say", text: "舊文" },
            { type: "call", scene: "dlg" },
          ],
        },
      ]),
    ));
    const rules = getCellRules(doc, "door", { verb: "move" });
    const patched = patchAction(rules, 0, 1, { type: "say", text: "新文" });
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("door", { verb: "move" }, patched, "ix:door:v:move:r0:a1:say"),
    ));
    const after = getCellRules(doc, "door", { verb: "move" });
    expect(after[0]!.when).toEqual([{ switch: "door_open", is: true }]);
    expect(after[0]!.do.map((a) => a.type)).toEqual(["setSwitch", "say", "call"]);
    expect(after[0]!.do[1]).toEqual({ type: "say", text: "新文" });
  });

  it("rename hotspot via updateHotspot", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "desk", name: "desk" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      updateHotspot("desk", { name: "書桌" }, "hs-name:desk"),
    ));
    expect(doc.scene.hotspots[0]!.name).toBe("書桌");
    expect(doc.scene.hotspots[0]!.id).toBe("desk");
  });

  it("addRule creates editable empty say", () => {
    const next = addRule([]);
    expect(next).toHaveLength(1);
    expect(next[0]!.do[0]).toEqual({ type: "say", text: "" });
  });
});

describe("commandBus no-op + coalesce", () => {
  it("skips no-op setInteraction with identical rules", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "a" })));
    const rules = [{ when: [], do: [{ type: "say" as const, text: "x" }] }];
    ({ bus, doc } = dispatch(bus, doc, setInteraction("a", { verb: "look" }, rules)));
    const pastLen = bus.past.length;
    const r = dispatch(bus, doc, setInteraction("a", { verb: "look" }, rules));
    expect(r.skipped).toBe(true);
    expect(r.bus.past.length).toBe(pastLen);
  });

  it("coalesces consecutive say edits into one undo step", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "a" })));
    const key = "ix:a:v:look:r0:a0:say";
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("a", { verb: "look" }, [{ when: [], do: [{ type: "say", text: "a" }] }], key),
    ));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("a", { verb: "look" }, [{ when: [], do: [{ type: "say", text: "ab" }] }], key),
    ));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("a", { verb: "look" }, [{ when: [], do: [{ type: "say", text: "abc" }] }], key),
    ));
    // addHotspot + one coalesced setInteraction
    expect(bus.past.length).toBe(2);
    const say = doc.scene.interactions[0]!.rules[0]!.do[0]!;
    expect(say.type === "say" && say.text).toBe("abc");
  });

  it("duplicate addSwitch is no-op (not stacked)", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addSwitch({ id: "sw", name: "s" })));
    const n = bus.past.length;
    const r = dispatch(bus, doc, addSwitch({ id: "sw", name: "s" }));
    expect(r.skipped).toBe(true);
    expect(r.bus.past.length).toBe(n);
    expect(sameProjectScene(doc, r.doc)).toBe(true);
  });

  it("addItem then giveItem path keeps item id from dropdown model", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "chest" })));
    ({ bus, doc } = dispatch(bus, doc, addItem({ id: "key", name: "鎖匙" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("chest", { verb: "take" }, [
        { when: [], do: [{ type: "giveItem", id: "key" }, { type: "say", text: "拎到鎖匙。" }] },
      ]),
    ));
    const rules = getCellRules(doc, "chest", { verb: "take" });
    expect(rules[0]!.do[0]).toEqual({ type: "giveItem", id: "key" });
  });

  it("takeItem is editable and emptyEditableAction yields takeItem", () => {
    expect(EDITABLE_ACTION_TYPES).toContain("takeItem");
    expect(emptyEditableAction("takeItem")).toEqual({ type: "takeItem", id: "" });
    expect(isEditableAction({ type: "takeItem", id: "key" })).toBe(true);
    let rules: import("./types").InteractionRule[] = [
      { when: [], do: [{ type: "say", text: "" }] },
    ];
    rules = addAction(rules, 0, "takeItem");
    expect(rules[0]!.do[1]).toEqual({ type: "takeItem", id: "" });
    rules = patchAction(rules, 0, 1, { type: "takeItem", id: "key" });
    expect(rules[0]!.do[1]).toEqual({ type: "takeItem", id: "key" });
  });

  it("addItem with custom id + setOnEnter + takeItem via command bus", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addItem({ id: "key", name: "黃銅鎖匙", consumeOnUse: false })));
    expect(doc.project.items[0]).toMatchObject({ id: "key", name: "黃銅鎖匙" });
    ({ bus, doc } = dispatch(
      bus,
      doc,
      updateItem("key", { name: "鎖匙", consumeOnUse: true, icon: "items/key" }),
    ));
    expect(doc.project.items[0]).toMatchObject({
      id: "key",
      name: "鎖匙",
      consumeOnUse: true,
      icon: "items/key",
    });
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setOnEnter([{ type: "say", text: "書房入面靜悄悄。" }]),
    ));
    expect(doc.scene.onEnter).toEqual([{ type: "say", text: "書房入面靜悄悄。" }]);
    const list = addActionToList(doc.scene.onEnter ?? [], "takeItem");
    const patched = patchActionInList(list, 1, { type: "takeItem", id: "key" });
    expect(patched[1]).toEqual({ type: "takeItem", id: "key" });
    expect(removeActionFromList(patched, 1)).toHaveLength(1);
  });
});

describe("inspectorModel L5 rule order", () => {
  it("addRule inserts before trailing unconditional fallback", () => {
    const rules = [
      {
        when: [{ switch: "open", is: true } as const],
        do: [{ type: "say" as const, text: "開" }],
      },
      { when: [], do: [{ type: "say" as const, text: "鎖住" }] },
    ];
    const next = addRule(rules);
    expect(next).toHaveLength(3);
    expect(next[1]!.do[0]).toEqual({ type: "say", text: "" });
    expect(next[2]!.do[0]).toEqual({ type: "say", text: "鎖住" });
  });

  it("addRule appends when no trailing unconditional", () => {
    const rules = [
      {
        when: [{ switch: "open", is: true } as const],
        do: [{ type: "say" as const, text: "開" }],
      },
    ];
    const next = addRule(rules);
    expect(next).toHaveLength(2);
    expect(next[1]!.do[0]).toEqual({ type: "say", text: "" });
  });

  it("moveRule swaps with neighbour and no-ops at ends", () => {
    const rules = [
      { when: [], do: [{ type: "say" as const, text: "a" }] },
      { when: [], do: [{ type: "say" as const, text: "b" }] },
      { when: [], do: [{ type: "say" as const, text: "c" }] },
    ];
    expect(moveRule(rules, 0, "up")[0]!.do[0]).toEqual({ type: "say", text: "a" });
    expect(moveRule(rules, 2, "down")[2]!.do[0]).toEqual({ type: "say", text: "c" });
    expect(
      moveRule(rules, 1, "up").map((r) => (r.do[0] as { text: string }).text),
    ).toEqual(["b", "a", "c"]);
    expect(
      moveRule(rules, 0, "down").map((r) => (r.do[0] as { text: string }).text),
    ).toEqual(["b", "a", "c"]);
  });
});
