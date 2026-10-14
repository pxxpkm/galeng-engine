import { describe, expect, it } from "vitest";
import { dispatch, emptyBus } from "./commandBus";
import { addHotspot, addItem, addSwitch, setInteraction } from "./commands";
import { blankExploreDoc } from "./fixture";
import { collectExploreProblems } from "./problems";

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
