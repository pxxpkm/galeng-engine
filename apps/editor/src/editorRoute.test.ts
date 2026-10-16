import { describe, expect, it } from "vitest";
import {
  dialogueRouteParams,
  editorRouteFromHash,
  exploreRouteParams,
} from "./editorRoute";

describe("editorRouteFromHash", () => {
  it("maps #explore to explore", () => {
    expect(editorRouteFromHash("#explore")).toBe("explore");
    expect(editorRouteFromHash("explore")).toBe("explore");
    expect(editorRouteFromHash("#explore?scene=study")).toBe("explore");
  });

  it("maps empty / other hashes to dialogue", () => {
    expect(editorRouteFromHash("")).toBe("dialogue");
    expect(editorRouteFromHash("#")).toBe("dialogue");
    expect(editorRouteFromHash("#v2")).toBe("dialogue");
    expect(editorRouteFromHash("#dialogue?scene=x")).toBe("dialogue");
  });
});

describe("dialogueRouteParams", () => {
  it("reads scene and scripts flags", () => {
    expect(dialogueRouteParams("#dialogue?scene=dlg_butler&scripts=1")).toEqual({
      sceneId: "dlg_butler",
      openScripts: true,
    });
    expect(dialogueRouteParams("#?scene=study")).toEqual({ sceneId: "study" });
    expect(dialogueRouteParams("#explore")).toEqual({});
    expect(dialogueRouteParams("#explore?scene=study")).toEqual({});
  });
});

describe("exploreRouteParams", () => {
  it("reads scene from #explore query", () => {
    expect(exploreRouteParams("#explore?scene=study")).toEqual({ sceneId: "study" });
    expect(exploreRouteParams("#explore")).toEqual({});
    expect(exploreRouteParams("#dialogue?scene=x")).toEqual({});
  });
});
