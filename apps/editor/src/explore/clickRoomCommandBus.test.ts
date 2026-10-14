import { describe, expect, it } from "vitest";
import { dispatch, emptyBus } from "./commandBus";
import {
  addHotspot,
  addItem,
  addSwitch,
  loadExplore,
  serializeExplore,
  setInteraction,
  setOnEnter,
  updateHotspot,
  updateItem,
  updateProject,
  updateScene,
} from "./commands";
import { blankExploreDoc } from "./fixture";
import { buildMatrix, getCell } from "./matrix";
import { collectExploreProblems } from "./problems";
import type { Command } from "./commandBus";
import type { ExploreDoc } from "./types";

/**
 * D0-A / M4: author click-room *shape* purely via CommandBus (no hand JSON as SoT).
 * Playwright not installed — this is the GUI/command golden path until E2E lands.
 */
function applyAll(doc: ExploreDoc, cmds: Command[]): ExploreDoc {
  let bus = emptyBus();
  let d = doc;
  for (const cmd of cmds) {
    ({ bus, doc: d } = dispatch(bus, d, cmd));
  }
  return d;
}

/** Command sequence that rebuilds examples/click-room study + project slice. */
export function clickRoomAuthorCommands(): Command[] {
  return [
    updateProject({ id: "click-room", title: "Click Room", startScene: "study" }),
    updateScene({
      title: "書房",
      bg: { asset: "bg/study", trans: "fade", ms: 400 },
    }),
    addSwitch({ id: "drawer_open", name: "抽屜已開", init: false }),
    addSwitch({ id: "door_open", name: "門已開", init: false }),
    addItem({
      id: "key",
      name: "黃銅鎖匙",
      icon: "items/key",
      desc: "一把舊鎖匙",
      consumeOnUse: false,
    }),
    // ensure consumeOnUse stays false via updateItem (GUI DB path)
    updateItem("key", { consumeOnUse: false, icon: "items/key" }),

    addHotspot({
      id: "desk",
      name: "書桌",
      shape: { type: "rect", x: 600, y: 500, w: 420, h: 220 },
    }),
    addHotspot({
      id: "door",
      name: "門",
      shape: { type: "rect", x: 1400, y: 180, w: 280, h: 720 },
      defaultVerb: "move",
    }),
    addHotspot({
      id: "butler",
      name: "管家",
      shape: { type: "rect", x: 200, y: 220, w: 300, h: 700 },
    }),
    addHotspot({
      id: "window",
      name: "窗",
      shape: { type: "rect", x: 100, y: 80, w: 300, h: 220 },
    }),
    updateHotspot("door", { defaultVerb: "move" }),

    setOnEnter([{ type: "say", text: "你走進書房。" }]),

    setInteraction("desk", { verb: "look" }, [
      {
        when: [{ switch: "drawer_open", is: true }],
        do: [{ type: "say", text: "抽屜開咗，裏面空咗。" }],
      },
      {
        when: [],
        do: [{ type: "say", text: "一張舊書桌，抽屜似乎可以開。" }],
      },
    ]),
    setInteraction("desk", { verb: "open" }, [
      {
        when: [{ switch: "drawer_open", is: true }],
        do: [{ type: "say", text: "已經開咗。" }],
      },
      {
        when: [],
        do: [
          { type: "setSwitch", id: "drawer_open", value: true },
          { type: "say", text: "你拉開抽屜，見到一把黃銅鎖匙。" },
        ],
      },
    ]),
    setInteraction("desk", { verb: "take" }, [
      {
        when: [{ switch: "drawer_open", is: true }],
        do: [
          { type: "giveItem", id: "key" },
          { type: "say", text: "拎到黃銅鎖匙。" },
        ],
      },
      {
        when: [],
        do: [{ type: "say", text: "抽屜仲鎖住／關住，拎唔到。" }],
      },
    ]),

    setInteraction("door", { verb: "look" }, [
      {
        when: [{ switch: "door_open", is: true }],
        do: [{ type: "say", text: "門已經開咗。" }],
      },
      { when: [], do: [{ type: "say", text: "厚重木門，落咗鎖。" }] },
    ]),
    setInteraction("door", { item: "key" }, [
      {
        when: [],
        do: [
          { type: "setSwitch", id: "door_open", value: true },
          { type: "takeItem", id: "key" },
          { type: "say", text: "鎖匙對上，門開咗。" },
        ],
      },
    ]),
    setInteraction("door", { verb: "move" }, [
      {
        when: [{ switch: "door_open", is: true }],
        do: [{ type: "gotoScene", scene: "ending", trans: "fade_black" }],
      },
      { when: [], do: [{ type: "say", text: "鎖住咗。" }] },
    ]),

    setInteraction("butler", { verb: "look" }, [
      { when: [], do: [{ type: "say", text: "管家靜靜企喺度。" }] },
    ]),
    setInteraction("butler", { verb: "talk" }, [
      {
        when: [],
        do: [{ type: "call", scene: "dlg_butler", trans: "fade_black" }],
      },
    ]),

    setInteraction("window", { verb: "look" }, [
      { when: [], do: [{ type: "say", text: "窗外係漆黑庭園。" }] },
    ]),
  ];
}

