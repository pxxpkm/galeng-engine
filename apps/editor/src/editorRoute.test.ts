import { describe, expect, it } from "vitest";
import { dialogueRouteParams, editorRouteFromHash } from "./editorRoute";

describe("editorRouteFromHash", () => {
  it("maps #explore to explore", () => {
    expect(editorRouteFromHash("#explore")).toBe("explore");
    expect(editorRouteFromHash("explore")).toBe("explore");
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
  });
});
