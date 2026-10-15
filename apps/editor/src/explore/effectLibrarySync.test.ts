import { describe, expect, it } from "vitest";
import { dispatch, emptyBus, undo } from "./commandBus";
import { blankExploreDoc } from "./fixture";
import { applyPreset, setTransitionDefaults } from "./presets";
import { collectExploreProblems } from "./problems";
import { addHotspot, setInteraction } from "./commands";
import {
  BUILTIN_EFFECTS,
  ensureEffectsInLibrary,
  mergeEffectLibrary,
} from "./transitions";

describe("effectLibrary sync (M6)", () => {
  it("mergeEffectLibrary adds missing builtins without overwriting", () => {
    const merged = mergeEffectLibrary(
      [{ id: "fade_black", kind: "fade", params: { ms: 999 } }],
      BUILTIN_EFFECTS,
    );
    expect(merged.find((e) => e.id === "fade_black")?.params?.ms).toBe(999);
    expect(merged.some((e) => e.id === "crossfade")).toBe(true);
  });

  it("ensureEffectsInLibrary pulls builtins for needed ids", () => {
    const lib = ensureEffectsInLibrary([], ["fade_black", "nope"]);
    expect(lib.map((e) => e.id)).toEqual(["fade_black"]);
  });

  it("fadeDefaults preset fills transitionDefaults and effectLibrary when empty", () => {
    let doc = blankExploreDoc();
    doc = {
      ...doc,
      project: {
        ...doc.project,
        transitionDefaults: undefined,
        effectLibrary: [],
      },
    };
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, applyPreset("trans.fadeDefaults")));
    expect(doc.project.transitionDefaults).toEqual({
      toDialogue: "fade_black",
      fromDialogue: "fade_black",
      gotoScene: "fade_black",
    });
    const ids = (doc.project.effectLibrary ?? []).map((e) => e.id);
    expect(ids).toContain("fade_black");
    expect(ids).toContain("crossfade");
    const u = undo(bus, doc)!;
    expect(u.doc.project.transitionDefaults).toBeUndefined();
    expect(u.doc.project.effectLibrary ?? []).toEqual([]);
  });

  it("setTransitionDefaults ensures referenced builtin exists in library", () => {
    let doc = blankExploreDoc();
    doc = {
      ...doc,
      project: { ...doc.project, effectLibrary: [], transitionDefaults: undefined },
    };
    let bus = emptyBus();
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setTransitionDefaults({ toDialogue: "crossfade" }),
    ));
    expect(doc.project.transitionDefaults?.toDialogue).toBe("crossfade");
    expect((doc.project.effectLibrary ?? []).some((e) => e.id === "crossfade")).toBe(
      true,
    );
  });

  it("unknownTrans warns when library empty and action trans is set", () => {
    let doc = blankExploreDoc();
    doc = {
      ...doc,
      project: { ...doc.project, effectLibrary: [] },
    };
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "npc" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("npc", { verb: "talk" }, [
        { when: [], do: [{ type: "call", scene: "dlg", trans: "fade_black" }] },
      ]),
    ));
    const probs = collectExploreProblems(doc, {
      sceneCatalog: [
        { id: "study", kind: "explore" },
        { id: "dlg", kind: "dialogue", hasReturn: true },
      ],
    });
    expect(probs.some((p) => p.key === "explore.unknownTrans")).toBe(true);
  });

  it("unknownTransDefault warns when defaults point outside library", () => {
    let doc = blankExploreDoc();
    doc = {
      ...doc,
      project: {
        ...doc.project,
        effectLibrary: [],
        transitionDefaults: { toDialogue: "fade_black" },
      },
    };
    const probs = collectExploreProblems(doc);
    expect(probs.some((p) => p.key === "explore.unknownTransDefault")).toBe(true);
  });
});
