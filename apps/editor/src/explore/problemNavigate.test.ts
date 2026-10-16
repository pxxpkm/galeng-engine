import { describe, expect, it } from "vitest";
import { dispatch, emptyBus } from "./commandBus";
import { addHotspot, setInteraction, setOnEmptyClick, setOnEnter } from "./commands";
import { blankExploreDoc } from "./fixture";
import { buildMatrix, getCell, kindOf } from "./matrix";
import {
  buildProblemMatrixKeys,
  collectExploreProblems,
  formatProblemContext,
  formatProblemsBadge,
  problemMatrixKey,
  problemNavTarget,
} from "./problems";

describe("kindOf + problem keys", () => {
  it("kindOf returns problem when flagged", () => {
    expect(kindOf([], true)).toBe("problem");
    expect(kindOf([{ when: [], do: [{ type: "say", text: "x" }] }], true)).toBe("problem");
    expect(kindOf([], false)).toBe("empty");
    expect(kindOf([{ when: [], do: [{ type: "say", text: "x" }] }], false)).toBe("filled");
  });

  it("buildMatrix marks cells with problem keys as problem", () => {
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
    const problems = collectExploreProblems(doc, {
      sceneCatalog: [{ id: "study", kind: "explore" }],
    });
    const keys = buildProblemMatrixKeys(problems);
    expect(keys.has("npc|verb:talk")).toBe(true);
    const m = buildMatrix(doc, keys);
    expect(getCell(m, "npc", { verb: "talk" })!.kind).toBe("problem");
    expect(getCell(m, "npc", { verb: "look" })!.kind).toBe("empty");
  });
});

describe("problem location helpers", () => {
  it("attaches on to interaction problems and onEnter / onEmptyClick flags", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot({ id: "door" })));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setInteraction("door", { verb: "move" }, [
        { when: [], do: [{ type: "gotoScene", scene: "missing" }] },
      ]),
    ));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setOnEnter([{ type: "say", text: "" }]),
    ));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      setOnEmptyClick([{ type: "say", text: "" }]),
    ));
    const problems = collectExploreProblems(doc, {
      sceneCatalog: [{ id: "study", kind: "explore" }, { id: "door", kind: "explore" }],
    });
    const cellProb = problems.find((p) => p.key === "explore.danglingSceneRef");
    expect(cellProb?.hotspotId).toBe("door");
    expect(cellProb?.on).toEqual({ verb: "move" });
    expect(problemMatrixKey(cellProb!)).toBe("door|verb:move");
    expect(problemNavTarget(cellProb!).kind).toBe("cell");
    expect(formatProblemContext(cellProb!)).toBe("door · 動詞 move");

    const enterProb = problems.find((p) => p.key === "explore.emptySay" && p.onEnter);
    expect(enterProb?.onEnter).toBe(true);
    expect(problemNavTarget(enterProb!).kind).toBe("onEnter");
    expect(formatProblemContext(enterProb!)).toBe("入場動作");

    const emptyProb = problems.find((p) => p.key === "explore.emptySay" && p.onEmptyClick);
    expect(emptyProb?.onEmptyClick).toBe(true);
    expect(problemNavTarget(emptyProb!).kind).toBe("onEmptyClick");
    expect(formatProblemContext(emptyProb!)).toBe("空白點擊");
  });

  it("formatProblemsBadge uses Chinese labels", () => {
    expect(formatProblemsBadge(2, 1)).toBe("錯誤 2／警告 1");
    expect(formatProblemsBadge(3, 0)).toBe("錯誤 3");
    expect(formatProblemsBadge(0, 2)).toBe("警告 2");
    expect(formatProblemsBadge(0, 0)).toBe("");
  });
});
