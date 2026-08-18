import { describe, expect, it } from "vitest";
import {
  formatSaveIssues,
  projectSaveIssues,
  sceneSaveIssues,
} from "./saveIssues";
import type { Project, Scene } from "./types";

const project: Project = {
  id: "p",
  title: "P",
  startScene: "a",
  locale: "zh-Hant",
};

describe("sceneSaveIssues", () => {
  it("accepts a complete scene", () => {
    const scene: Scene = {
      id: "ok",
      beats: [
        {
          chars: [{ id: "sora", face: "smile" }],
          say: { speaker: "sora", text: "風。" },
        },
      ],
      exit: { type: "next", goto: "home_01" },
    };
    expect(sceneSaveIssues(scene)).toEqual([]);
  });

  it("lists empty say, char id, and exit fields", () => {
    const scene: Scene = {
      id: "draft",
      beats: [
        { say: { speaker: "sora", text: "" } },
        { chars: [{ id: "", face: "smile" }] },
      ],
      exit: { type: "choices", options: [{ text: "", goto: "" }] },
    };
    const keys = sceneSaveIssues(scene).map((issue) => issue.key);
    expect(keys).toEqual([
      "editor.emptySayText",
      "editor.emptyCharId",
      "editor.emptyChoiceText",
      "editor.emptyChoiceGoto",
    ]);
  });

  it("does not flag a beat with no say", () => {
    expect(sceneSaveIssues({ id: "x", beats: [{}] })).toEqual([]);
  });
});

describe("projectSaveIssues", () => {
  it("flags empty roster and gallery ids", () => {
    const issues = projectSaveIssues({
      ...project,
      characters: [{ id: "" }],
      cg: [{ id: "", asset: "cg/op" }],
    });
    expect(issues.map((issue) => issue.key)).toEqual([
      "editor.emptyRosterId",
      "editor.emptyGalleryId",
    ]);
  });
});

describe("formatSaveIssues", () => {
  it("prefixes a header and interpolates beat numbers", () => {
    const tables: Record<string, string> = {
      "editor.saveBlocked": "還不能存：",
      "editor.emptySayText": "第 {n} 格台詞是空的",
    };
    const text = formatSaveIssues([{ key: "editor.emptySayText", params: { n: 2 } }], (k) => tables[k] ?? k);
    expect(text).toBe("還不能存：\n第 2 格台詞是空的");
  });
});
