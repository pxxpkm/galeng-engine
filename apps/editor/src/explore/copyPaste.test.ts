import { describe, expect, it } from "vitest";
import { dispatch, emptyBus, patchUi, undo } from "./commandBus";
import {
  addHotspot,
  getInteractionRules,
  pasteInteraction,
  setInteraction,
} from "./commands";
import { blankExploreDoc } from "./fixture";

describe("matrix copy/paste", () => {
  it("copy → clear → paste restores rules; undo paste works", () => {
    let doc = blankExploreDoc("study");
    let bus = emptyBus();
    ({ bus, doc } = dispatch(
      bus,
      doc,
      addHotspot({ id: "a", name: "A", shape: { type: "rect", x: 0, y: 0, w: 10, h: 10 } }),
    ));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      addHotspot({ id: "b", name: "B", shape: { type: "rect", x: 20, y: 0, w: 10, h: 10 } }),
    ));
    const rules = [{ when: [], do: [{ type: "say" as const, text: "hello" }] }];
    ({ bus, doc } = dispatch(bus, doc, setInteraction("a", { verb: "look" }, rules)));

    const copied = getInteractionRules(doc, "a", { verb: "look" });
    expect(copied).toEqual(rules);
    doc = patchUi(doc, { clipboardRules: copied, selectedCell: { hotspotId: "b", on: { verb: "look" } } });

    ({ bus, doc } = dispatch(bus, doc, setInteraction("a", { verb: "look" }, [])));
    expect(getInteractionRules(doc, "a", { verb: "look" })).toEqual([]);

    ({ bus, doc } = dispatch(bus, doc, pasteInteraction("b", { verb: "look" })));
    expect(getInteractionRules(doc, "b", { verb: "look" })).toEqual(rules);

    const u = undo(bus, doc)!;
    expect(getInteractionRules(u.doc, "b", { verb: "look" })).toEqual([]);
  });
});
