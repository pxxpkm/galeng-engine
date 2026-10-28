import { describe, expect, it } from "vitest";
import {
  commitSceneOpen,
  dialogueRouteParams,
  dialogueStartupDecision,
  editorForScene,
  editorRouteFromHash,
  exploreRouteParams,
  inferListedSceneKind,
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

const studyExplore = [{ id: "study", sceneKind: "explore" as const }, { id: "talk", sceneKind: "dialogue" as const }];

describe("inferListedSceneKind", () => {
  it("matches explicit kind and hotspot inference", () => {
    expect(inferListedSceneKind({ sceneKind: "explore" })).toBe("explore");
    expect(inferListedSceneKind({ sceneKind: "dialogue", hotspots: [{ id: "h" }] })).toBe("dialogue");
    expect(inferListedSceneKind({ hotspots: [{ id: "h" }] })).toBe("explore");
    expect(inferListedSceneKind({})).toBe("dialogue");
    expect(editorForScene(undefined)).toBe("dialogue");
    expect(editorForScene("explore")).toBe("explore");
  });
});

describe("dialogueStartupDecision", () => {
  it("opens the explore editor for a click-room start instead of Beat 0", () => {
    expect(dialogueStartupDecision("", studyExplore, "study", true)).toEqual({
      surface: "explore",
      sceneId: "study",
    });
    expect(dialogueStartupDecision("#dialogue", studyExplore, "study", true)).toEqual({
      surface: "explore",
      sceneId: "study",
    });
    expect(dialogueStartupDecision("#dialogue", studyExplore, "study", false)).toEqual({
      surface: "explore",
      sceneId: "study",
    });
  });

  it("redirects #dialogue?scene=<exploreId> once and does not bounce", () => {
    expect(dialogueStartupDecision("#dialogue?scene=study", studyExplore, "talk", true)).toEqual({
      surface: "explore",
      sceneId: "study",
    });
    expect(dialogueStartupDecision("#dialogue?scene=study", studyExplore, "talk", false)).toEqual({
      surface: "explore",
      sceneId: "study",
    });
    expect(dialogueStartupDecision("#explore?scene=study", studyExplore, "study", true)).toBeNull();
  });

  it("keeps a dialogue deep link on the dialogue shell", () => {
    expect(dialogueStartupDecision("#dialogue?scene=talk", studyExplore, "study", true)).toEqual({
      surface: "dialogue",
      sceneId: "talk",
    });
  });

  it("does not redirect when list meta has no kind", () => {
    expect(dialogueStartupDecision("", [{ id: "study" }], "study", true)).toEqual({
      surface: "dialogue",
      sceneId: "study",
    });
  });
});

describe("commitSceneOpen", () => {
  it("does not navigate when flush throws", async () => {
    let dialogue = 0;
    let explore = 0;
    const result = await commitSceneOpen({
      surface: "explore",
      id: "study",
      flush: async () => {
        throw new Error("仍有未儲存變更，已取消離開");
      },
      openDialogue: () => {
        dialogue += 1;
      },
      openExplore: () => {
        explore += 1;
      },
    });
    expect(result).toBe("cancelled");
    expect(dialogue).toBe(0);
    expect(explore).toBe(0);
  });

  it("opens the matching shell after a clean flush", async () => {
    const opened: string[] = [];
    await expect(
      commitSceneOpen({
        surface: "explore",
        id: "study",
        flush: async () => {},
        openDialogue: (id) => opened.push(`d:${id}`),
        openExplore: (id) => opened.push(`e:${id}`),
      }),
    ).resolves.toBe("explore");
    await commitSceneOpen({
      surface: "dialogue",
      id: "talk",
      flush: async () => {},
      openDialogue: (id) => opened.push(`d:${id}`),
      openExplore: (id) => opened.push(`e:${id}`),
    });
    expect(opened).toEqual(["e:study", "d:talk"]);
  });
});
