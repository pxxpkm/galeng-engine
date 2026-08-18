import { describe, expect, it } from "vitest";
import { liveIssueContext, liveIssues, sceneLiveIssues } from "./liveIssues";
import type { AssetMeta, Project, Scene, SceneMeta } from "./types";

const assets: AssetMeta[] = [
  { logical: "bg/field", kind: "image" },
  { logical: "char/sora/smile", kind: "image" },
];

const liveScenes: SceneMeta[] = [{ id: "a" }, { id: "b" }];
const archivedScenes: SceneMeta[] = [{ id: "old_01" }];

const ctx = liveIssueContext(liveScenes, archivedScenes, assets);

const project: Project = {
  id: "p",
  title: "P",
  startScene: "a",
  locale: "zh-Hant",
};

describe("sceneLiveIssues", () => {
  it("returns empty for a clean scene", () => {
    const scene: Scene = {
      id: "a",
      beats: [
        {
          bg: { asset: "bg/field" },
          chars: [{ id: "sora", face: "smile" }],
          say: { speaker: "sora", text: "風。" },
        },
      ],
      exit: { type: "next", goto: "b" },
    };
    expect(sceneLiveIssues(scene, ctx)).toEqual([]);
  });

  it("maps empty say, dangling goto, archived goto, and missing asset to jump targets", () => {
    const scene: Scene = {
      id: "a",
      beats: [
        { say: { speaker: "sora", text: "" } },
        { bg: { asset: "bg/gone" } },
      ],
      exit: {
        type: "choices",
        options: [
          { text: "走", goto: "b" },
          { text: "舊場景", goto: "old_01" },
          { text: "迷路", goto: "ghost" },
        ],
      },
    };
    const issues = sceneLiveIssues(scene, ctx);
    expect(issues.map((issue) => issue.key)).toEqual([
      "editor.emptySayText",
      "editor.issueArchivedGoto",
      "editor.issueDanglingGoto",
      "editor.issueMissingAsset",
    ]);
    expect(issues[0].target).toEqual({ kind: "beat", sceneId: "a", beatIndex: 0 });
    expect(issues[1].target).toEqual({ kind: "exit", sceneId: "a", choiceIndex: 1 });
    expect(issues[2].target).toEqual({ kind: "exit", sceneId: "a", choiceIndex: 2 });
    expect(issues[2].params).toEqual({ goto: "ghost" });
    expect(issues[3].target).toEqual({ kind: "beat", sceneId: "a", beatIndex: 1 });
    expect(issues[3].params).toEqual({ logical: "bg/gone" });
  });

  it("does not flag empty goto as dangling (save issues already cover it)", () => {
    const scene: Scene = { id: "a", beats: [], exit: { type: "next", goto: "  " } };
    expect(sceneLiveIssues(scene, ctx).map((issue) => issue.key)).toEqual([
      "editor.emptyNextGoto",
    ]);
  });

  it("maps branch exits and beat char issues", () => {
    const scene: Scene = {
      id: "a",
      beats: [{ chars: [{ id: "", face: "smile" }] }],
      exit: { type: "branch", if: {}, then: "b", else: "ghost" },
    };
    const issues = sceneLiveIssues(scene, ctx);
    expect(issues.map((issue) => issue.key)).toEqual([
      "editor.emptyCharId",
      "editor.issueDanglingGoto",
    ]);
    expect(issues[0].target).toEqual({ kind: "beat", sceneId: "a", beatIndex: 0 });
    expect(issues[1].target).toEqual({ kind: "exit", sceneId: "a" });
  });
});

describe("liveIssues", () => {
  it("adds project-level issues without duplicating scene issues", () => {
    const sceneA: Scene = {
      id: "a",
      beats: [{ say: { speaker: "", text: "hi" } }],
      exit: { type: "next", goto: "b" },
    };
    const issues = liveIssues(
      { ...project, characters: [{ id: "" }], titleBgm: "bgm/ghost" },
      [sceneA],
      ctx,
    );
    expect(issues.map((issue) => issue.key)).toEqual([
      "editor.emptySaySpeaker",
      "editor.emptyRosterId",
      "editor.issueMissingAsset",
    ]);
    expect(issues[1].target).toEqual({ kind: "project" });
    expect(issues[2].params).toEqual({ logical: "bgm/ghost" });
    expect(issues[2].target).toEqual({ kind: "project" });
  });

  it("returns empty for a clean project", () => {
    const sceneA: Scene = { id: "a", beats: [], exit: { type: "next", goto: "b" } };
    expect(liveIssues(project, [sceneA], ctx)).toEqual([]);
  });
});
