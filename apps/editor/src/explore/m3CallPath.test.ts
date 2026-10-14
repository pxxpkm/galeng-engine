import { describe, expect, it } from "vitest";
import { dispatch, emptyBus, patchUi, undo } from "./commandBus";
import { addHotspot, setInteraction } from "./commands";
import { blankExploreDoc } from "./fixture";
import {
  addAction,
  getCellRules,
  patchAction,
} from "./inspectorModel";
import { collectExploreProblems } from "./problems";
import { applyPreset } from "./presets";
import { resolveEffectiveTrans } from "./transitions";

describe("M3 Call→dialogue→Return editor path", () => {
  it("GUI can set call target and trans; effective trans uses defaults", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "butler" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("butler", { verb: "talk" }, [
        { when: [], do: [{ type: "call", scene: "" }] },
      ]),
    ));
    let rules = getCellRules(doc, "butler", { verb: "talk" });
    rules = patchAction(rules, 0, 0, {
      type: "call",
      scene: "dlg_butler",
      // omit trans → defaults
    });
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("butler", { verb: "talk" }, rules),
    ));
    const call = getCellRules(doc, "butler", { verb: "talk" })[0]!.do[0]!;
    expect(call).toEqual({ type: "call", scene: "dlg_butler" });
    expect(resolveEffectiveTrans(call, doc.project.transitionDefaults)).toBe(
      "fade_black",
    );

    const catalog = [
      { id: "room", kind: "explore" as const },
      { id: "dlg_butler", kind: "dialogue" as const, hasReturn: true },
    ];
    expect(
      collectExploreProblems(doc, { sceneCatalog: catalog }).filter(
        (p) => p.severity === "error",
      ),
    ).toHaveLength(0);
  });

  it("preset callTalk then undo removes call in one step", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "npc" })));
    doc = patchUi(doc, {
      selectedCell: { hotspotId: "npc", on: { verb: "talk" } },
    });
    const pastBefore = bus.past.length;
    ({ bus, doc } = dispatch(bus, doc, applyPreset("action.callTalk")));
    expect(bus.past.length).toBe(pastBefore + 1);
    const u = undo(bus, doc)!;
    expect(u.doc.scene.interactions).toHaveLength(0);
  });

  it("can add return action via addAction model", () => {
    let rules: import("./types").InteractionRule[] = [
      { when: [], do: [{ type: "say", text: "bye" }] },
    ];
    rules = addAction(rules, 0, "return");
    expect(rules[0]!.do[1]).toEqual({ type: "return" });
  });
});
