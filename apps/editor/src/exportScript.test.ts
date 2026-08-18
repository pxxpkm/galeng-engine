import { describe, expect, it } from "vitest";
import park01 from "../../../examples/prologue/scenario/park_01.json";
import home01 from "../../../examples/prologue/scenario/home_01.json";
import { exportAllScenes, exportScene, joinExportTexts } from "./exportScript";
import type { Scene } from "./types";

describe("exportScene", () => {
  it("projects park_01 to the 06-style script", () => {
    const text = exportScene(park01 as Scene);
    expect(text.startsWith("\uFEFF")).toBe(false);
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain("# park_01 — 公園・午後");
    expect(text).toContain("@scene park_01");
    expect(text).toContain("@bg park_afternoon fade 500");
    expect(text).toContain("@char sora center face=smile");
    expect(text).toContain("@bgm park fade 800");
    expect(text).toContain("@se breeze");
    expect(text).toContain("sora: 今天風真好。 [voice=voice/sora/001]");
    expect(text).toContain("@cg op_still");
    expect(text).toContain("sora: 要不要一起走走？ [voice=voice/sora/002] face=blush");
    expect(text).toContain("@choice");
    expect(text).toContain("  一起走吧 -> park_02 { sora_affection += 1 }");
    expect(text).toContain("  該回去了 -> home_01");
  });

  it("exports home_01 as an ending with no goto", () => {
    const text = exportScene(home01 as Scene);
    expect(text).toContain("# home_01 — 結局");
    expect(text).toContain("@bg home fade 400");
    expect(text).toContain("sora: 那就下次再出來吧。");
    expect(text).not.toContain("@choice");
    expect(text).not.toContain("@goto");
  });

  it("emits next and bgm stop", () => {
    const text = exportScene({
      id: "x",
      beats: [{ bgm: { asset: null, fadeMs: 200 } }],
      exit: { type: "next", goto: "y" },
    });
    expect(text).toContain("@bgm stop fade 200");
    expect(text).toContain("@goto y");
  });

  it("emits @wait and @shake", () => {
    const text = exportScene({
      id: "f",
      beats: [
        { fx: { type: "wait", ms: 500 } },
        { fx: { type: "shake", ms: 300 } },
      ],
    });
    expect(text).toContain("@wait 500");
    expect(text).toContain("@shake 300");
  });

  it("emits @movie", () => {
    const text = exportScene({
      id: "m",
      beats: [{ movie: { asset: "movie/op" } }],
    });
    expect(text).toContain("@movie op");
  });

  it("emits # label before the beat body", () => {
    const text = exportScene({
      id: "n",
      beats: [{ label: "過場", say: { speaker: "sora", text: "hi" } }],
    });
    expect(text).toContain("# 過場");
    expect(text.indexOf("# 過場")).toBeLessThan(text.indexOf("sora: hi"));
  });

  it("emits @cg off when closed", () => {
    const text = exportScene({
      id: "c",
      beats: [{ cg: null }],
    });
    expect(text).toContain("@cg off");
  });

  it("appends if on a choice line", () => {
    const text = exportScene({
      id: "g",
      beats: [],
      exit: {
        type: "choices",
        options: [{ text: "秘密", goto: "x", if: { flag: { gte: 1 } } }],
      },
    });
    expect(text).toContain("  秘密 -> x if flag gte 1");
  });
});

describe("exportAllScenes", () => {
  it("emits one file per scene, sorted by id", () => {
    const files = exportAllScenes([park01 as Scene, home01 as Scene]);
    expect(files.map((f) => f.id)).toEqual(["home_01", "park_01"]);
    expect(files[0]?.text).toContain("@scene home_01");
    expect(files[1]?.text).toContain("@scene park_01");
    const joined = joinExportTexts(files);
    expect(joined).toContain("@scene home_01");
    expect(joined).toContain("@scene park_01");
    expect(joined.indexOf("@scene home_01")).toBeLessThan(joined.indexOf("@scene park_01"));
  });
});
