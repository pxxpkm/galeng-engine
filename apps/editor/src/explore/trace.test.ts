import { describe, expect, it } from "vitest";
import { dispatch, emptyBus } from "./commandBus";
import { addHotspot, addItem, setInteraction } from "./commands";
import { blankExploreDoc } from "./fixture";
import { BUILTIN_FALLBACK_TEXT, resolveTrace } from "./trace";

describe("resolveTrace", () => {
  it("wins Interaction when unconditional rule exists", () => {
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
    const r = resolveTrace(doc, "desk", { verb: "look" });
    expect(r.winningLayer).toBe("Interaction");
    expect(r.interactionConditional).toBe(false);
    expect(r.preview).toBe("舊書桌");
    expect(r.fallbackIfMiss).toBeNull();
    expect(r.chain.find((c) => c.layer === "Interaction")!.present).toBe(true);
  });

  it("falls to PerVerb when no interaction for verb", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "desk" })));
    const r = resolveTrace(doc, "desk", { verb: "take" });
    expect(r.winningLayer).toBe("PerVerb");
    expect(r.preview).toBe("拎唔到。");
    expect(r.chain.find((c) => c.layer === "ItemOnHotspot")!.applicable).toBe(false);
    expect(r.chain.find((c) => c.layer === "PerVerb")!.applicable).toBe(true);
  });

  it("falls to ItemOnHotspot for item cells without rules", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "desk" })));
    ({ bus, doc } = dispatch(bus, doc, addItem({ id: "key", name: "鎖匙" })));
    const r = resolveTrace(doc, "desk", { item: "key" });
    expect(r.winningLayer).toBe("ItemOnHotspot");
    expect(r.preview).toBe("用呢樣嘢冇效果。");
    expect(r.chain.find((c) => c.layer === "PerVerb")!.applicable).toBe(false);
    expect(r.chain.find((c) => c.layer === "ItemOnHotspot")!.applicable).toBe(true);
  });

  it("marks conditional Interaction and names fallbackIfMiss", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "door" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("door", { verb: "move" }, [
        {
          when: [{ switch: "door_open", is: true }],
          do: [{ type: "say", text: "開咗" }],
        },
      ]),
    ));
    const r = resolveTrace(doc, "door", { verb: "move" });
    expect(r.winningLayer).toBe("Interaction");
    expect(r.interactionConditional).toBe(true);
    expect(r.fallbackIfMiss).toBe("PerVerb");
    expect(r.unconditionalRuleCount).toBe(0);
  });

  it("uses Global then Builtin when perVerb missing", () => {
    let doc = blankExploreDoc();
    doc = {
      ...doc,
      project: {
        ...doc.project,
        fallback: { global: "全域。" },
      },
    };
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "wall" })));
    const r = resolveTrace(doc, "wall", { verb: "look" });
    expect(r.winningLayer).toBe("Global");
    expect(r.preview).toBe("全域。");

    doc = {
      ...doc,
      project: { ...doc.project, fallback: {} },
    };
    const r2 = resolveTrace(doc, "wall", { verb: "look" });
    expect(r2.winningLayer).toBe("Builtin");
    expect(r2.preview).toBe(BUILTIN_FALLBACK_TEXT);
  });
});
