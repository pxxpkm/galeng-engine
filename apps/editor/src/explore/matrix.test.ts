import { describe, expect, it } from "vitest";
import { dispatch, emptyBus } from "./commandBus";
import { addHotspot, addItem, setInteraction } from "./commands";
import { blankExploreDoc } from "./fixture";
import { buildMatrix, getCell } from "./matrix";

describe("matrix", () => {
  it("builds sparse verb×hotspot cells with fallback preview", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "desk", name: "書桌" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("desk", { verb: "look" }, [
        { when: [], do: [{ type: "say", text: "舊書桌" }] },
      ]),
    ));
    const m = buildMatrix(doc);
    expect(m.hotspotIds).toEqual(["desk"]);
    expect(m.verbColumns).toHaveLength(6);
    const look = getCell(m, "desk", { verb: "look" })!;
    expect(look.kind).toBe("filled");
    expect(look.fallbackPreview).toBeNull();
    const take = getCell(m, "desk", { verb: "take" })!;
    expect(take.kind).toBe("empty");
    expect(take.fallbackPreview).toBe("拎唔到。");
    expect(m.coverage.filled).toBe(1);
    expect(m.coverage.total).toBe(6);
  });

  it("marks multi when conditional rules", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "door" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("door", { verb: "move" }, [
        { when: [{ switch: "door_open", is: true }], do: [{ type: "say", text: "開" }] },
        { when: [], do: [{ type: "say", text: "鎖" }] },
      ]),
    ));
    const m = buildMatrix(doc);
    expect(getCell(m, "door", { verb: "move" })!.kind).toBe("multi");
  });

  it("includes item columns", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "desk" })));
    ({ bus, doc } = dispatch(bus, doc, addItem({ id: "key", name: "鎖匙" })));
    const m = buildMatrix(doc);
    expect(m.itemColumns).toEqual([{ id: "key", label: "鎖匙" }]);
    expect(getCell(m, "desk", { item: "key" })!.kind).toBe("empty");
  });
});
