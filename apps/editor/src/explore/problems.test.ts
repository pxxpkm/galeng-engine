import { describe, expect, it } from "vitest";
import { dispatch, emptyBus } from "./commandBus";
import { addHotspot, addItem, addSwitch, setInteraction, setOnEnter, updateHotspot } from "./commands";
import { blankExploreDoc } from "./fixture";
import { collectExploreProblems } from "./problems";
import { buildSceneCatalog } from "./sceneCatalog";

describe("explore problems", () => {
  it("warns when no hotspots", () => {
    const doc = blankExploreDoc();
    const probs = collectExploreProblems(doc);
    expect(probs.some((p) => p.key === "explore.noHotspots")).toBe(true);
  });

  it("errors on unknown switch in actions", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "desk" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("desk", { verb: "use" }, [
        { when: [], do: [{ type: "setSwitch", id: "missing", value: true }] },
      ]),
    ));
    const probs = collectExploreProblems(doc);
    expect(probs.some((p) => p.key === "explore.unknownSwitch")).toBe(true);
  });

  it("errors on dangling call scene when known set provided", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "npc" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("npc", { verb: "talk" }, [
        { when: [], do: [{ type: "call", scene: "dlg_missing" }] },
      ]),
    ));
    const probs = collectExploreProblems(doc, new Set(["room"]));
    expect(probs.some((p) => p.key === "explore.danglingSceneRef")).toBe(true);
  });

  it("accepts known switch and item", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "desk" })));
    ({ bus, doc } = dispatch(bus, doc, addSwitch({ id: "open", init: false })));
    ({ bus, doc } = dispatch(bus, doc, addItem({ id: "key", name: "key" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("desk", { verb: "look" }, [
        {
          when: [],
          do: [
            { type: "setSwitch", id: "open", value: true },
            { type: "giveItem", id: "key" },
          ],
        },
      ]),
    ));
    const probs = collectExploreProblems(doc, new Set(["room"]));
    expect(probs.filter((p) => p.severity === "error")).toHaveLength(0);
  });
});

describe("explore problems M3 dead-end call", () => {
  it("errors on empty call scene", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "npc" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("npc", { verb: "talk" }, [
        { when: [], do: [{ type: "call", scene: "" }] },
      ]),
    ));
    const probs = collectExploreProblems(doc, {
      sceneCatalog: [{ id: "dlg_ok", kind: "dialogue", hasReturn: true }],
    });
    expect(probs.some((p) => p.key === "explore.emptySceneRef")).toBe(true);
  });

  it("errors on dead-end call (dialogue without return)", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "npc" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("npc", { verb: "talk" }, [
        { when: [], do: [{ type: "call", scene: "dlg_end" }] },
      ]),
    ));
    const probs = collectExploreProblems(doc, {
      sceneCatalog: [
        { id: "room", kind: "explore" },
        { id: "dlg_end", kind: "dialogue", hasReturn: false },
        { id: "dlg_butler", kind: "dialogue", hasReturn: true },
      ],
    });
    expect(probs.some((p) => p.key === "explore.deadEndCall")).toBe(true);
  });

  it("allows call to dialogue with return", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "npc" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("npc", { verb: "talk" }, [
        { when: [], do: [{ type: "call", scene: "dlg_butler", trans: "fade_black" }] },
      ]),
    ));
    const probs = collectExploreProblems(doc, {
      sceneCatalog: [
        { id: "room", kind: "explore" },
        { id: "dlg_butler", kind: "dialogue", hasReturn: true },
      ],
    });
    expect(probs.filter((p) => p.severity === "error")).toHaveLength(0);
  });
});

describe("explore problems schema-aligned validation", () => {
  it("errors on empty say text", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "desk" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("desk", { verb: "look" }, [
        { when: [], do: [{ type: "say", text: "   " }] },
      ]),
    ));
    void bus;
    const probs = collectExploreProblems(doc);
    expect(probs.some((p) => p.key === "explore.emptySay")).toBe(true);
  });

  it("errors on non-integer hotspot coords", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(
      bus,
      doc,
      addHotspot({
        id: "desk",
        shape: { type: "rect", x: 10.5, y: 20, w: 100, h: 80 },
      }),
    ));
    void bus;
    const probs = collectExploreProblems(doc);
    expect(probs.some((p) => p.key === "explore.nonIntegerHotspot")).toBe(true);
  });
});

  it("errors on non-positive hotspot w/h", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(
      bus,
      doc,
      addHotspot({
        id: "desk",
        shape: { type: "rect", x: 10, y: 20, w: 0, h: 80 },
      }),
    ));
    void bus;
    const probs = collectExploreProblems(doc);
    expect(probs.some((p) => p.key === "explore.nonPositiveHotspot")).toBe(true);
  });