describe("M4 click-room via CommandBus (D0-A GUI/command golden)", () => {
  it("authors click-room study shape from blankExploreDoc with no hand JSON", () => {
    const doc = applyAll(blankExploreDoc("study"), clickRoomAuthorCommands());

    expect(doc.project.id).toBe("click-room");
    expect(doc.project.title).toBe("Click Room");
    expect(doc.project.startScene).toBe("study");
    expect(doc.scene.id).toBe("study");
    expect(doc.scene.title).toBe("書房");
    expect(doc.scene.bg?.asset).toBe("bg/study");
    expect(doc.scene.onEnter).toEqual([{ type: "say", text: "你走進書房。" }]);

    expect(doc.project.switches.map((s) => s.id).sort()).toEqual([
      "door_open",
      "drawer_open",
    ]);
    const key = doc.project.items.find((i) => i.id === "key");
    expect(key).toMatchObject({
      name: "黃銅鎖匙",
      icon: "items/key",
      consumeOnUse: false,
    });

    expect(doc.scene.hotspots.map((h) => h.id)).toEqual([
      "desk",
      "door",
      "butler",
      "window",
    ]);
    expect(doc.scene.hotspots.find((h) => h.id === "door")?.defaultVerb).toBe("move");

    // door × key: explicit takeItem only (no consumeOnUse dual-consume)
    const doorKey = doc.scene.interactions.find(
      (i) => i.hotspot === "door" && "item" in i.on && i.on.item === "key",
    );
    expect(doorKey?.rules).toHaveLength(1);
    expect(doorKey!.rules[0]!.do.some((a) => a.type === "takeItem" && a.id === "key")).toBe(
      true,
    );
    expect(doorKey!.rules[0]!.do.some((a) => a.type === "setSwitch" && a.id === "door_open")).toBe(
      true,
    );

    // desk take → giveItem; butler talk → call; door move → gotoScene
    expect(
      doc.scene.interactions.some(
        (i) =>
          i.hotspot === "desk" &&
          "verb" in i.on &&
          i.on.verb === "take" &&
          i.rules.some((r) => r.do.some((a) => a.type === "giveItem" && a.id === "key")),
      ),
    ).toBe(true);
    expect(
      doc.scene.interactions.some(
        (i) =>
          i.hotspot === "butler" &&
          "verb" in i.on &&
          i.on.verb === "talk" &&
          i.rules.some((r) => r.do.some((a) => a.type === "call" && a.scene === "dlg_butler")),
      ),
    ).toBe(true);
    expect(
      doc.scene.interactions.some(
        (i) =>
          i.hotspot === "door" &&
          "verb" in i.on &&
          i.on.verb === "move" &&
          i.rules.some((r) =>
            r.do.some((a) => a.type === "gotoScene" && a.scene === "ending"),
          ),
      ),
    ).toBe(true);

    expect(doc.scene.interactions).toHaveLength(9);

    const matrix = buildMatrix(doc);
    expect(getCell(matrix, "desk", { verb: "open" })!.kind).toBe("multi");
    expect(getCell(matrix, "door", { item: "key" })!.kind).toBe("filled");
    expect(getCell(matrix, "window", { verb: "look" })!.kind).toBe("filled");

    const catalog = [
      { id: "study", kind: "explore" as const },
      { id: "dlg_butler", kind: "dialogue" as const, hasReturn: true },
      { id: "ending", kind: "dialogue" as const },
    ];
    const errors = collectExploreProblems(doc, { sceneCatalog: catalog }).filter(
      (p) => p.severity === "error",
    );
    expect(errors).toEqual([]);

    const snap = serializeExplore(doc);
    const reloaded = loadExplore(snap.project, snap.scene);
    expect(JSON.stringify(reloaded.scene)).toBe(JSON.stringify(snap.scene));
    expect(JSON.stringify(reloaded.project.items)).toBe(JSON.stringify(snap.project.items));
    expect(JSON.stringify(reloaded.project.switches)).toBe(
      JSON.stringify(snap.project.switches),
    );
  });

  it("matches examples/click-room study structural shape (hotspots + interactions + onEnter)", async () => {
    const { createFsPersistApi } = await import("./persistFs");
    const { loadExploreDoc } = await import("./persist");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../examples/click-room",
    );
    const example = await loadExploreDoc(createFsPersistApi(root), "study");
    const authored = applyAll(blankExploreDoc("study"), clickRoomAuthorCommands());

    expect(authored.scene.hotspots.map((h) => h.id)).toEqual(
      example.scene.hotspots.map((h) => h.id),
    );
    expect(authored.scene.interactions).toHaveLength(example.scene.interactions.length);
    // Structural equality of interactions (order + content)
    expect(JSON.stringify(authored.scene.interactions)).toBe(
      JSON.stringify(example.scene.interactions),
    );
    expect(JSON.stringify(authored.scene.onEnter)).toBe(JSON.stringify(example.scene.onEnter));
    expect(authored.scene.bg?.asset).toBe(example.scene.bg?.asset);
    expect(authored.project.items.map((i) => i.id)).toEqual(
      example.project.items.map((i) => i.id),
    );
    expect(authored.project.items[0]?.consumeOnUse).toBeFalsy();
    expect(example.project.items[0]?.consumeOnUse).toBeFalsy();
  });
});
