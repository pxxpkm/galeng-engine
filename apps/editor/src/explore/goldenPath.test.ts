import { describe, expect, it } from "vitest";
import { dispatch, emptyBus, undo } from "./commandBus";
import {
  addHotspot,
  addItem,
  addSwitch,
  loadExplore,
  serializeExplore,
  setInteraction,
} from "./commands";
import { blankExploreDoc } from "./fixture";
import { buildMatrix, getCell } from "./matrix";
import { collectExploreProblems } from "./problems";

/**
 * Golden path (logic-level, no Playwright yet):
 * new room → 4 hotspots → sparse matrix fills → db stubs → serialize → reload consistent → undo pair.
 */
describe("M2 golden path", () => {
  it("new → four hotspots → sparse matrix → save/reload → undo", () => {
    let doc = blankExploreDoc("study");
    let bus = emptyBus();

    for (const [id, name, rect] of [
      ["desk", "書桌", { x: 600, y: 500, w: 420, h: 220 }],
      ["door", "門", { x: 1400, y: 180, w: 280, h: 720 }],
      ["butler", "管家", { x: 200, y: 220, w: 300, h: 700 }],
      ["lamp", "燈", { x: 900, y: 100, w: 120, h: 180 }],
    ] as const) {
      ({ bus, doc } = dispatch(
        bus,
        doc,
        addHotspot({ id, name, shape: { type: "rect", ...rect } }),
      ));
    }
    expect(doc.scene.hotspots).toHaveLength(4);

    ({ bus, doc } = dispatch(bus, doc, addSwitch({ id: "door_open", name: "門已開", init: false })));
    ({ bus, doc } = dispatch(bus, doc, addItem({ id: "key", name: "黃銅鎖匙" })));

    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("desk", { verb: "look" }, [
        { when: [], do: [{ type: "say", text: "一張舊書桌。" }] },
      ]),
    ));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("desk", { item: "key" }, [
        {
          when: [],
          do: [
            { type: "setSwitch", id: "door_open", value: true },
            { type: "say", text: "鎖匙對上咗。" },
          ],
        },
      ]),
    ));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("butler", { verb: "talk" }, [
        { when: [], do: [{ type: "call", scene: "dlg_butler" }] },
      ]),
    ));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("door", { verb: "move" }, [
        {
          when: [{ switch: "door_open", is: true }],
          do: [{ type: "gotoScene", scene: "ending" }],
        },
        { when: [], do: [{ type: "say", text: "鎖住咗。" }] },
      ]),
    ));

    const matrix = buildMatrix(doc);
    expect(getCell(matrix, "desk", { verb: "look" })!.kind).toBe("filled");
    expect(getCell(matrix, "desk", { verb: "take" })!.kind).toBe("empty");
    expect(getCell(matrix, "door", { verb: "move" })!.kind).toBe("multi");
    expect(matrix.coverage.filled).toBeLessThan(matrix.coverage.total);

    const known = new Set(["study", "dlg_butler", "ending"]);
    const errors = collectExploreProblems(doc, known).filter((p) => p.severity === "error");
    expect(errors).toHaveLength(0);

    const snap = serializeExplore(doc);
    const reloaded = loadExplore(snap.project, snap.scene);
    expect(reloaded.scene.hotspots.map((h) => h.id)).toEqual([
      "desk",
      "door",
      "butler",
      "lamp",
    ]);
    expect(reloaded.scene.interactions).toHaveLength(4);
    expect(reloaded.project.items[0]?.id).toBe("key");
    expect(JSON.stringify(reloaded.scene)).toBe(JSON.stringify(snap.scene));

    const beforeUndo = doc.scene.interactions.length;
    const u = undo(bus, doc)!;
    expect(u.doc.scene.interactions.length).toBe(beforeUndo - 1);
  });
});