describe("explore problems catalog Next chain", () => {
  it("dlg_a -> Next -> dlg_b(return) does not flag deadEndCall", () => {
    const sceneCatalog = buildSceneCatalog([
      {
        id: "dlg_a",
        sceneKind: "dialogue",
        exit: { type: "next", goto: "dlg_b" },
      },
      {
        id: "dlg_b",
        sceneKind: "dialogue",
        exit: { type: "return" },
      },
      { id: "room", sceneKind: "explore", hotspots: [{ id: "x" }] },
    ]);
    expect(sceneCatalog.find((c) => c.id === "dlg_a")?.hasReturn).toBe(true);

    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "npc" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("npc", { verb: "talk" }, [
        { when: [], do: [{ type: "call", scene: "dlg_a" }] },
      ]),
    ));
    void bus;
    const probs = collectExploreProblems(doc, { sceneCatalog });
    expect(probs.some((p) => p.key === "explore.deadEndCall")).toBe(false);
    expect(probs.filter((p) => p.severity === "error")).toHaveLength(0);
  });
});

describe("explore problems onEnter", () => {
  it("errors on empty say in onEnter", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "desk" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setOnEnter([{ type: "say", text: "" }]),
    ));
    void bus;
    const probs = collectExploreProblems(doc);
    expect(probs.some((p) => p.key === "explore.emptySay" && p.id.includes("onEnter"))).toBe(
      true,
    );
  });

  it("errors on empty call scene in onEnter", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "desk" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setOnEnter([{ type: "call", scene: "" }]),
    ));
    void bus;
    const probs = collectExploreProblems(doc, {
      sceneCatalog: [{ id: "room", kind: "explore" }],
    });
    expect(probs.some((p) => p.key === "explore.emptySceneRef")).toBe(true);
  });

  it("errors on dangling gotoScene in onEnter", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "desk" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setOnEnter([{ type: "gotoScene", scene: "missing_room" }]),
    ));
    void bus;
    const probs = collectExploreProblems(doc, {
      sceneCatalog: [{ id: "room", kind: "explore" }],
    });
    expect(probs.some((p) => p.key === "explore.danglingSceneRef")).toBe(true);
  });

  it("unique problem ids when two empty says share a hotspot", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "desk" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("desk", { verb: "look" }, [
        {
          when: [],
          do: [
            { type: "say", text: "" },
            { type: "say", text: "   " },
          ],
        },
      ]),
    ));
    void bus;
    const empties = collectExploreProblems(doc).filter((p) => p.key === "explore.emptySay");
    expect(empties.length).toBe(2);
    expect(new Set(empties.map((p) => p.id)).size).toBe(2);
  });
});

describe("explore problems L2 when / visibleIf / enabledIf", () => {
  it("errors on unknown switch in rule.when", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "door" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("door", { verb: "open" }, [
        { when: [{ switch: "missing_sw", is: true }], do: [{ type: "say", text: "開" }] },
      ]),
    ));
    void bus;
    const probs = collectExploreProblems(doc);
    expect(probs.some((p) => p.key === "explore.unknownPredSwitch")).toBe(true);
  });

  it("errors on empty switch id in rule.when", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "door" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("door", { verb: "open" }, [
        { when: [{ switch: "  ", is: true }], do: [{ type: "say", text: "開" }] },
      ]),
    ));
    void bus;
    const probs = collectExploreProblems(doc);
    expect(probs.some((p) => p.key === "explore.emptyPredSwitch")).toBe(true);
  });

  it("errors on unknown hasItem in rule.when", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "chest" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("chest", { verb: "use" }, [
        { when: [{ hasItem: "ghost_key" }], do: [{ type: "say", text: "開" }] },
      ]),
    ));
    void bus;
    const probs = collectExploreProblems(doc);
    expect(probs.some((p) => p.key === "explore.unknownPredHasItem")).toBe(true);
  });

  it("errors on empty hasItem in visibleIf", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(
      bus,
      doc,
      addHotspot({ id: "secret", visibleIf: [{ hasItem: "" }] }),
    ));
    void bus;
    const probs = collectExploreProblems(doc);
    expect(
      probs.some((p) => p.key === "explore.emptyPredHasItem" && p.hotspotId === "secret"),
    ).toBe(true);
  });

  it("errors on unknown switch in enabledIf", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "lever" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      updateHotspot("lever", { enabledIf: [{ switch: "nope", is: false }] }),
    ));
    void bus;
    const probs = collectExploreProblems(doc);
    expect(
      probs.some((p) => p.key === "explore.unknownPredSwitch" && p.hotspotId === "lever"),
    ).toBe(true);
  });

  it("accepts known switch/hasItem in when and visibleIf; ignores var", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "door" })));
    ({ bus, doc } = dispatch(bus, doc, addSwitch({ id: "open", init: false })));
    ({ bus, doc } = dispatch(bus, doc, addItem({ id: "key", name: "key" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      updateHotspot("door", { visibleIf: [{ hasItem: "key" }] }),
    ));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("door", { verb: "open" }, [
        {
          when: [{ switch: "open", is: true }, { var: "n", eq: 1 }],
          do: [{ type: "say", text: "開咗" }],
        },
      ]),
    ));
    void bus;
    const probs = collectExploreProblems(doc, new Set(["room"]));
    expect(probs.filter((p) => p.severity === "error")).toHaveLength(0);
  });
});
