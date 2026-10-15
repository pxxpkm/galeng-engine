import { describe, expect, it } from "vitest";
import { canRedo, canUndo, dispatch, emptyBus, redo, undo } from "./commandBus";
import { addHotspot, setHotspotRect, setInteraction } from "./commands";
import { blankExploreDoc } from "./fixture";

describe("commandBus", () => {
  it("dispatches and undoes/redoes paired", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    expect(canUndo(bus)).toBe(false);

    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "desk", name: "書桌" })));
    expect(doc.scene.hotspots).toHaveLength(1);
    expect(canUndo(bus)).toBe(true);

    ({ bus, doc } = dispatch(
      bus,
      doc,
      setHotspotRect("desk", { x: 10, y: 20, w: 100, h: 80 }),
    ));
    const shape = doc.scene.hotspots[0]!.shape;
    expect(shape.type === "rect" && shape.x).toBe(10);

    const u = undo(bus, doc)!;
    bus = u.bus;
    doc = u.doc;
    const shape2 = doc.scene.hotspots[0]!.shape;
    expect(shape2.type === "rect" && shape2.x).toBe(860); // defaultHotspotPlacement centre

    const r = redo(bus, doc)!;
    bus = r.bus;
    doc = r.doc;
    const shape3 = doc.scene.hotspots[0]!.shape;
    expect(shape3.type === "rect" && shape3.x).toBe(10);
    expect(canRedo(bus)).toBe(false);
  });

  it("push clears redo stack", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "a" })));
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "b" })));
    const u = undo(bus, doc)!;
    bus = u.bus;
    doc = u.doc;
    expect(canRedo(bus)).toBe(true);
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "c" })));
    expect(canRedo(bus)).toBe(false);
    expect(doc.scene.hotspots.map((h) => h.id)).toEqual(["a", "c"]);
  });

  it("setInteraction sparse write and clear", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "door" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("door", { verb: "look" }, [
        { when: [], do: [{ type: "say", text: "一扇門。" }] },
      ]),
    ));
    expect(doc.scene.interactions).toHaveLength(1);
    ({ bus, doc } = dispatch(bus, doc, setInteraction("door", { verb: "look" }, [])));
    expect(doc.scene.interactions).toHaveLength(0);
  });
});
